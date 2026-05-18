let API_BASE = ""; // will auto-detect
let TXN_OFFSET = 0; // pagination offset
let TXN_LIMIT = 5;  // default page size
let TXN_FILTER = { month: null, category: '', sort: 'date_desc', min: '', max: '' };

async function pickApiBase() {
  const candidates = [
    // prefer the default backend port first for faster startup
    "http://localhost:4000",
    "http://localhost:4001",
    "http://localhost:4002",
    "http://localhost:4050",
    "http://localhost:4051",
    "http://localhost:4052",
    "http://localhost:4053",
    "", // same-origin (works when served by backend)
  ];
  for (const base of candidates) {
    try {
      const res = await fetch(`${base}/health`, { cache: "no-store" });
      if (res.ok) {
        API_BASE = base;
        console.log("API base:", API_BASE || "same-origin");
        return;
      }
    } catch (_) {}
  }
  // Fallback to local backend if nothing auto-detected (useful when opening index.html directly)
  API_BASE = API_BASE || 'http://localhost:4050';
  console.warn("API not reachable via auto-detect. Falling back to:", API_BASE);
}

async function checkBackendHealth() {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
    return !!(res && res.ok);
  } catch (e) { return false; }
}

function showBackendUnreachableOverlay() {
  // Render a small, non-blocking banner at the top
  if (document.getElementById('backendErrorBanner')) return;
  const bar = document.createElement('div');
  bar.id = 'backendErrorBanner';
  bar.setAttribute('role', 'alert');
  bar.style.position = 'fixed';
  bar.style.top = '0';
  bar.style.left = '0';
  bar.style.right = '0';
  bar.style.zIndex = '9999';
  bar.style.padding = '12px 16px';
  bar.style.background = '#991b1b';
  bar.style.color = '#fff';
  bar.style.fontWeight = '700';
  bar.style.textAlign = 'center';
  bar.style.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
  bar.innerHTML = 'Service Unreachable — start the backend and refresh. <button id="retryBackendBtn" style="margin-left:12px;background:#ef4444;border:none;color:#fff;padding:6px 10px;border-radius:6px;font-weight:700;cursor:pointer">Retry</button>';
  document.body.appendChild(bar);
  const btn = document.getElementById('retryBackendBtn');
  if (btn) btn.addEventListener('click', () => window.location.reload());
}

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch (e) {
    const txt = await res.text().catch(() => "");
    throw new Error(txt || res.statusText || "Invalid response");
  }
}

// Responsive: mobile sidebar toggle
document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('mobileMenu');
  const backdropId = 'sidebarBackdrop';
  let backdrop = document.getElementById(backdropId);
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.id = backdropId;
    backdrop.className = 'sidebar-backdrop';
    document.body.appendChild(backdrop);
  }
  const toggle = (on) => {
    document.body.classList.toggle('sidebar-open', on !== undefined ? on : !document.body.classList.contains('sidebar-open'));
  };
  if (btn) btn.addEventListener('click', () => toggle());
  if (backdrop) backdrop.addEventListener('click', () => toggle(false));
});

// Add income (global) — supports IDs from both index.html and income.html
async function addIncome() {
  try {
    const amtEl = document.getElementById('incomeAmount') || document.getElementById('incAmount');
    const dateEl = document.getElementById('incomeDate') || document.getElementById('incDate');
    const descEl = document.getElementById('incomeDesc') || document.getElementById('incDesc');
    const a = Number(amtEl && amtEl.value);
    const d = dateEl && dateEl.value;
    const desc = (descEl && descEl.value) || '';
    if (!a || !d) { alert('Enter amount and date'); return; }
    // Normalize date to ISO to satisfy backend zod .datetime()
    const dt = new Date(d);
    const iso = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate(), 12, 0, 0)).toISOString();
    if (!API_BASE) { await pickApiBase(); }
    const res = await fetch(`${API_BASE}/income/add`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: a, date: iso, description: desc })
    });
    if (!res.ok) throw new Error(await res.text());
    // feedback
    const incRes = document.getElementById('incRes');
    if (incRes) incRes.textContent = 'Income added';
    // clear fields
    try { if (amtEl) amtEl.value = ''; if (dateEl) dateEl.value = ''; if (descEl) descEl.value = ''; } catch (e) {}
  // refresh transactions if table exists
  try { if (document.getElementById('transactionsTable')) { TXN_OFFSET = 0; await loadTransactions(); } } catch (e) {}
  // refresh summary panel if present
  try { if (document.getElementById('summaryResult')) { await loadSummary(); } } catch (e) {}
  // refresh dashboard stats if present
  try { await refreshDashboardStats(); } catch (e) {}
  } catch (e) {
    const incRes = document.getElementById('incRes');
    if (incRes) incRes.textContent = 'Error: ' + e;
    else alert('Error adding income: ' + e);
  }
}

// Quick-add helpers: set date to current or next month automatically
function yyyyMmDd(date) {
  return date.toISOString().slice(0,10);
}

async function addIncomeForCurrentMonth() {
  const amtEl = document.getElementById('incAmount');
  if (!amtEl || !amtEl.value) { alert('Enter amount first'); return; }
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 12, 0, 0));
  const dateEl = document.getElementById('incDate');
  if (dateEl) dateEl.value = yyyyMmDd(d);
  await addIncome();
}

async function addIncomeForNextMonth() {
  const amtEl = document.getElementById('incAmount');
  if (!amtEl || !amtEl.value) { alert('Enter amount first'); return; }
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth()+1, 1, 12, 0, 0));
  const dateEl = document.getElementById('incDate');
  if (dateEl) dateEl.value = yyyyMmDd(d);
  await addIncome();
}

