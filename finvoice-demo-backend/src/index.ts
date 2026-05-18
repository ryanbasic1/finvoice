import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { PrismaClient, Prisma } from "@prisma/client";
import { parseText, parseMultiText } from "./utils/nlp.js";
import { categorize } from "./utils/categorize.js";
import { requiredSip } from "./utils/sip.js";
import path from "node:path";
import { fileURLToPath } from "node:url";
// PDF report
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import PDFDocument from "pdfkit";
import https from "node:https";

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

// Development-friendly Content Security Policy to allow local fonts/styles/scripts.
// In production you should tighten this policy appropriately.
app.use((req, res, next) => {
  try {
    const isProd = process.env.NODE_ENV === 'production';
    if (isProd) {
      // Restrictive policy for production (adjust as needed)
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'"
      );
    } else {
      // More permissive for local development and static files served from the same origin
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval' http: https:; style-src 'self' 'unsafe-inline' http: https:; font-src 'self' data: http: https:; img-src 'self' data: blob:; connect-src 'self' http: https: ws:"
      );
    }
  } catch (e) {
    // ignore header errors
  }
  next();
});

// Ensure demo data exists and capture IDs at startup
let DEMO_USER_ID: string;
let DEMO_ACCOUNT_ID: string;
const DEMO_SALARY_AMOUNT = 80000; // Rs 80k monthly default
const DEMO_SALARY_DAY = 1;        // credited on 1st of month

async function ensureDemo() {
  const user = await prisma.user.upsert({
    where: { email: "demo@finvoice.test" },
    update: {},
    create: { email: "demo@finvoice.test", displayName: "Demo User" },
  });
  const account = await prisma.account.upsert({
    where: { id: "acc_cash_demo" },
    update: {},
    create: { id: "acc_cash_demo", userId: user.id, type: "cash", displayName: "Cash" },
  });
  DEMO_USER_ID = user.id;
  DEMO_ACCOUNT_ID = account.id;
}

// Helpers for monthly bounds and salary enforcement
function monthBounds(date: Date) {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth(); // 0-based
  const from = new Date(Date.UTC(y, m, 1, 0, 0, 0));
  const to = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
  return { from, to, y, m };
}

async function ensureSalaryForMonth(date: Date) {
  const { from, to, y, m } = monthBounds(date);
  // Already has a salary credit for this month? (seeded or auto)
  const exists = await prisma.transaction.findFirst({
    where: {
      userId: DEMO_USER_ID,
      date: { gte: from, lte: to },
      direction: 'credit',
      OR: [
        { source: { in: ['salary_auto', 'seed'] } },
        { merchantRaw: { contains: 'salary' } },
        { description: { contains: 'salary' } },
      ],
    },
  });
  if (exists) return exists;
  // Create one on configured day
  const creditDate = new Date(Date.UTC(y, m, Math.max(1, Math.min(DEMO_SALARY_DAY, 28)), 12, 0, 0));
  const incomeCat = await prisma.category.findUnique({ where: { name: 'Income' } }).catch(() => null);
  return prisma.transaction.create({
    data: {
      accountId: DEMO_ACCOUNT_ID,
      userId: DEMO_USER_ID,
      date: creditDate,
      amount: new Prisma.Decimal(-DEMO_SALARY_AMOUNT),
      currency: 'INR',
      description: 'Monthly salary',
      merchantRaw: 'salary',
      direction: 'credit',
      categoryId: incomeCat?.id ?? null,
      source: 'salary_auto',
    }
  });
}

