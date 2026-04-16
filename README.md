# QuantLens — Investment Research Cockpit

A quantitative investment research tool with 8 live signal models and AI-powered verdict.

## Features
- **Live data** from Yahoo Finance (server-side, no CORS issues)
- **8 quant models**: GARCH, Kalman Filter, HMM Regime, Momentum, RSI, MACD, Mean Reversion, Factor Scores
- **AI Verdict**: Claude synthesizes all signals into a BUY/SELL/HOLD recommendation
- **Mobile-ready**: Works on iPhone via Safari

---

## Deploy to Vercel in 10 minutes

### Step 1 — Get your Anthropic API key
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Click **API Keys** → **Create Key**
3. Copy the key (starts with `sk-ant-...`)

### Step 2 — Put the code on GitHub
1. Go to [github.com](https://github.com) and create a new repository called `quantlens`
2. Upload all these files to the repo (drag and drop works)

### Step 3 — Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **Add New Project** → select your `quantlens` repo
3. Click **Deploy** (no build settings needed — Vercel auto-detects Next.js)

### Step 4 — Add your API key
1. In Vercel, go to your project → **Settings** → **Environment Variables**
2. Add:
   - **Name**: `ANTHROPIC_API_KEY`
   - **Value**: your key from Step 1
3. Click **Save** then **Redeploy**

### Step 5 — Open on iPhone
1. Open Safari on your iPhone
2. Go to your Vercel URL (e.g. `quantlens-xxx.vercel.app`)
3. Tap the **Share** button → **Add to Home Screen**
4. Done — it works like a native app!

---

## Run locally (optional)
```bash
npm install
cp .env.local.example .env.local
# Edit .env.local and add your ANTHROPIC_API_KEY
npm run dev
# Open http://localhost:3000
```

---

## Project structure
```
quantlens/
├── app/
│   ├── api/
│   │   ├── stock/route.js   ← Yahoo Finance proxy (server-side)
│   │   └── ai/route.js      ← Anthropic API (server-side, key never exposed)
│   ├── page.js              ← Main UI
│   ├── layout.js            ← Root layout
│   └── globals.css          ← Base styles
├── lib/
│   └── models.js            ← All 8 quant models
├── .env.local.example       ← Copy to .env.local and add your key
├── package.json
└── next.config.js
```

---

## Notes
- Yahoo Finance data is cached for 5 minutes per ticker
- The Anthropic API key is **server-side only** — never visible in the browser
- Supports any US stock ticker (MRVL, NVDA, AAPL, MSFT, TSLA, AMD, etc.)