// Add expense
async function addExpense() {
  const raw = document.getElementById("expenseInput").value;
  const text = normalizeInput(raw);
  if (!text) return alert("Enter expense text");

  try {
    const res = await fetch(`${API_BASE}/voice/add`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || res.statusText);
    }
    const data = await parseJsonSafe(res);
    console.log(data);
  document.getElementById("expenseInput").value = "";
  TXN_OFFSET = 0; // reset to latest view
  await loadTransactions();
    loadSummary();
  try { await refreshDashboardStats(); } catch(e){}
  } catch (err) {
    const msg = (err && err.message) ? err.message : String(err);
    // Look for balance error message
    if (/Insufficient monthly balance/i.test(msg)) {
      alert('Not enough monthly balance left. Please reduce expense or wait for next month.');
    } else {
      alert("Error adding expense: " + msg);
    }
  }
}

// Load transactions
async function loadTransactions() {
  const params = new URLSearchParams();
  // support an on-page free-text search; if present, fetch a larger window
  const q = (document.getElementById('filterSearch') && document.getElementById('filterSearch').value) || '';
  const limit = q ? Math.max(100, TXN_LIMIT) : TXN_LIMIT;
  params.set('limit', String(limit));
  params.set('offset', String(TXN_OFFSET));
  if (q) params.set('q', q);
  if (TXN_FILTER && TXN_FILTER.month) params.set('month', TXN_FILTER.month);
  if (TXN_FILTER && TXN_FILTER.category) params.set('category', TXN_FILTER.category);
  if (TXN_FILTER && TXN_FILTER.sort) params.set('sort', TXN_FILTER.sort);
  if (TXN_FILTER && TXN_FILTER.min) params.set('minAmount', TXN_FILTER.min);
  if (TXN_FILTER && TXN_FILTER.max) params.set('maxAmount', TXN_FILTER.max);
  const res = await fetch(`${API_BASE}/transactions?${params.toString()}`);
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || res.statusText);
  }
  const txns = await parseJsonSafe(res);
  const tbody = document.getElementById("transactionsTable");
  if (TXN_OFFSET === 0) tbody.innerHTML = "";
  txns.forEach((t) => {
    const tr = document.createElement("tr");
  const amt = Number(t.amount);
  const isIncome = (t.direction === 'credit') || amt < 0;
  const cls = isIncome ? 'positive' : 'negative';
    const cat = t.category ? t.category.name : (isIncome ? 'Income' : 'Uncategorized');
    // apply row class for income/expense coloring
    tr.className = isIncome ? 'row-income' : 'row-expense';
    tr.innerHTML = `<td>${new Date(t.date).toISOString().slice(0, 10)}</td>
                    <td>${t.description ?? ''}</td>
                    <td class="amount ${cls}">₹${isNaN(amt) ? t.amount : Math.abs(amt).toFixed(2)}</td>
                    <td><span class="badge">${cat}</span></td>
                    <td><button data-id="${t.id}" class="btn-delete">Delete</button></td>`;
    tbody.appendChild(tr);
  });
  // attach delete handlers
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.onclick = () => deleteTxn(btn.getAttribute('data-id'));
  });
}

// Load summary
async function loadSummary() {
  if (!API_BASE) { try { await pickApiBase(); } catch (e) {} }
  let month = (document.getElementById("summaryMonth") && document.getElementById("summaryMonth").value) || '';
  const allTime = document.getElementById("summaryAllTime")?.checked;
  if (!allTime && !month) {
    const now = new Date();
    month = String(now.getUTCFullYear()) + '-' + String(now.getUTCMonth()+1).padStart(2,'0');
    const mEl = document.getElementById('summaryMonth'); if (mEl) mEl.value = month;
  }
  const url = allTime ? `${API_BASE}/insights/summary` : `${API_BASE}/insights/summary?month=${month}`;
  const div = document.getElementById("summaryResult");
  if (div) div.innerHTML = '<p class="muted">Loading summary...</p>';
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || res.statusText);
    }
    const summary = await parseJsonSafe(res);
    if (!div) return;
    const income = Number(summary?.income ?? 0);
    const expenses = Number(summary?.expenses ?? 0);
    // Match dashboard display rule: for current-year month (and not all-time), display income as 100,000
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const selYear = (typeof month === 'string' && month.includes('-')) ? Number(month.split('-')[0]) : currentYear;
    const isCurrentYearMonth = !allTime && selYear === currentYear;
    const displayInc = isCurrentYearMonth ? 100000 : income;
    const remaining = Number((summary && summary.remaining != null ? summary.remaining : income - expenses) ?? 0);
    const displayRemaining = displayInc - expenses;
    const savingsRate = displayInc > 0 && isFinite(displayInc) ? (displayInc - expenses) / displayInc : 0;
  const byCategory = Array.isArray(summary?.byCategory) ? summary.byCategory : [];
    const spentPct = displayInc > 0 ? (expenses / displayInc) : 0;
    const warnBanner = (summary?.overLimit || spentPct >= 1)
      ? `<div style=\"padding:8px 12px;border-radius:6px;background:#fee2e2;color:#991b1b;margin-bottom:10px\">Over limit: Expenses exceed ₹${displayInc.toFixed(2)} for this month.</div>`
      : ((summary?.nearingLimit || spentPct >= 0.9)
        ? `<div style=\"padding:8px 12px;border-radius:6px;background:#fff7ed;color:#9a3412;margin-bottom:10px\">Warning: You have used ${(spentPct*100).toFixed(1)}% of ₹${displayInc.toFixed(2)} this month.</div>`
        : '');
    div.innerHTML = `
      ${warnBanner}
      <p>Income: ₹${displayInc.toFixed(2)}</p>
      <p>Expenses: ₹${expenses.toFixed(2)}</p>
      <p>Savings Rate: ${(savingsRate * 100).toFixed(2)}%</p>
      <p>Remaining Balance: ₹${displayRemaining.toFixed(2)}</p>
      <p>By Category:</p>
      <ul id="summaryCategoryList">${byCategory
        .map((c) => `<li><button class=\"badge cat-filter\" data-cat=\"${c.name}\">${c.name}: ₹${Number(c.amount ?? 0).toFixed(2)}</button></li>`)
        .join("")}</ul>
      <p><small>Tip: Click a category to filter the list below for ${allTime ? 'all-time' : month}.</small></p>
    `;

    // Advisory: compute and render
    try {
      const analysis = analyzeMonthlyExpenses({ income, expenses, categories: byCategory });
      const balanceVal = Number((document.getElementById('bankBalanceInput') && document.getElementById('bankBalanceInput').value) || 0);
      const advisory = generateAdvisory(analysis, balanceVal);
      renderAdvisoryCards(advisory);
    } catch (e) { console.warn('advisory render failed', e); }
  } catch (e) {
    if (div) div.innerHTML = `<p style="color:#b91c1c">Failed to load summary: ${e && e.message ? e.message : e}</p>`;
    return;
  }

  // Sync filters with summary scope
  const filterMonth = document.getElementById('filterMonth');
  if (allTime) {
    if (filterMonth) filterMonth.value = '';
    TXN_FILTER.month = null;
  } else {
    if (filterMonth) filterMonth.value = month;
    TXN_FILTER.month = month;
  }
  if (document.getElementById('transactionsTable')) {
    TXN_OFFSET = 0; TXN_LIMIT = 5;
    await loadTransactions();
  }

  // Category quick-filter from summary
  div.querySelectorAll('.cat-filter').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cat = btn.getAttribute('data-cat') || '';
      const sel = document.getElementById('filterCategory');
      if (sel) sel.value = cat;
      TXN_FILTER.category = cat;
      TXN_OFFSET = 0; TXN_LIMIT = 5;
      await loadTransactions();
    });
  });
}

// Calculate SIP
async function calculateSIP() {
  const target = Number(document.getElementById("sipTarget").value);
  const months = Number(document.getElementById("sipMonths").value);
  if (!target || !months) return alert("Enter target and months");

  const res = await fetch(`${API_BASE}/goals/required-sip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetAmount: target, months }),
  });
  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || res.statusText);
  }
  const data = await parseJsonSafe(res);
  document.getElementById(
    "sipResult"
  ).innerText = `Monthly SIP: ₹${data.monthlySip}`;
}

