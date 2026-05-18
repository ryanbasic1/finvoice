
# FinVoice Demo Backend (Local, Zero-Setup)

This is a minimal, working backend for the FinVoice demo using **Express + Prisma + SQLite** so you can run it locally in minutes. We will later switch to PostgreSQL and add advanced features.

## Prereqs
- Node.js 20+
- pnpm (recommended) or npm/yarn
- VS Code

## Setup
```bash
# 1) Unzip and open in VS Code
cp .env.example .env

# 2) Install deps
pnpm install
# or: npm install

# 3) Generate Prisma client & create DB
pnpm prisma:generate
pnpm prisma:migrate

# 4) Seed demo data (user, account, categories)
pnpm seed

# 5) Run
pnpm dev
# API at http://localhost:4000
```

## Test quickly

### Health
```bash
curl http://localhost:4000/health
```

### Add by free text (simulates voice transcript)
```bash
curl -X POST http://localhost:4000/voice/add \
  -H "Content-Type: application/json" \
  -d '{"text": "Add dinner ₹300 yesterday"}'
```

### List transactions
```bash
curl http://localhost:4000/transactions
```

### Insights for current month (adjust YYYY-MM)
```bash
curl "http://localhost:4000/insights/summary?month=2025-08"
```

### Goal planner (SIP)
```bash
curl -X POST http://localhost:4000/goals/required-sip \
  -H "Content-Type: application/json" \
  -d '{"targetAmount": 600000, "months": 36, "annualRatePct": 12}'
```

## Notes
- The `/voice/add` endpoint parses your text, categorizes with rules, and creates a transaction instantly.
- Currency defaults to INR. We'll add proper currency & date localization later.
- Next steps: add JWT auth, budgets, realtime websockets, and plug this into a React Native app.
