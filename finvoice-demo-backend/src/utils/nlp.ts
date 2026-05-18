
import * as chrono from 'chrono-node';

// --- Helpers: Hinglish tuning ---
function normalizeHindiTemporal(input: string) {
  let s = input;
  // Common Hindi time words → English phrases Chrono understands
  s = s.replace(/\b(aaj)\b/gi, 'today');
  // Ambiguous 'kal': assume yesterday for expenses context
  s = s.replace(/\b(kal)\b/gi, 'yesterday');
  s = s.replace(/\b(parso|parso)\b/gi, '2 days ago');
  s = s.replace(/\b(is|iss)\s+(mahine|mahina)\b/gi, 'this month');
  s = s.replace(/\b(pichle|pichhla|pichli)\s+(mahine|mahina)\b/gi, 'last month');
  s = s.replace(/\b(agle|agla|agli)\s+(mahine|mahina)\b/gi, 'next month');
  s = s.replace(/\b(pichle|pichhla|pichli)\s+haft(e|a)\b/gi, 'last week');
  s = s.replace(/\b(agle|agla|agli)\s+haft(e|a)\b/gi, 'next week');
  s = s.replace(/\b(subah)\b/gi, 'morning');
  s = s.replace(/\b(shaam|sham|evening)\b/gi, 'evening');
  return s;
}

const WORD_NUM: Record<string, number> = {
  // Hindi 1-10
  'ek': 1, 'do': 2, 'teen': 3, 'char': 4, 'chaar': 4, 'paanch': 5, 'panch': 5,
  'chhe': 6, 'che': 6, 'saat': 7, 'aath': 8, 'ath': 8, 'nau': 9,
  // Common tens
  'das': 10, 'bees': 20, 'tees': 30, 'chalis': 40, 'chalees': 40, 'pachaas': 50,
  // English base
  'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
  'ten': 10, 'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
};

function parseNumberWordsAmount(text: string): number | undefined {
  const s = text.toLowerCase();
  // Patterns like: "do sau pachaas", "teen hazaar", "do lakh", "two hundred"
  // 1) X (hundred|sau) [Y]
  let m = s.match(/\b(ek|do|teen|char|chaar|paanch|panch|chhe|che|saat|aath|ath|nau|one|two|three|four|five|six|seven|eight|nine)\s+(hundred|sau)\b(?:\s+(das|bees|tees|chalis|chalees|pachaas|ten|twenty|thirty|forty|fifty))?/i);
  if (m) {
    const x = WORD_NUM[m[1]] || 0;
    const y = m[3] ? (WORD_NUM[m[3].toLowerCase()] || 0) : 0;
    const base = x * 100 + y;
    if (base > 0) return base;
  }
  // 2) X (thousand|hazaar|hazar)
  m = s.match(/\b(ek|do|teen|char|chaar|paanch|panch|chhe|che|saat|aath|ath|nau|one|two|three|four|five|six|seven|eight|nine)\s+(thousand|hazaar|hazar|hajaar)\b/i);
  if (m) {
    const x = WORD_NUM[m[1]] || 0;
    const base = x * 1000;
    if (base > 0) return base;
  }
  // 3) X (lakh|lac|laakh)
  m = s.match(/\b(ek|do|teen|char|chaar|paanch|panch|chhe|che|saat|aath|ath|nau|one|two|three|four|five|six|seven|eight|nine)\s+(lakh|lac|laakh|lacs|lakhs)\b/i);
  if (m) {
    const x = WORD_NUM[m[1]] || 0;
    const base = x * 100000;
    if (base > 0) return base;
  }
  // 4) X (crore|cr)
  m = s.match(/\b(ek|do|teen|char|chaar|paanch|panch|chhe|che|saat|aath|ath|nau|one|two|three|four|five|six|seven|eight|nine)\s+(crore|cr|crs|crores|karod|karor|karore)\b/i);
  if (m) {
    const x = WORD_NUM[m[1]] || 0;
    const base = x * 10000000;
    if (base > 0) return base;
  }
  // 5) Lone tens like 'pachaas' or 'bees'
  m = s.match(/\b(das|bees|tees|chalis|chalees|pachaas|ten|twenty|thirty|forty|fifty)\b/i);
  if (m) {
    const base = WORD_NUM[m[1].toLowerCase()] || 0;
    if (base > 0) return base;
  }
  return undefined;
}