// Voice recognition using Web Speech API
function startVoice() {
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    return alert("Your browser does not support voice recognition.");
  }

  const SpeechRecognition =
    window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();

  recognition.lang = "en-IN";
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  showVoiceModal();
  recognition.start();

  recognition.onresult = async (event) => {
  const spokenText = normalizeInput(event.results[0][0].transcript);
    console.log("Voice input:", spokenText);
    document.getElementById("expenseInput").value = spokenText;
    await addExpense();
  };

  recognition.onerror = (event) => {
    console.error("Speech recognition error:", event.error);
    alert("Voice recognition error: " + event.error);
  };

  recognition.onend = () => {
    console.log("Voice recognition ended.");
    hideVoiceModal();
  };
}

// --- Bot Voice Input Feature ---
let botActive = false;
let botRecognition = null;
let botRetries = 0;
let botSuppressRestart = false; // when true, onend won't auto-restart (used during TTS or intentional stops)
const BOT_MAX_RETRIES = 3;
// Simple bot single-shot mode state
let simpleBotRec = null;
let simpleBotWaitingForTrigger = false;
let micPermissionGranted = false;

async function speakText(text) {
  return new Promise((resolve) => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-IN';
      u.onend = () => resolve();
      u.onerror = () => resolve();
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { resolve(); }
  });
}

// Ask once for an expense, listen a single shot, send to backend, then wait for 'bot' trigger to repeat
async function askAndListenOnce() {
  console.log('[simpleBot] askAndListenOnce invoked');
  // bail out if user stopped the bot meanwhile
  if (!botActive) { console.log('[simpleBot] bot not active, aborting'); return; }
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    alert('Your browser does not support voice recognition.');
    return stopBot();
  }

  console.log('[simpleBot] about to TTS prompt');
  try {
    await speakText('Tell me the expense.');
    console.log('[simpleBot] TTS prompt finished');
  } catch (e) { console.warn('[simpleBot] speakText error', e); }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (simpleBotRec) {
    try { simpleBotRec.onresult = null; simpleBotRec.onend = null; simpleBotRec.onerror = null; simpleBotRec.stop(); } catch (e) {}
    simpleBotRec = null;
  }
  simpleBotRec = new SpeechRecognition();
  simpleBotRec.lang = 'en-IN';
  simpleBotRec.interimResults = false;
  simpleBotRec.maxAlternatives = 1;

  simpleBotRec.onresult = async (ev) => {
    const spoken = normalizeInput(ev.results[0][0].transcript);
    console.log('[simpleBot] heard:', spoken);
    // stop if stop words
    if (/\b(stop bot|stop|cancel|no more|that\'s all|thats all|that\'s it|thats it)\b/i.test(spoken)) {
      await speakText('Stopping.');
      return stopBot();
    }

    // If user just said 'bot' without expense, prompt again
    if (/^\s*bot\s*$/i.test(spoken)) {
      return askAndListenOnce();
    }

    // send to backend
    try {
      const res = await fetch(`${API_BASE}/voice/add`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: spoken }) });
      if (res.ok) {
  try { await loadTransactions(); } catch (e) { console.warn('loadTransactions after simple bot save failed', e); }
  // also refresh summary and dashboard stats so figures stay accurate
  try { if (document.getElementById('summaryResult')) { await loadSummary(); } } catch (e) { console.warn('loadSummary after simple bot save failed', e); }
  try { await refreshDashboardStats(); } catch (e) { console.warn('refreshDashboardStats after simple bot save failed', e); }
  document.getElementById('botStatus').textContent = `Saved: "${spoken}"`;
  // after saving, speak confirmation and prompt user to say 'bot' to add another expense
  await speakText("Saved. Say 'bot' to add another expense.");
  // now listen for the trigger word (permission-aware)
  listenForBotTriggerPermissionAware();
      } else {
        const msg = await res.text().catch(()=>res.statusText||'error');
        document.getElementById('botStatus').textContent = `Error: ${msg}`;
      }
    } catch (e) {
      console.warn('[simpleBot] post error', e);
      document.getElementById('botStatus').textContent = 'Error saving expense';
    }
  };

  simpleBotRec.onerror = (e) => {
    console.warn('[simpleBot] error', e);
    document.getElementById('botStatus').textContent = 'Recognition error';
  };

  simpleBotRec.onend = () => {
    console.log('[simpleBot] ended');
    // if we're waiting for trigger, don't clear rec here
    if (!simpleBotWaitingForTrigger) {
      try { simpleBotRec = null; } catch (e) {}
    }
  };

  try { console.log('[simpleBot] starting recognition (expense)'); simpleBotRec.start(); } catch (e) { console.warn('simpleRec start failed', e); }
}

