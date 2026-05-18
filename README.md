<div align="center">

# ◈ FinVoice

### Voice + Hinglish Powered Personal Finance Tracker

Track expenses using natural language like:

```text
"₹500 for groceries yesterday"
```

Built with:

**Express • Prisma • SQLite • Python NLP**

<br>

<img src="https://img.shields.io/badge/Node.js-Backend-111111?style=for-the-badge&logo=node.js">
<img src="https://img.shields.io/badge/Prisma-SQLite-222222?style=for-the-badge">
<img src="https://img.shields.io/badge/Python-NLP-333333?style=for-the-badge&logo=python">
<img src="https://img.shields.io/badge/Hinglish-Supported-444444?style=for-the-badge">

</div>

---

# ◉ MVP Overview

FinVoice is a local-first personal finance demo application that allows users to:

- Add expenses using free-text or Hinglish input
- Automatically categorize expenses
- View monthly financial insights
- Track income and remaining balance
- Calculate SIP investments
- Manage transactions through a lightweight web UI

The MVP is fully functional and runs locally.

---

# ◈ Core Features

```diff
+ Hinglish Expense Parsing
+ Auto Expense Categorization
+ Monthly Financial Insights
+ SIP Calculator
+ SQLite Database
+ Local Demo User System
+ Rule-Based NLP Engine
+ Python NLP Microservice
+ Lightweight Frontend
+ No Frontend Build Step
```

---

# ◉ Project Structure

```text
finvoice-demo-backend/
│
├── dist/
├── node_modules/
├── prisma/
├── scripts/
├── src/
│   ├── utils/
│   │   ├── categorize.ts
│   │   └── nlp.ts
│   └── index.ts
│
├── .env
├── .env.example
├── hinglish_nlp_service.py
├── package.json
├── tsconfig.json
│
frontend/
│
├── add-transaction.html
├── app.js
├── dashboard.html
├── income.html
├── index.html
├── login.html
├── monthly-summary.html
├── news.html
├── online.html
├── sip.html
└── style.css
```

---

# ◈ MVP Components

## Backend API

Main server:

```text
finvoice-demo-backend/src/index.ts
```

Responsibilities:

- Transaction APIs
- Insights APIs
- Income management
- SIP calculations
- Monthly summaries
- Category handling
- Demo user setup

---

## NLP Parsing Engine

Main parsing logic:

```text
finvoice-demo-backend/src/utils/nlp.ts
```

Features:

- Hinglish date parsing
- Amount extraction
- Text normalization
- Description cleanup
- Rule-based transaction parsing

Examples handled:

```text
aaj
kal
pichle mahine
₹500
5k
2 lakh
```

---

## Categorization Engine

Located in:

```text
finvoice-demo-backend/src/utils/categorize.ts
```

Features:

- India-specific categories
- Merchant keyword matching
- Fuzzy matching fallback
- Levenshtein distance support

Supported categories include:

- Food
- Groceries
- Fuel
- Bills
- Shopping
- Travel
- Entertainment

---

## Python NLP Microservice

File:

```text
hinglish_nlp_service.py
```

Powered by:

- Flask
- HuggingFace Transformers
- NER extraction

Purpose:

- Smarter entity extraction
- Future AI-enhanced parsing
- Advanced NLP experimentation

The app still works fully without this service.

---

# ◉ Frontend

Frontend is built using:

- HTML
- CSS
- Vanilla JavaScript

No React or frontend build process required.

---

## Pages

| Page | Purpose |
|---|---|
| dashboard.html | Overview + recent transactions |
| add-transaction.html | Add expenses |
| income.html | Manage salary/income |
| monthly-summary.html | Monthly insights |
| sip.html | SIP calculator |
| login.html | Demo login |
| news.html | Financial/news section |
| online.html | Online utilities |

---

# ◈ End-to-End Data Flow

```text
User Input
"₹500 for groceries yesterday"
            ↓
parseMultiText()
            ↓
Amount + Date Extraction
            ↓
categorize()
            ↓
Category Assignment
            ↓
Prisma Database Entry
            ↓
Frontend Summary APIs
            ↓
Dashboard Insights
```

---

# ◉ Tech Stack

## Backend

| Technology | Usage |
|---|---|
| Node.js | Runtime |
| Express | API framework |
| Prisma | ORM |
| SQLite | Database |
| Zod | Validation |
| Chrono-node | Date parsing |

---

## NLP Layer

| Technology | Usage |
|---|---|
| Python | NLP processing |
| Flask | Microservice |
| Transformers | NER extraction |

---

## Frontend

| Technology | Usage |
|---|---|
| HTML | Structure |
| CSS | Styling |
| JavaScript | UI Logic |

---

# ◈ Installation

## Clone Repository

```bash
git clone <repo-url>

cd finvoice-demo-backend
```

---

## Install Dependencies

```bash
pnpm install
```

---

## Setup Environment

```bash
cp .env.example .env
```

---

## Prisma Setup

```bash
pnpm prisma:generate

pnpm prisma:migrate
```

---

## Seed Demo Data

```bash
pnpm seed
```

---

## Start Development Server

```bash
pnpm dev
```

Backend runs at:

```text
http://localhost:4000
```

---

# ◉ Frontend Setup

Open directly:

```text
frontend/index.html
```

Or use:

- VS Code Live Server
- Any static file server

Frontend auto-detects backend ports.

---

# ◈ Monthly Insights

The dashboard provides:

- Total income
- Total expenses
- Remaining balance
- Category breakdowns
- Recent transaction history

---

# ◉ SIP Calculator

The SIP module supports:

- Monthly investment calculations
- Estimated future returns
- Goal planning
- Investment duration analysis

---

# ◈ Local-First Architecture

Benefits of the current setup:

| Benefit | Description |
|---|---|
| Lightweight | Minimal dependencies |
| Fast | SQLite local DB |
| Easy Setup | No cloud infrastructure |
| Portable | Works locally |
| Simple | No frontend build step |

---

# ◉ Example Inputs

```text
₹120 chai today
```

```text
Swiggy order 450
```

```text
Uber ride 230 yesterday
```

```text
Paid electricity bill 1800
```

---

# ◈ Future Improvements

- JWT Authentication
- Budget tracking
- Recurring bills
- AI financial assistant
- Better multilingual NLP
- Voice recording support
- Charts & analytics
- Mobile app integration
- OCR bill scanning
- Smart financial recommendations

---

# ◉ Development Notes

```diff
+ Rule-based NLP already production usable
+ Python NLP service optional
+ India-focused categorization
+ Fully local database
+ Lightweight architecture
+ Frontend requires no build tools
```

---

# Aryan and team Developed !!
---

<div align="center">

### Built for Smart Personal Finance Tracking

</div>