/**
 * Parse free text like: "Add dinner ₹300 yesterday" or "food 250 today"
 * Returns structured entities for creating a transaction.
 */
export function parseText(text: string) {
  const original = text;
  // Normalize commas and extra spaces
  let t = text.replace(/,/g, ' ').trim();
  // Normalize Hindi temporal tokens for better date parsing
  const tForDate = normalizeHindiTemporal(t);

  // Amount detection with multipliers:
  // supports: ₹300, Rs 300, 300, 3k, 3 K, 3 thousand/hazaar, 3 lac(s)/lakh(s)/lack(s)/laakh(s), 3 cr/crore(s)/karod
  let amount: number | undefined;
  const amtRegex = /(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)\s*(k|thousand|thousands|hazaar|hazar|hajaar|lac|lack|lacks|lakh|laakh|laakhs|lacs|lakhs|cr|crs|crore|crores|karod|karor|karore)?\b/i;
  const m = t.match(amtRegex);
  if (m) {
    const base = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    const mult = unit === 'k' || unit === 'thousand' || unit === 'thousands' || unit === 'hazaar' || unit === 'hazar' || unit === 'hajaar' ? 1_000
      : unit === 'lac' || unit === 'lack' || unit === 'lacks' || unit === 'lakh' || unit === 'laakh' || unit === 'laakhs' || unit === 'lacs' || unit === 'lakhs' ? 100_000
      : unit === 'cr' || unit === 'crs' || unit === 'crore' || unit === 'crores' || unit === 'karod' || unit === 'karor' || unit === 'karore' ? 10_000_000
      : 1;
    amount = isNaN(base) ? undefined : base * mult;
  }
  // If digits not found, try number words
  if (amount === undefined) {
    const numWordAmt = parseNumberWordsAmount(t);
    if (numWordAmt !== undefined) amount = numWordAmt;
  }

  // Currency
  const currency = /₹|rs\.?/i.test(t) ? 'INR' : 'INR';

  // Date with chrono (defaults to today if none). Assume local tz.
  const parsedDate = chrono.parseDate(tForDate, new Date());
  const datetime = parsedDate ? parsedDate.toISOString() : new Date().toISOString();

  // Description cleanup: remove common filler and amount tokens
  const fillers = /\b(add|spent|spend|pay|paid|bought|buy|purchase|on|for|to|from|at|of|my|the|a|ke|ki|ka|liye|ke liye|ko|par|mein|me|se|mera|meri|mere|apna|apni|apne|kharch|kharcha|liya|liye|kiya|gaya)\b|[\u0900-\u097F]*(के लिए|केलिये|के|की|का|में|पर|से)[\u0900-\u097F]*/gi;
  let description = t
  .replace(fillers, ' ')
  .replace(/₹\s*\d+(?:\.\d{1,2})?\s*(k|thousand|thousands|hazaar|hazar|hajaar|lac|lack|lacks|lakh|laakh|laakhs|lacs|lakhs|cr|crs|crore|crores|karod|karor|karore)?/gi, ' ')
  .replace(/rs\.?\s*\d+(?:\.\d{1,2})?\s*(k|thousand|thousands|hazaar|hazar|hajaar|lac|lack|lacks|lakh|laakh|laakhs|lacs|lakhs|cr|crs|crore|crores|karod|karor|karore)?/gi, ' ')
  // remove bare amount+unit like '5k', '3 lakh', '2 cr'
  .replace(/\b\d+(?:\.\d{1,2})?\s*(k|thousand|thousands|hazaar|hazar|hajaar|lac|lack|lacks|lakh|laakh|laakhs|lacs|lakhs|cr|crs|crore|crores|karod|karor|karore)\b/gi, ' ')
    // remove currency/unit words even if not attached to a number
    .replace(/\b(rupees?|bucks?|inr)\b/gi, ' ')
  .replace(/\b(k|thousand|thousands|hazaar|hazar|hajaar|lac|lack|lacks|lakh|laakh|laakhs|lacs|lakhs|cr|crs|crore|crores|karod|karor|karore)\b/gi, ' ')
    // remove standalone numbers as they don't help categorize
    .replace(/\b\d+(?:\.\d+)?\b/g, ' ')
  // remove stray currency symbols
  .replace(/[₹]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description) description = 'expense';

  return {
    intent: 'expense.create',
    entities: {
      amount,
      currency,
      category: undefined as string | undefined,
      merchant: description,
      datetime,
    },
    original,
  };
}