// Listen once for the trigger word 'bot' (or stop). If heard, restart askAndListenOnce
function hideContinueButton() {
  const b = document.getElementById('botContinueBtn');
  if (b) b.style.display = 'none';
}

function showContinueButton() {
  let b = document.getElementById('botContinueBtn');
  if (!b) {
    b = document.createElement('button');
    b.id = 'botContinueBtn';
    b.textContent = "Tap to continue (say 'bot')";
    b.style.position = 'fixed';
    b.style.bottom = '20px';
    b.style.right = '20px';
    b.style.zIndex = 2000;
    b.style.padding = '10px 14px';
    b.style.background = '#3949ab';
    b.style.color = '#fff';
    b.style.border = 'none';
    b.style.borderRadius = '6px';
    b.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    document.body.appendChild(b);
  }
  b.style.display = 'inline-block';
  b.onclick = () => {
    hideContinueButton();
    listenForBotTrigger();
  };
}

// Try to auto-start trigger listening only if microphone permission already granted;
// otherwise show a tap-to-continue button so user gesture satisfies browser requirements.
async function listenForBotTriggerPermissionAware() {
  try {
    if (!('permissions' in navigator)) {
      // no Permissions API; show tap-to-continue
      showContinueButton();
      return;
    }
    const p = await navigator.permissions.query({ name: 'microphone' });
    if (p.state === 'granted') {
      // safe to start recognition programmatically
      listenForBotTrigger();
    } else {
      showContinueButton();
    }
  } catch (e) {
    // fallback: show button
    showContinueButton();
  }
}

// Listen once for the trigger word 'bot' (or stop). If heard, restart askAndListenOnce
function listenForBotTrigger() {
  console.log('[simpleBot] listenForBotTrigger invoked');
  hideContinueButton();
  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) return stopBot();
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  // cleanup any existing
  if (simpleBotRec) {
    try { simpleBotRec.onresult = null; simpleBotRec.onend = null; simpleBotRec.onerror = null; simpleBotRec.stop(); } catch (e) {}
    simpleBotRec = null;
  }
  simpleBotRec = new SpeechRecognition();
  simpleBotRec.lang = 'en-IN';
  simpleBotRec.interimResults = false;
  simpleBotRec.maxAlternatives = 1;
  simpleBotWaitingForTrigger = true;

  simpleBotRec.onresult = (ev) => {
    const spoken = normalizeInput(ev.results[0][0].transcript);
    console.log('[simpleBot] trigger heard:', spoken);
    simpleBotWaitingForTrigger = false;
    if (/\b(bot)\b/i.test(spoken)) {
      // user wants to add another expense
      askAndListenOnce();
    } else if (/\b(stop bot|stop|cancel|no more)\b/i.test(spoken)) {
      speakText('Stopping.');
      stopBot();
    } else {
      // anything else: treat as no-trigger and stop
      document.getElementById('botStatus').textContent = 'Idle.';
      try { simpleBotRec = null; } catch (e) {}
    }
  };

  simpleBotRec.onerror = (e) => {
    console.warn('[simpleBot] trigger error', e);
    simpleBotWaitingForTrigger = false;
  };

  simpleBotRec.onend = () => {
    console.log('[simpleBot] trigger ended');
    simpleBotWaitingForTrigger = false;
    try { simpleBotRec = null; } catch (e) {}
  };

  try { console.log('[simpleBot] starting recognition (trigger)'); simpleBotRec.start(); } catch (e) { console.warn('simple trigger start failed', e); simpleBotWaitingForTrigger = false; }
}

// --- Advanced Hinglish Bot Segmentation ---
function splitExpendituresHinglish(sentence) {
  // Normalize common Hindi/English conjunctions
  let normalized = sentence.replace(/\s*(aur|and|comma|plus|ke liye|ke|for|ka|ki|ko)\s*/gi, ',');
  // Find all price mentions
  const priceRegex = /(₹|Rs\.?|INR|\$)\s*([0-9]+(?:\.[0-9]{2})?)/gi;
  let prices = [];
  let match;
  while ((match = priceRegex.exec(normalized)) !== null) {
    prices.push({ value: match[0], index: match.index });
  }
  let items = [];
  if (prices.length === 0) {
    items = normalized.split(/,/).map(s => s.trim()).filter(Boolean);
  } else {
    let lastIdx = 0;
    prices.forEach((p, i) => {
      let part = normalized.slice(lastIdx, p.index).trim();
      if (part) {
        // Split part into items by comma
        let subItems = part.split(/,/).map(s => s.trim()).filter(Boolean);
        subItems.forEach(sub => items.push(sub + ' ' + p.value));
      }
      lastIdx = p.index + p.value.length;
    });
    // Add any trailing text after last price
    let trailing = normalized.slice(lastIdx).trim();
    if (trailing && items.length > 0) items[items.length - 1] += ' ' + trailing;
  }
  // Also handle numbers without currency (e.g. "hundred")
  items = items.flatMap(item => {
    if (/hundred|thousand|lakh|crore|so|sau|ek|do|teen|char|paanch|das|pachaas|sau|rupaye|rupees|rs|inr|\d+/i.test(item)) {
      return [item];
    }
    return [item];
  });
  return items.filter(Boolean);
}