async function monthlyTotals(date: Date) {
  const { from, to } = monthBounds(date);
  const txns = await prisma.transaction.findMany({ where: { userId: DEMO_USER_ID, date: { gte: from, lte: to } } });
  const income = txns.filter(t => t.direction === 'credit' || Number(t.amount) < 0).reduce((s, t) => s + Math.abs(Number(t.amount)), 0);
  const expenses = txns.filter(t => t.direction === 'debit' && Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  return { income, expenses, remaining: income - expenses };
}

async function assertCanSpend(amount: number, date: Date) {
  await ensureSalaryForMonth(date);
  const { remaining } = await monthlyTotals(date);
  if (amount > remaining) {
    throw new Error(`Insufficient monthly balance. Remaining: Rs ${remaining.toFixed(2)}`);
  }
}

// Health check
app.get("/health", (_req, res) => res.json({ ok: true }));

// Create transaction directly (manual form)
app.post("/transactions", async (req, res) => {
  try {
    const schema = z.object({
      accountId: z.string().default(DEMO_ACCOUNT_ID),
      date: z.string().datetime(),
      amount: z.number().positive(),
      currency: z.string().default("INR"),
      description: z.string().optional(),
      merchantRaw: z.string().optional(),
      source: z.string().default("manual"),
    });

  const input = schema.parse(req.body);
  // Prevent overspending and ensure salary present
  await assertCanSpend(input.amount, new Date(input.date));
    const catName = categorize(input.description, input.merchantRaw);
    const category = await prisma.category.findUnique({
      where: { name: catName },
    });

  const txn = await prisma.transaction.create({
      data: {
        accountId: input.accountId,
        userId: DEMO_USER_ID,
        date: new Date(input.date),
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency,
        description: input.description,
        merchantRaw: input.merchantRaw,
        categoryId: category?.id ?? null,
        source: input.source,
      },
    });

    res.json(txn);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Voice/text ingest: parse + create expense
app.post("/voice/add", async (req, res) => {
  try {
    const body = z.object({ text: z.string().min(2) }).parse(req.body);
    // support multi-item sentences
    const parsedList = parseMultiText(body.text);
    const created: any[] = [];
    for (const parsed of parsedList) {
      if (!parsed.entities.amount) continue; // skip if no amount for this chunk
    const when = new Date(parsed.entities.datetime);
    // Ensure monthly salary and check balance
    await assertCanSpend(parsed.entities.amount, when);
      const catName = categorize(parsed.entities.merchant, parsed.entities.merchant);
      const category = await prisma.category.findUnique({ where: { name: catName } });
      const txn = await prisma.transaction.create({
        data: {
          accountId: DEMO_ACCOUNT_ID,
          userId: DEMO_USER_ID,
      date: when,
          amount: new Prisma.Decimal(parsed.entities.amount),
          currency: parsed.entities.currency || "INR",
          description: parsed.entities.merchant,
          merchantRaw: parsed.entities.merchant,
          categoryId: category?.id ?? null,
          source: "voice",
        },
      });
      created.push(txn);
    }
    if (created.length === 0) return res.status(400).json({ error: 'No amounts detected.' });
    res.json({ parsed: parsedList, created });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Alias for expense/add
app.post("/expense/add", async (req, res) => {
  try {
    const body = z.object({ text: z.string().min(2) }).parse(req.body);
    // support multi-item sentences for expense/add as well
    const parsedList = parseMultiText(body.text);
    const created: any[] = [];
    for (const parsed of parsedList) {
      if (!parsed.entities.amount) continue;
    const when = new Date(parsed.entities.datetime);
    await assertCanSpend(parsed.entities.amount, when);
      const catName = categorize(parsed.entities.merchant, parsed.entities.merchant);
      const category = await prisma.category.findUnique({ where: { name: catName } });
      const txn = await prisma.transaction.create({
        data: {
          accountId: DEMO_ACCOUNT_ID,
          userId: DEMO_USER_ID,
      date: when,
          amount: new Prisma.Decimal(parsed.entities.amount),
          currency: parsed.entities.currency || "INR",
          description: parsed.entities.merchant,
          merchantRaw: parsed.entities.merchant,
          categoryId: category?.id ?? null,
          source: "voice",
        },
      });
      created.push(txn);
    }
    if (created.length === 0) return res.status(400).json({ error: 'No amounts detected.' });
    res.json({ parsed: parsedList, created });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// List latest 50 transactions
app.get("/transactions", async (req, res) => {
  const q = z
    .object({
      limit: z.string().optional(),
      offset: z.string().optional(),
      month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
      category: z.string().optional(),
      sort: z.enum(["amount_asc", "amount_desc", "date_desc", "date_asc"]).optional(),
      minAmount: z.string().optional(),
      maxAmount: z.string().optional(),
    })
    .safeParse(req.query);

  const limit = q.success && q.data.limit ? Math.min(100, Math.max(1, parseInt(q.data.limit))) : 5;
  const offset = q.success && q.data.offset ? Math.max(0, parseInt(q.data.offset)) : 0;

  const where: Prisma.TransactionWhereInput = {};
  if (q.success && q.data.month) {
    const [y, m] = q.data.month.split("-").map((s) => parseInt(s, 10));
    const from = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    where.date = { gte: from, lte: to };
  }
  if (q.success && q.data.category) {
    where.category = { is: { name: q.data.category } };
  }
  if (q.success && q.data.minAmount) {
    const min = Number(q.data.minAmount);
    if (!isNaN(min)) (where as any).amount = { ...(where as any).amount, gte: min };
  }
  if (q.success && q.data.maxAmount) {
    const max = Number(q.data.maxAmount);
    if (!isNaN(max)) (where as any).amount = { ...(where as any).amount, lte: max };
  }

  let orderBy: Prisma.TransactionOrderByWithRelationInput = { date: "desc" };
  if (q.success && q.data.sort) {
    if (q.data.sort === "amount_asc") orderBy = { amount: "asc" } as any;
    else if (q.data.sort === "amount_desc") orderBy = { amount: "desc" } as any;
    else if (q.data.sort === "date_asc") orderBy = { date: "asc" };
    else orderBy = { date: "desc" };
  }

  const txns = await prisma.transaction.findMany({
    where,
    orderBy,
    skip: offset,
    take: limit,
    include: { category: true },
  });
  res.json(txns);
});

app.delete("/transactions/:id", async (req, res) => {
  try {
    const id = z.string().parse(req.params.id);
    await prisma.transaction.delete({ where: { id } });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// List categories for filter UI
app.get("/categories", async (_req, res) => {
  const cats = await prisma.category.findMany({ orderBy: { name: "asc" } });
  res.json(cats);
});

// Insights summary for a given month YYYY-MM
app.get("/insights/summary", async (req, res) => {
  const q = z
    .object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() })
    .safeParse(req.query);

  let where: Prisma.TransactionWhereInput | undefined = undefined;
  // If a specific month is requested, ensure salary exists for that month (demo behavior)
  if (q.success && q.data.month) {
    const [yearStr, monthStr] = q.data.month.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10);
    const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    where = { date: { gte: from, lte: to } };
    try { await ensureSalaryForMonth(from); } catch (e) { /* ignore */ }
  }

  const txns = await prisma.transaction.findMany({
    where,
    include: { category: true },
  });

  const income = txns
    .filter((t) => t.direction === "credit" || Number(t.amount) < 0)
    .reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  const expenses = txns
    .filter((t) => t.direction === "debit" && Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);

  const byCategory: Record<string, number> = {};
  for (const t of txns) {
    if (t.direction === "debit" && Number(t.amount) > 0) {
      const name = t.category?.name || "Uncategorized";
      byCategory[name] = (byCategory[name] || 0) + Number(t.amount);
    }
  }

  const remaining = income - expenses;
  const spentPct = income > 0 ? expenses / income : 0;
  const summary = {
    income,
    expenses,
    savingsRate: income > 0 ? (income - expenses) / income : 0,
    remaining,
    nearingLimit: income > 0 && spentPct >= 0.9 && spentPct < 1,
    overLimit: income > 0 && spentPct >= 1,
    byCategory: Object.entries(byCategory).map(([name, amount]) => ({
      name,
      amount,
    })),
  };
  res.json(summary);
});

// Goals + SIP helper
app.post("/goals/required-sip", (req, res) => {
  try {
    const body = z
      .object({
        targetAmount: z.number().positive(),
        months: z.number().int().positive(),
        annualRatePct: z.number().positive().default(12),
      })
      .parse(req.body);

    const A = requiredSip(body.targetAmount, body.annualRatePct, body.months);
    res.json({ monthlySip: Math.round(A) });
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Add monthly income
app.post("/income/add", async (req, res) => {
  try {
    const body = z
      .object({
        amount: z.number().positive(),
        date: z.string().datetime().optional(),
        description: z.string().optional(),
      })
      .parse(req.body);

    const txn = await prisma.transaction.create({
      data: {
        accountId: DEMO_ACCOUNT_ID,
        userId: DEMO_USER_ID,
        date: body.date ? new Date(body.date) : new Date(),
        amount: new Prisma.Decimal(-body.amount), // income stored as negative
        currency: "INR",
        description: body.description || "Monthly income",
        merchantRaw: body.description || "income",
        categoryId: null,
        source: "manual",
        direction: "credit",
      },
    });
    res.json(txn);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

// Monthly PDF report
app.get("/reports/monthly-pdf", async (req, res) => {
  const q = z
    .object({ month: z.string().regex(/^\d{4}-\d{2}$/) })
    .safeParse(req.query);
  if (!q.success) return res.status(400).send("Use ?month=YYYY-MM");

  const [yStr, mStr] = q.data.month.split("-");
  const year = parseInt(yStr, 10);
  const month = parseInt(mStr, 10);
  const from = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const to = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const txns = await prisma.transaction.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "asc" },
    include: { category: true },
  });

  const incomeTotal = txns.filter(t=> t.direction==='credit' || Number(t.amount)<0).reduce((s,t)=> s + Math.abs(Number(t.amount)), 0);
  const expenseTotal = txns.filter(t=> t.direction==='debit' && Number(t.amount)>0).reduce((s,t)=> s + Number(t.amount), 0);
  const savings = incomeTotal - expenseTotal;

  const byCategory: Record<string, number> = {};
  for (const t of txns) {
    if (t.direction === 'debit' && Number(t.amount) > 0) {
      const name = t.category?.name || 'Uncategorized';
      byCategory[name] = (byCategory[name] || 0) + Number(t.amount);
    }
  }
  const unwantedCats = new Set(["Entertainment", "Shopping", "Uncategorized"]);
  const unwantedTotal = Object.entries(byCategory).filter(([k])=>unwantedCats.has(k)).reduce((s, [,v])=> s+v, 0);

  // Helpers for formatting and layout
  const INR = (n: number) => `Rs ${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const percent = (n: number) => `${(n*100).toFixed(2)}%`;

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename=finvoice-${q.data.month}.pdf`);
  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(res);

  // Header with branding
  const brandLeft = 40, brandTop = 30, brandRight = doc.page.width - 40;
  doc.save();
  doc.rect(0, 0, doc.page.width, 60).fill('#0b5ed7'); // top bar
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('FinVoice — RSDA Softwares', brandLeft, 20, { width: brandRight - brandLeft, align: 'left' });
  doc.font('Helvetica').fontSize(11).text(`Monthly Report: ${q.data.month}`, brandLeft, 40, { width: brandRight - brandLeft, align: 'left' });
  doc.restore();

  doc.moveDown();
  doc.moveDown();

  // Summary cards
  const startY = 90;
  const gap = 12;
  const colW = (doc.page.width - doc.page.margins.left - doc.page.margins.right - gap*2);
  const cardW = colW / 3;
  const x0 = doc.page.margins.left;
  const y0 = startY;
  const drawCard = (x: number, title: string, value: string, color: string) => {
    doc.save();
    doc.roundedRect(x, y0, cardW, 60, 6).fill('#f6f8fa');
    doc.fillColor('#6c757d').font('Helvetica').fontSize(10).text(title, x + 10, y0 + 10);
    doc.fillColor(color).font('Helvetica-Bold').fontSize(14).text(value, x + 10, y0 + 28);
    doc.restore();
  };
  drawCard(x0, 'Income', INR(incomeTotal), '#198754');
  drawCard(x0 + cardW + gap, 'Expenses', INR(expenseTotal), '#dc3545');
  drawCard(x0 + (cardW + gap) * 2, 'Savings', `${INR(savings)}  (${incomeTotal>0 ? percent(savings/incomeTotal) : '0.00%'})`, '#0d6efd');

  // Categories section
  doc.moveDown();
  doc.moveDown();
  doc.moveDown();
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#000000').text('By Category', { underline: true });
  doc.moveDown(0.5);
  doc.font('Helvetica').fontSize(11).fillColor('#000000');
  Object.entries(byCategory)
    .sort((a,b)=>b[1]-a[1])
    .forEach(([name, amount])=>{
      doc.text(`${name}: ${INR(amount)}`);
    });

  // Unwanted spend
  doc.moveDown();
  doc.font('Helvetica-Bold').fontSize(13).text('Unwanted Spend (heuristic)');
  doc.font('Helvetica').fontSize(11).text(`Entertainment + Shopping + Uncategorized: ${INR(unwantedTotal)}`);

  // Transactions table
  doc.addPage();
  // per-page header for added pages
  doc.on('pageAdded', () => {
    doc.save();
    doc.rect(0, 0, doc.page.width, 50).fill('#0b5ed7');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(12).text(`FinVoice — RSDA Softwares  |  ${q.data.month}`, 40, 18);
    doc.restore();
  });
  const tableTop = 70;
  const colDate = 90, colCat = 120, colDesc = 230, colAmt = doc.page.width - doc.page.margins.right - 100;
  const drawRow = (y: number, date: string, cat: string, desc: string, amt: string, header=false) => {
    if (header) {
      doc.save();
      doc.rect(doc.page.margins.left, y - 6, doc.page.width - doc.page.margins.left - doc.page.margins.right, 22).fill('#f1f3f5');
      doc.restore();
      doc.font('Helvetica-Bold');
    } else {
      doc.font('Helvetica');
    }
    doc.fillColor('#000000').fontSize(10);
    doc.text(date, doc.page.margins.left + 4, y);
    doc.text(cat, doc.page.margins.left + colDate, y, { width: colCat - 10 });
    doc.text(desc || '', doc.page.margins.left + colDesc, y, { width: colAmt - colDesc - 10 });
    doc.text(amt, colAmt, y, { width: 90, align: 'right' });
  };
  drawRow(tableTop, 'Date', 'Category', 'Description', 'Amount', true);
  let rowY = tableTop + 24;
  txns.forEach(t=>{
    const date = new Date(t.date).toISOString().slice(0,10);
    const cat = t.category?.name || (t.direction==='credit' ? 'Income' : 'Uncategorized');
    const n = Number(t.amount);
    const amtStr = (t.direction==='credit' || n<0) ? `+ ${INR(Math.abs(n))}` : INR(n);
    drawRow(rowY, date, cat, t.description ?? '', amtStr);
    rowY += 18;
    if (rowY > doc.page.height - doc.page.margins.bottom - 30) {
      doc.addPage();
      rowY = tableTop + 24;
      drawRow(tableTop, 'Date', 'Category', 'Description', 'Amount', true);
    }
  });

  // Footer on last page
  doc.moveDown();
  doc.font('Helvetica').fontSize(9).fillColor('#6c757d').text('Generated by FinVoice — RSDA Softwares', { align: 'center' });

  doc.end();
});

// --- Stock News Advisory (RSS-based; no API key required) ---
function httpGet(url: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (resp) => {
      if (resp.statusCode && resp.statusCode >= 400) {
        reject(new Error(`HTTP ${resp.statusCode}`));
        return;
      }
      let data = "";
      resp.setEncoding("utf8");
      resp.on("data", (chunk) => (data += chunk));
      resp.on("end", () => resolve(data));
    });
    req.on("error", reject);
    req.setTimeout(timeoutMs, () => {
      try { req.destroy(new Error("timeout")); } catch {}
      reject(new Error("timeout"));
    });
  });
}

function stripCdata(s: string) {
  return s.replace(/<!\[CDATA\[/g, "").replace(/\]\]>/g, "");
}

function extractTag(segment: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([\s\S]*?)<\\/${tag}>`, "i");
  const m = segment.match(re);
  return m ? stripCdata(m[1]).trim() : "";
}

function parseRssItems(xml: string) {
  const items: Array<{ title: string; link: string; pubDate: string }> = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(xml)) !== null) {
    const seg = m[1];
    const title = extractTag(seg, "title");
    const link = extractTag(seg, "link");
    const pubDate = extractTag(seg, "pubDate");
    if (title) items.push({ title, link, pubDate });
  }
  return items;
}

function analyzeAdvisory(items: Array<{ title: string }>) {
  const positives = [
    /beats|surge|rall(y|ies)|raise(s)? guidance|buy rating|upgrade(d)?|record|profit jumps|outperform|strong|momentum|expands|wins order/i,
  ];
  const negatives = [
    /misses|plunge|falls|downgrade(d)?|lawsuit|probe|recall|guidance cut|warning|layoffs|loss widens|underperform|weak|fraud/i,
  ];
  let pos = 0, neg = 0;
  const reasons: string[] = [];
  for (const it of items.slice(0, 20)) {
    const t = it.title;
    if (positives.some((r) => r.test(t))) { pos++; reasons.push(`Positive: ${t}`); }
    if (negatives.some((r) => r.test(t))) { neg++; reasons.push(`Negative: ${t}`); }
  }
  const score = pos - neg;
  let decision: "buy" | "hold" | "avoid" = "hold";
  if (score >= 2 && pos >= 2 && neg === 0) decision = "buy";
  else if (neg >= pos && neg >= 2) decision = "avoid";
  return { score, pos, neg, decision, reasons: reasons.slice(0, 6) };
}

app.get("/advisory/news", async (req, res) => {
  try {
    const termsParam = String((req.query.terms as string) || "").trim();
    if (!termsParam) return res.status(400).json({ error: "Provide ?terms=AAPL,INFY,..." });
    const terms = termsParam.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 8);
    const results: any[] = [];
    for (const term of terms) {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(term + " stock")}&hl=en-US&gl=US&ceid=US:en`;
      try {
        const xml = await httpGet(url, 7000);
        const items = parseRssItems(xml);
        const analysis = analyzeAdvisory(items);
        results.push({ term, ...analysis, articles: items.slice(0, 12) });
      } catch (e: any) {
        results.push({ term, error: e?.message || String(e), articles: [] });
      }
    }
    res.json({ updatedAt: new Date().toISOString(), results });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const BASE_PORT = parseInt(process.env.PORT || "4000", 10);

function startServer(port: number, retries = 5) {
  const server = app.listen(port, () => {
    console.log(`FinVoice demo API + Web running on http://localhost:${port}`);
  });
  server.on("error", (err: any) => {
    if (err && err.code === "EADDRINUSE" && retries > 0) {
      const next = port + 1;
      console.warn(`Port ${port} in use, retrying on ${next} ...`);
      setTimeout(() => startServer(next, retries - 1), 300);
    } else {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
  });
}

ensureDemo()
  .then(() => startServer(BASE_PORT))
  .catch((e) => {
    console.error("Failed to initialize demo data:", e);
    process.exit(1);
  });

// Serve static frontend so everything works on same origin
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDir = path.join(__dirname, "..", "..", "frontend");
app.use(express.static(frontendDir));
// listening started above in ensureDemo()