/**
 * Parse text and return multiple parsed expense entries when multiple amounts are present.
 * Falls back to single-item parse using parseText()
 */
export function parseMultiText(text: string) {
  const original = text;
  const t = normalizeHindiTemporal(text.replace(/,/g, ' ').trim());

  const amtRegex = /(?:₹|rs\.?\s*)?(\d+(?:\.\d{1,2})?)\s*(k|thousand|thousands|hazaar|hazar|hajaar|lac|lack|lacks|lakh|laakh|laakhs|lacs|lakhs|cr|crs|crore|crores|karod|karor|karore)?\b/gi;
  const matches = Array.from(t.matchAll(amtRegex));

  if (matches.length <= 1) {
    return [parseText(text)];
  }

  // Determine a common datetime (use chrono on full text)
  const parsedDate = chrono.parseDate(t, new Date());
  const datetime = parsedDate ? parsedDate.toISOString() : new Date().toISOString();

  const results: Array<{ amount: number | undefined; currency: string; merchant: string; datetime: string }> = [];
  let lastIdx = 0;
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const idx = m.index ?? 0;
    const matchText = m[0];
    const base = parseFloat(m[1]);
    const unit = (m[2] || '').toLowerCase();
    const mult = unit === 'k' || unit === 'thousand' || unit === 'thousands' || unit === 'hazaar' || unit === 'hazar' || unit === 'hajaar' ? 1_000
      : unit === 'lac' || unit === 'lack' || unit === 'lacks' || unit === 'lakh' || unit === 'laakh' || unit === 'laakhs' || unit === 'lacs' || unit === 'lakhs' ? 100_000
      : unit === 'cr' || unit === 'crs' || unit === 'crore' || unit === 'crores' || unit === 'karod' || unit === 'karor' || unit === 'karore' ? 10_000_000
      : 1;
    const amount = isNaN(base) ? undefined : base * mult;

    // Chunk around this amount: from lastIdx to (next match index or end up to some chars)
    const nextMatch = matches[i + 1];
    const chunkEnd = nextMatch ? (nextMatch.index ?? t.length) : t.length;
    // take text from lastIdx up to chunkEnd, but prefer the segment immediately surrounding the amount
    const segment = t.slice(lastIdx, chunkEnd).trim();

    // Attempt to extract merchant description: take up to 40 chars before the amount index within the segment
    const relIdx = idx - lastIdx;
    let before = segment.slice(Math.max(0, relIdx - 40), relIdx).trim();
    // if 'for' or 'to' present, take words after it
    const forMatch = before.match(/(?:for|to|for\s|to\s)\s*(.+)$/i);
    let merchant = '';
    if (forMatch && forMatch[1]) merchant = forMatch[1];
    else {
      // fallback: take the words immediately before the amount
      const tokens = before.split(/\s+/).filter(Boolean);
      merchant = tokens.slice(-3).join(' ');
    }

    // Clean merchant similar to parseText fillers
    const fillers = /\b(add|spent|spend|pay|paid|on|for|to|from|at|of|my|the|a|ke|ki|ka|liye|ke liye|ko|par|mein|me|se|mera|meri|mere|apna|apni|apne)\b|[\u0900-\u097F]*(के लिए|केलिये|के|की|का|में|पर|से)[\u0900-\u097F]*/gi;
    merchant = (merchant || segment.replace(fillers, ' ')).replace(fillers, ' ').replace(/₹|rs\.?/gi, ' ').replace(/\d+(?:\.\d+)?/g, ' ').replace(/\s+/g, ' ').trim();
    if (!merchant) merchant = 'expense';

    results.push({ amount, currency: /₹|rs\.?/i.test(matchText) ? 'INR' : 'INR', merchant, datetime });

    lastIdx = chunkEnd;
  }

  return results.map(r => ({ intent: 'expense.create', entities: { amount: r.amount, currency: r.currency, category: undefined as string | undefined, merchant: r.merchant, datetime: r.datetime }, original }));
}