// --- Improved Bot: Ensure each item has an amount ---
function extractAmount(item) {
  const amtRegex = /(₹|Rs\.?|INR|\$)?\s*(\d+(?:\.\d{1,2})?)/i;
  const m = item.match(amtRegex);
  if (m) return m[0];
  return null;
}

// --- Hinglish number word to numeric conversion ---
function convertNumberWords(text) {
  // Basic mapping for common words
  const map = {
    'hundred': '100',
    'thousand': '1000',
    'lakh': '100000',
    'lac': '100000',
    'crore': '10000000',
    'rupees': '',
    'rupaye': '',
    'so': '100',
    'sau': '100',
    'do': '2',
    'teen': '3',
    'char': '4',
    'paanch': '5',
    'das': '10',
    'pachaas': '50',
    'hazaar': '1000',
    'hazar': '1000',
    'ek': '1'
  };
  // Replace Hindi/English number words with numbers
  let out = text;
  Object.keys(map).forEach(word => {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    out = out.replace(re, map[word]);
  });
  // Handle patterns like "do hazaar" => "2000"
  out = out.replace(/(\d+)\s*1000/g, (_, n) => String(Number(n) * 1000));
  out = out.replace(/(\d+)\s*100000/g, (_, n) => String(Number(n) * 100000));
  out = out.replace(/(\d+)\s*10000000/g, (_, n) => String(Number(n) * 10000000));
  return out;
}

function startBot() {
  if (botActive) return; // already running
  botActive = true;
  const status = document.getElementById('botStatus');
  if (status) status.textContent = 'Bot active — waiting for expense.';
  // hide continuous controls and use simple single-shot flow
  const speakBtn = document.getElementById('botSpeakBtn'); if (speakBtn) speakBtn.style.display = 'none';
  const stopBtn = document.getElementById('botStopBtn'); if (stopBtn) stopBtn.style.display = 'inline-block';
  // persist desired bot state so reloads can attempt to restore
  try { sessionStorage.setItem('botActive', '1'); } catch (e) {}
  // try to get microphone permission once so subsequent starts are allowed programmatically
  requestMicPermission().then(granted => {
    micPermissionGranted = granted;
    if (!granted) {
      // show tap-to-continue button for trigger flow
      showContinueButton();
    }
    // start by asking once
    askAndListenOnce();
  });
}

// Try to acquire mic permission via getUserMedia. Return true if granted, false otherwise.
async function requestMicPermission() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    // Immediately stop tracks - we only needed permission
    try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
    console.log('[simpleBot] mic permission granted via getUserMedia');
    return true;
  } catch (e) {
    console.warn('[simpleBot] mic permission denied or error', e);
    return false;
  }
}

function stopBot() {
  botActive = false;
  try {
    if (botRecognition) { botRecognition.onresult = null; botRecognition.onend = null; botRecognition.onerror = null; botRecognition.stop(); }
  } catch (e) {}
  try {
    if (simpleBotRec) { simpleBotRec.onresult = null; simpleBotRec.onend = null; simpleBotRec.onerror = null; simpleBotRec.stop(); }
  } catch (e) {}
  const status = document.getElementById('botStatus');
  if (status) status.textContent = 'Bot stopped.';
  // hide speak/stop buttons if present
  const speakBtn = document.getElementById('botSpeakBtn');
  const stopBtn = document.getElementById('botStopBtn');
  if (speakBtn) speakBtn.style.display = 'none';
  if (stopBtn) stopBtn.style.display = 'none';
  try { botRecognition = null; simpleBotRec = null; simpleBotWaitingForTrigger = false; } catch (e) {}
  try { sessionStorage.removeItem('botActive'); } catch (e) {}
}

// Single-shot speak: listens once, posts the text, and waits for user to trigger again
function botSpeak() {
  // For Chrome, prefer continuous recognition so it keeps listening between entries
  // This function is left as a no-op because continuous mode handles listening
  return;
}

// Create and wire continuous SpeechRecognition for Chrome
function createContinuousRecognition() {
  try {
    if (botRecognition) {
      try { botRecognition.onresult = null; botRecognition.onend = null; botRecognition.onerror = null; botRecognition.stop(); } catch (e) {}
      botRecognition = null;
    }
  } catch (e) { console.warn('cleanup failed', e); }

  if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
    alert('Browser does not support SpeechRecognition');
    return;
  }
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  botRecognition = new SpeechRecognition();
  botRecognition.continuous = true;
  botRecognition.interimResults = false;
  botRecognition.lang = 'en-IN';

  botRecognition.onstart = () => {
    console.log('[bot] continuous started');
    const status = document.getElementById('botStatus'); if (status) status.textContent = 'Bot listening...';
    const speakBtn = document.getElementById('botSpeakBtn'); if (speakBtn) speakBtn.style.display = 'none';
  };

  botRecognition.onresult = async (event) => {
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (!event.results[i].isFinal) continue;
      const spokenText = normalizeInput(event.results[i][0].transcript);
      console.log('[bot] final result:', spokenText);
      botRetries = 0;
      // stop phrase
      if (/\b(stop bot|stop|cancel|no more|that's all|thats all|that's it|thats it)\b/i.test(spokenText)) {
        try { const u = new SpeechSynthesisUtterance('Stopping'); u.lang='en-IN'; window.speechSynthesis.speak(u); } catch(e){}
        stopBot();
        return;
      }
      // send to backend
      try {
        const res = await fetch(`${API_BASE}/voice/add`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: spokenText })
        });
        if (res.ok) {
          try { await loadTransactions(); } catch (e) { console.warn('loadTransactions after bot save failed', e); }
          try { if (document.getElementById('summaryResult')) { await loadSummary(); } } catch (e) { console.warn('loadSummary after bot save failed', e); }
          try { await refreshDashboardStats(); } catch (e) { console.warn('refreshDashboardStats after bot save failed', e); }
          const status = document.getElementById('botStatus'); if (status) status.textContent = `Saved: "${spokenText}"`;
          // Stop recognition briefly, speak confirmation, then restart so TTS is audible
          try {
            // prevent onend auto-restart while we stop for TTS
            botSuppressRestart = true;
            // detach handlers and stop current recognition
            try { botRecognition.onresult = null; botRecognition.onend = null; botRecognition.onerror = null; } catch(e){}
            try { botRecognition.stop(); } catch(e){}
          } catch(e){ console.warn('error stopping recognition before TTS', e); }
          // speak confirmation and prompt
          try {
            await new Promise((resolve) => {
              try {
                const u = new SpeechSynthesisUtterance('Saved. Tell me the next expense.');
                u.lang = 'en-IN';
                u.onend = () => resolve();
                u.onerror = () => resolve();
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(u);
              } catch (e) { resolve(); }
            });
          } catch (e) { console.warn('tts failed', e); }
          // restart continuous recognition if still active (slight delay so TTS finishes)
          if (botActive) {
            setTimeout(() => {
              try {
                botSuppressRestart = false; // allow restarts now
                createContinuousRecognition(); botRecognition.start();
              } catch (e) { console.warn('restart failed', e); }
            }, 300);
          }
        } else {
          const msg = await res.text().catch(()=>res.statusText||'error');
          const status = document.getElementById('botStatus'); if (status) status.textContent = `Error: ${msg}`;
        }
      } catch (e) {
        console.warn('[bot] post error', e);
      }
    }
  };

  botRecognition.onerror = (e) => {
    console.warn('[bot] error', e);
    const status = document.getElementById('botStatus'); if (status) status.textContent = 'Recognition error: ' + (e.error || e.message || e);
  };

  botRecognition.onend = () => {
    console.log('[bot] ended');
    // if we intentionally suppressed restarts (TTS/stop), don't auto-restart
    if (botSuppressRestart) {
      console.log('[bot] restart suppressed');
      botSuppressRestart = false; // reset suppression for next cycle
      try { botRecognition = null; } catch (e) {}
      return;
    }
    if (!botActive) {
      try { botRecognition = null; } catch (e) {}
      return;
    }
    // restart to keep listening
    setTimeout(() => {
      try {
        if (botActive) {
          createContinuousRecognition();
          botRecognition.start();
        }
      } catch (e) { console.warn('[bot] restart failed', e); }
    }, 600);
  };
}

// --- Small helpers & initialization ---
function normalizeInput(s) {
  if (!s) return '';
  let out = String(s).trim();
  out = out.replace(/\s+/g, ' ');
  out = out.replace(/rs\.?\s*/ig, '₹');
  out = out.replace(/rupees?/ig, '₹');
  return out;
}

function showVoiceModal() {
  // simple visual cue for voice capture; no-op if not present
  const el = document.getElementById('botStatus');
  if (el) el.style.opacity = 1;
}
function hideVoiceModal() {
  const el = document.getElementById('botStatus');
  if (el) el.style.opacity = '';
}

// --- Personal Advisory Engine ---
function analyzeMonthlyExpenses(data) {
  const income = Number(data?.income ?? 0);
  const expenses = Number(data?.expenses ?? 0);
  const categories = Array.isArray(data?.categories) ? data.categories : [];
  const total = expenses;
  const byPct = categories.map(c => ({ name: c.name, amount: Number(c.amount ?? 0), pct: total > 0 ? Number(c.amount ?? 0) / total : 0 }));
  return { income, expenses, total, byPct, savings: Math.max(0, income - expenses) };
}

function generateAdvisory(analysis, bankBalance) {
  const income = Number(analysis.income);
  const expenses = Number(analysis.expenses);
  const savings = Number(analysis.savings);
  const balance = Number(bankBalance || 0);
  const messages = { positives: [], warnings: [], suggestions: [] };

  // Rules
  if (expenses > income && income > 0) messages.warnings.push('⚠️ Overspending detected: expenses exceed income.');
  const lowThreshold = Math.max(2000, income * 0.2);
  if (balance > 0 && balance < lowThreshold) messages.warnings.push(`⚠️ Low balance: ₹${balance.toFixed(2)} (threshold ₹${lowThreshold.toFixed(2)}).`);
  if (savings > 0) messages.positives.push(`✅ Positive savings: ₹${savings.toFixed(2)}. Consider investing via SIP.`);

  analysis.byPct
    .filter(x => x.pct >= 0.3)
    .forEach(x => messages.suggestions.push(`💡 High spend in ${x.name}: ${(x.pct * 100).toFixed(1)}%. Try to optimize this category.`));

  return messages;
}

function renderAdvisoryCards(messages) {
  const el = document.getElementById('advisoryCards');
  if (!el) return;
  const section = (title, list, color) => list.length ? `
    <div class="card" style="border-left:4px solid ${color};padding-left:10px">
      <div style="font-weight:700;margin-bottom:6px">${title}</div>
      <ul style="margin:0;padding-left:16px">${list.map(m=>`<li>${m}</li>`).join('')}</ul>
    </div>` : '';
  el.innerHTML = [
    section('Positives', messages.positives, '#16a34a'),
    section('Warnings', messages.warnings, '#dc2626'),
    section('Suggestions', messages.suggestions, '#2563eb'),
  ].join('');
}

// Refresh dashboard stat cards and warning banner using backend summary
async function refreshDashboardStats() {
  try {
    if (!API_BASE) { await pickApiBase(); }
    const now = new Date();
    const ym = String(now.getUTCFullYear()) + '-' + String(now.getUTCMonth()+1).padStart(2,'0');
    const resS = await fetch(`${API_BASE}/insights/summary?month=${ym}`, { cache: 'no-store' });
    if (!resS.ok) return;
    const s = await resS.json();
  const income = Number(s?.income ?? 0);
  const expenses = Number(s?.expenses ?? 0);
  const remaining = Number((s && s.remaining != null ? s.remaining : income - expenses) ?? 0);
  // Use actual backend income so dashboard reflects added income immediately
  const displayInc = income;
  const displayBal = income - expenses;
    const warn = document.getElementById('monthlyWarning');
    if (warn) {
      if (remaining < 0) {
        warn.style.color = '#b91c1c';
        warn.textContent = `Over limit for ${ym}. Expenses exceed income. Remaining: ₹${remaining.toFixed(2)}`;
      } else if (displayBal <= 1000) {
        warn.style.color = '#9a3412';
        warn.textContent = `Low balance warning for ${ym}: Only ₹${displayBal.toFixed(2)} left.`;
      } else if (s.nearingLimit) {
        warn.style.color = '#92400e';
        warn.textContent = `Warning: Nearing monthly limit for ${ym}. Remaining: ₹${remaining.toFixed(2)}`;
      } else {
        const savingsRate = displayInc > 0 ? (displayInc - expenses) / displayInc : 0;
        warn.style.color = '';
        warn.textContent = `Healthy. Remaining for ${ym}: ₹${displayBal.toFixed(2)} (Savings rate ${(savingsRate*100).toFixed(1)}%)`;
      }
    }
    // Update stat cards
    const sb = document.getElementById('statBalance');
    const si = document.getElementById('statIncome');
    const se = document.getElementById('statExpenses');
    const ss = document.getElementById('statSavings');
    if (sb || si || se || ss) {
  const dispRate = displayInc > 0 ? ((displayInc - expenses) / displayInc) : 0;
      if (sb) sb.textContent = `₹${displayBal.toFixed(2)}`;
      if (si) si.textContent = `₹${displayInc.toFixed(2)}`;
      if (se) se.textContent = `₹${expenses.toFixed(2)}`;
      if (ss) ss.textContent = `${(dispRate*100).toFixed(1)}%`;
    }
  } catch (_) {}
}

async function loadCategories() {
  try {
    const res = await fetch(`${API_BASE}/categories`);
    if (!res.ok) return;
    const cats = await res.json();
    const sel = document.getElementById('filterCategory');
    if (!sel) return;
    sel.innerHTML = '<option value="">All</option>' + cats.map(c=>`<option value="${c.name}">${c.name}</option>`).join('');
  } catch (e) {
    console.warn('Failed to load categories', e);
  }
}

async function deleteTxn(id) {
  if (!confirm('Delete this transaction?')) return;
  try {
    const res = await fetch(`${API_BASE}/transactions/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
    TXN_OFFSET = 0;
  await loadTransactions();
  // also refresh summary and dashboard stats
  try { if (document.getElementById('summaryResult')) { await loadSummary(); } } catch (e) { console.warn('loadSummary after delete failed', e); }
  try { await refreshDashboardStats(); } catch (e) { console.warn('refreshDashboardStats after delete failed', e); }
  } catch (e) {
    alert('Failed to delete: ' + e);
  }
}

// Wire up page on load
document.addEventListener('DOMContentLoaded', async () => {
  // prevent UI from flashing before backend health is confirmed
  try { document.documentElement.classList.add('app-init'); } catch {}
  // Simple auth guard: require demoUser on all pages except login
  try {
    const here = (location.pathname.split('/').pop() || '').toLowerCase();
    if (here !== 'login.html') {
      const demo = sessionStorage.getItem('demoUser');
      if (!demo) {
        // redirect unauthenticated users to login
        window.location.replace('login.html');
        return;
      }
    }
  } catch (e) {}

  await pickApiBase();
  // If backend is not reachable, block the app and show a clear error
  const ok = await checkBackendHealth();
  if (!ok) {
    // reveal UI so the banner is visible, then show a minimal error message
    try { document.documentElement.classList.remove('app-init'); } catch {}
    showBackendUnreachableOverlay();
    return;
  }
  // reveal UI when backend is healthy
  try { document.documentElement.classList.remove('app-init'); } catch {}
  await loadCategories();
  // initial load
  try { await loadTransactions(); } catch (e) { console.error('loadTransactions failed', e); }
  // Default the month input to current month if present and empty
  try {
    const mEl = document.getElementById('summaryMonth');
    if (mEl && !mEl.value) {
      const now = new Date();
      mEl.value = String(now.getUTCFullYear()) + '-' + String(now.getUTCMonth()+1).padStart(2,'0');
    }
  } catch (e) {}

  // If this page has a summary panel, load it by default
  try {
    if (document.getElementById('summaryResult')) {
      await loadSummary();
  // auto-refresh summary when controls change
  const mEl = document.getElementById('summaryMonth');
  const allEl = document.getElementById('summaryAllTime');
  if (mEl) mEl.addEventListener('change', () => loadSummary());
  if (allEl) allEl.addEventListener('change', () => loadSummary());
    }
  } catch (e) { console.warn('auto loadSummary failed', e); }

  // Recompute advisory when bank balance changes
  try {
    const bal = document.getElementById('bankBalanceInput');
    if (bal) {
      bal.addEventListener('input', () => {
        // Extract numbers from the current summary DOM if present
        try {
          const div = document.getElementById('summaryResult');
          if (!div) return;
          const extract = (label) => {
            const p = Array.from(div.querySelectorAll('p')).find(x => x.textContent && x.textContent.toLowerCase().includes(label));
            if (!p) return 0;
            const m = p.textContent.replace(/[,₹]/g,'').match(/(-?\d+(?:\.\d+)?)/);
            return m ? Number(m[1]) : 0;
          };
          const income = extract('income');
          const expenses = extract('expenses');
          // categories are not re-parsed here; rely on last loadSummary run (cards remain)
          const analysis = analyzeMonthlyExpenses({ income, expenses, categories: [] });
          const advisory = generateAdvisory(analysis, Number(bal.value || 0));
          renderAdvisoryCards(advisory);
        } catch (e) { console.warn('advisory recompute failed', e); }
      });
    }
  } catch (e) {}
  // initial dashboard stats refresh
  await refreshDashboardStats();

  const botBtn = document.getElementById('botToggle');
  if (botBtn) {
    botBtn.addEventListener('click', () => {
      if (!botActive) {
        startBot();
        botBtn.textContent = '🤖 Stop Bot';
      } else {
        stopBot();
        botBtn.textContent = '🤖 Bot';
      }
    });
  }

  // Wire the header voice input button to start/stop the bot
  const headerVoice = document.getElementById('voiceInputBtn');
  if (headerVoice) {
    // Use the simpler single-shot voice for header to match previous UX
    headerVoice.addEventListener('click', () => {
      try { startVoice(); } catch (e) { console.warn('startVoice failed', e); }
    });
  }
  // restore bot state after reloads if user had it active
  try {
    const prev = sessionStorage.getItem('botActive');
    if (prev === '1') {
      // attempt to auto-restore if we already have mic permission
      navigator.permissions && navigator.permissions.query && navigator.permissions.query({ name: 'microphone' }).then(p => {
        if (p.state === 'granted') {
          startBot();
          if (botBtn) botBtn.textContent = '🤖 Stop Bot';
        } else {
          showContinueButton();
        }
      }).catch(()=>{ showContinueButton(); });
    }
  } catch (e) {}
  // create Speak/Stop controls for single-shot bot
  const botControls = document.createElement('span');
  botControls.style.marginLeft = '10px';
  botControls.innerHTML = '<button id="botSpeakBtn" style="display:none;margin-right:6px">Speak</button><button id="botStopBtn" style="display:none">Stop</button>';
  if (botBtn && botBtn.parentNode) botBtn.parentNode.insertBefore(botControls, botBtn.nextSibling);
  const speakBtn = document.getElementById('botSpeakBtn');
  const stopBtn = document.getElementById('botStopBtn');
  if (speakBtn) speakBtn.addEventListener('click', () => botSpeak());
  if (stopBtn) stopBtn.addEventListener('click', () => stopBot());

  // Dark mode toggle wiring: sidebar 'Dark Mode' link toggles class on <html>
  document.querySelectorAll('#appSidebar a').forEach(a => {
    if (!a) return;
    if (a.textContent && /dark mode/i.test(a.textContent)) {
      a.addEventListener('click', (ev) => {
        ev.preventDefault();
        const isDark = document.documentElement.classList.toggle('dark-mode');
        try { localStorage.setItem('darkMode', isDark ? '1' : '0'); } catch (e) {}
      });
    }
  });

  // restore dark mode preference
  try {
    const dm = localStorage.getItem('darkMode');
    if (dm === '1') document.documentElement.classList.add('dark-mode');
  } catch (e) {}

  // Render demo user info in header and wire logout controls
  function renderDemoUser() {
    try {
      const raw = sessionStorage.getItem('demoUser') || null;
      const u = raw ? JSON.parse(raw) : null;
      const headerEl = document.getElementById('demoUserDisplay');
      const dashName = document.getElementById('demoName');
      if (u) {
        // show name and small email; keep markup minimal so existing CSS applies
        if (headerEl) headerEl.innerHTML = `<div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px"><span style="font-weight:600">${u.name}</span><small style="color:var(--muted);font-size:12px">${u.email}</small><a href='#' id='headerLogout' style='color:var(--primary);font-size:12px;margin-top:4px'>Logout</a></div>`;
        if (dashName) dashName.textContent = u.name;
      } else {
        if (headerEl) headerEl.innerHTML = `<span class="muted">Demo User</span>`;
        if (dashName) dashName.textContent = 'Demo User';
      }
      // wire header logout if present
      const hOut = document.getElementById('headerLogout');
      if (hOut) hOut.addEventListener('click', (ev) => {
        ev.preventDefault();
        try { sessionStorage.removeItem('demoUser'); } catch (e) {}
        // redirect to login
        window.location.href = 'login.html';
      });
      // wire sidebar logout
      const sOut = document.getElementById('sidebarLogout');
      if (sOut) {
        sOut.addEventListener('click', (ev) => {
          ev.preventDefault();
          try { sessionStorage.removeItem('demoUser'); } catch (e) {}
          window.location.href = 'login.html';
        });
      }
    } catch (e) { console.warn('renderDemoUser error', e); }
  }
  // initial render and also re-render when storage changes in other tabs
  renderDemoUser();
  window.addEventListener('storage', (ev) => { if (ev.key === 'demoUser') renderDemoUser(); });

  const btnLoadMore = document.getElementById('btnLoadMore');
  if (btnLoadMore) btnLoadMore.addEventListener('click', async () => {
    TXN_OFFSET += TXN_LIMIT;
    await loadTransactions();
  });

  const btnApply = document.getElementById('btnApplyFilters');
  if (btnApply) btnApply.addEventListener('click', async () => {
    TXN_FILTER.month = document.getElementById('filterMonth').value || null;
    TXN_FILTER.category = document.getElementById('filterCategory').value || '';
    TXN_FILTER.sort = document.getElementById('filterSort').value || 'date_desc';
    TXN_FILTER.max = document.getElementById('filterMax').value || '';
    TXN_FILTER.min = document.getElementById('filterMin').value || '';
    TXN_OFFSET = 0;
    await loadTransactions();
  });

  const btnReset = document.getElementById('btnResetFilters');
  if (btnReset) btnReset.addEventListener('click', async () => {
    document.getElementById('filterMonth').value = '';
    document.getElementById('filterCategory').value = '';
    document.getElementById('filterSort').value = 'date_desc';
    document.getElementById('filterMax').value = '';
    document.getElementById('filterMin').value = '';
    TXN_FILTER = { month: null, category: '', sort: 'date_desc', min: '', max: '' };
    TXN_OFFSET = 0;
    await loadTransactions();
  });

  const btnPdf = document.getElementById('btnDownloadPdf');
  if (btnPdf) btnPdf.addEventListener('click', () => {
  const m = (document.getElementById('summaryMonth') && document.getElementById('summaryMonth').value) || document.getElementById('filterMonth')?.value;
  if (!m) return alert('Choose month for PDF');
  window.open(`${API_BASE}/reports/monthly-pdf?month=${m}`, '_blank');
  });
});
