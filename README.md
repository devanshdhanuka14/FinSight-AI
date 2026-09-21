# FinSight AI

**AI-powered research briefs for any NSE-listed stock. One ticker in, an analyst-style brief out, in about 10 seconds.**

[![Live](https://img.shields.io/badge/Live-finsight--ai--hazel.vercel.app-5367FF?style=for-the-badge)](https://finsight-ai-hazel.vercel.app)
![Python](https://img.shields.io/badge/Python-3.12+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Gemini](https://img.shields.io/badge/Google%20Gemini-8E75B2?style=for-the-badge&logo=googlegemini&logoColor=white)

> ⚠️ **Disclaimer:** FinSight AI is an educational project. Nothing it produces is financial advice. Always verify data independently and consult a SEBI-registered advisor before making investment decisions.

---

## Table of Contents

- [The Problem](#the-problem)
- [What FinSight AI Does](#what-finsight-ai-does)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Data Sources](#data-sources)
- [How the AI Layer Works](#how-the-ai-layer-works)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [API Reference](#api-reference)
- [Caching Strategy](#caching-strategy)
- [Running Locally](#running-locally)
- [Deployment](#deployment)
- [Engineering Challenges & How They Were Solved](#engineering-challenges--how-they-were-solved)
- [Known Limitations](#known-limitations)
- [Roadmap](#roadmap)
- [Part of a Fintech Portfolio](#part-of-a-fintech-portfolio)
- [Author](#author)

---

## The Problem

Getting a complete picture of an Indian stock usually means juggling at least four tabs: a broker app for price and charts, Screener.in for fundamentals, a news site for headlines, and NSE for corporate filings. Then you still have to connect the dots yourself.

Institutional equity research solves this, but it is paid, slow, and not available on demand for every stock.

**FinSight AI collapses that workflow into a single search.** It gathers price action, technicals, fundamentals, ownership trends, peer comparison, official exchange filings, and news, then hands all of it to an LLM that writes a structured, data-grounded research brief.

---

## What FinSight AI Does

Enter an NSE symbol (autocomplete helps with the exact symbol) and FinSight AI returns:

| Section | What you get |
|---|---|
| **Stock header** | Company name, sector and industry, live price and daily change, market cap, P/E, EPS, 52-week range, annualised volatility, and a technical signal badge |
| **Fundamentals** | ROE, ROCE, sector P/E vs stock P/E, delivery %, RSI, volume ratio |
| **Performance vs Nifty 50** | 1-month, 3-month and 1-year returns of the stock against the index, with the difference colour-coded |
| **Price chart** | Interactive candlestick chart with MA20 and MA50 overlays and a 1M / 3M / 6M range toggle |
| **News sentiment** | Bullish / Neutral / Bearish label with AI-written reasoning |
| **Shareholding trend** | Last 4 quarters of Promoter, FII and DII holdings |
| **Key risks & opportunities** | Specific, number-backed bullet points written by the AI |
| **Analyst verdict** | A ~150-word research note grounded in the data above |
| **Peer comparison** | Closest sector peers with CMP, P/E, market cap, ROCE and quarterly growth, with the searched stock highlighted |
| **Recent news** | Dated headlines from a dual-source news pipeline |
| **NSE corporate announcements** | Filtered, material exchange filings (collapsible) |
| **Growth trends** | Year-on-year revenue and profit growth charts |
| **PDF export** | One-click print-ready export of the full brief |

The landing page also shows **live NSE indices** (Nifty 50, Nifty Next 50, Nifty Bank, Nifty IT, Nifty Midcap 100) and your **recent searches** with their sentiment labels.

---

## Screenshots

> Add screenshots to a `docs/` folder and update the paths below.

| Landing page | Research brief |
|---|---|
| ![Landing page](docs/landing.png) | ![Research brief](docs/research-brief.png) |

| Peer comparison | Analyst verdict |
|---|---|
| ![Peers](docs/peers.png) | ![Verdict](docs/verdict.png) |

---

## Architecture

```mermaid
flowchart TD
    U[User] -->|NSE symbol| FE[React Frontend<br/>Vercel]
    FE -->|GET /api/v1/research/TICKER| API[FastAPI Backend<br/>Render]

    API --> C{Cached in<br/>PostgreSQL?}
    C -->|Yes| RET[Return cached brief]
    C -->|No| PIPE[Data Pipeline]

    subgraph PIPE_SUB[Data Pipeline]
        YF[yfinance<br/>price, basics, OHLCV]
        TECH[Technical engine<br/>MA20, MA50, RSI, volume]
        SCR[Screener.in scrape<br/>ROE, ROCE, growth,<br/>shareholding, peers]
        NSE[NSE internal API<br/>sector P/E, volatility,<br/>delivery %, returns vs Nifty,<br/>announcements]
        NEWS[News pipeline<br/>yfinance + Google RSS]
    end

    PIPE --> YF --> TECH
    PIPE --> SCR
    PIPE --> NSE
    PIPE --> NEWS

    TECH --> PROMPT[Structured prompt builder]
    SCR --> PROMPT
    NSE --> PROMPT
    NEWS --> PROMPT

    PROMPT --> GEM[Gemini API]
    GEM -->|Structured JSON| STORE[Clean NaNs, store in cache,<br/>log search history]
    STORE --> DB[(Supabase<br/>PostgreSQL)]
    STORE --> RET
    RET --> FE
```

### Request lifecycle

1. The frontend calls `GET /api/v1/research/{ticker}`.
2. The backend checks the `research_cache` table for a fresh result. If found, it is returned immediately.
3. On a cache miss, the fundamentals service collects price, technicals, Screener.in data, peers and NSE data.
4. The news service fetches recent, relevant headlines using the company name returned by yfinance.
5. Everything is assembled into one structured prompt and sent to Gemini, which returns JSON.
6. The response is cleaned (NaN values from pandas are converted to `null`), cached, logged to search history, and returned.
7. The frontend separately calls `/api/v1/chart/{ticker}` to draw the candlestick chart.

---

## Data Sources

FinSight AI deliberately avoids paid market-data APIs. It combines five free sources, each chosen for what it does best.

### 1. yfinance
- Live price, previous close, daily change, market cap, trailing P/E, EPS, 52-week high/low
- 6 months of daily OHLCV data used by the technical engine and the chart
- Ticker-specific news (primary news source)
- NSE symbols are queried with the `.NS` suffix, e.g. `INFY` becomes `INFY.NS`

### 2. Technical engine (computed in-house)
Computed from 6-month OHLCV with pandas:
- **MA20 and MA50** simple moving averages
- **RSI (14)** using rolling average gains and losses
- **Volume spike detection** comparing the latest volume with its 20-day average
- A **signal engine** that combines trend (price vs both MAs) and momentum (RSI bands) into labels like `STRONG BUY SIGNAL`, `BEARISH BUT OVERSOLD` or `MIXED SIGNALS`, plus a plain-English explanation

### 3. Screener.in (scraped with BeautifulSoup)
- **Top ratios:** ROE and ROCE
- **Profit & Loss table:** the last 4 annual Sales and Net Profit values, converted into 3 years of year-on-year growth
- **Shareholding pattern:** the last 4 quarters of Promoter, FII and DII holdings
- **Peer comparison:** fetched from Screener's internal peers endpoint using the company's warehouse ID

### 4. NSE internal API (reverse-engineered)
Discovered by inspecting the network calls NSE's own website makes:
- `getSymbolData`: sector, industry, **sector P/E vs stock P/E**, **annualised volatility**, **delivery-to-traded quantity**
- `getYearwiseData`: stock returns vs Nifty 50 over 1 month, 3 months and 1 year
- `corporate-announcements`: official exchange filings, filtered down to material events (results, acquisitions, credit ratings, litigation, dividends, press releases and so on)
- `getIndexData`: live index values for the landing page
- `search/autocomplete`: symbol search for the autocomplete dropdown

### 5. News pipeline (dual source)
- **Primary:** yfinance news for the ticker, filtered to the last 90 days
- **Fallback:** Google News RSS via feedparser, triggered when fewer than 8 headlines come back
- Headlines are deduplicated, filtered for relevance to the company name, and returned with their dates so the AI can weigh recency

---

## How the AI Layer Works

The LLM is **not** used to look up facts. All numbers are fetched and computed in Python first. Gemini's only job is reasoning over that data.

### Prompt design

The prompt in `app/services/gemini.py` has three parts.

**1. Role and rules.** Gemini is told it is a senior equity research analyst writing for Indian retail investors, that its view must be grounded strictly in the supplied data rather than prior knowledge, and that vague analysis is not acceptable.

**2. Labelled data blocks.** Each section tells the model what the data is and how to use it:
- Price
- Technicals
- Fundamentals (P/E, ROE, ROCE, 3-year revenue and profit growth)
- Valuation context (sector P/E, volatility, delivery %)
- Price performance vs Nifty 50
- Shareholding trend
- NSE corporate announcements (official filings, used for material corporate actions)
- News headlines (third-party coverage, used for sentiment)
- Peer comparison (used for relative valuation)

**3. Strict output contract.** Gemini must return only this JSON:

```json
{
  "news_sentiment": {
    "label": "Bullish | Neutral | Bearish",
    "reasoning": "2-3 sentences"
  },
  "key_risks": ["...", "...", "..."],
  "key_opportunities": ["...", "...", "..."],
  "analyst_verdict": "~150 word verdict"
}
```

The backend strips any markdown code fences the model adds and parses the result with `json.loads`.

### Why an LLM instead of rule-based sentiment?

An earlier project in this portfolio used VADER plus keyword lists for sentiment. VADER was built for social media text and misreads financial language. "Beats estimates by 2%" is bullish, but "beats estimates by 2% while management cuts guidance" is bearish. Keyword rules cannot handle that context; an LLM given the full picture can.

### Why Gemini Flash?

- Fast responses, which matters for the "about 10 seconds" goal
- A free tier with enough quota for a portfolio project
- Reliable structured JSON output for this kind of task

The exact model string lives in `app/services/gemini.py` and can be swapped as Google releases new models.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend framework** | FastAPI, Uvicorn |
| **Configuration** | pydantic-settings, python-dotenv |
| **Market data** | yfinance, NSE internal API (via `requests`) |
| **Scraping** | BeautifulSoup4, requests |
| **News** | yfinance news, feedparser (Google News RSS) |
| **Data processing** | pandas |
| **AI** | Google Gemini API (`google-genai`) |
| **Database / ORM** | PostgreSQL on Supabase, SQLAlchemy, psycopg2 |
| **Frontend** | React, Vite, Tailwind CSS, Plotly.js |
| **Hosting** | Render (backend), Vercel (frontend), Supabase (database) |

---

## Project Structure

```
FinSight-AI/
├── app/
│   ├── main.py                 # FastAPI app, CORS middleware, router registration
│   ├── config.py               # Settings loaded from .env via pydantic-settings
│   ├── routes/
│   │   └── research.py         # All API endpoints + NaN cleaning
│   ├── models/
│   │   └── database.py         # SQLAlchemy models, engine, session factory
│   └── services/
│       ├── fundamentals.py     # yfinance, technicals, Screener.in scraper, peers, NSE merge
│       ├── nse.py              # NSE API client: symbol data, returns, announcements, indices
│       ├── news.py             # Dual-source news pipeline
│       ├── gemini.py           # Prompt builder + Gemini call + JSON parsing
│       └── cache.py            # Cache read/write and search history
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Entire single-page UI
│   │   ├── main.jsx
│   │   └── index.css           # Tailwind + print styles for PDF export
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── tailwind.config.js
├── requirements.txt
├── railway.json                # Start command (kept from the original Railway deploy)
├── .env.example
└── .gitignore
```

### What each backend service does

**`fundamentals.py`**
- `fetch_yfinance_data`: price and basic fundamentals
- `_get_screener_soup`: downloads and parses the Screener.in company page once
- `fetch_screener_data`: extracts the top ratio list (ROE, ROCE)
- `_get_growth_from_pl`: 3 years of YoY growth for any P&L row
- `_get_shareholding`: last 4 quarters for Promoters, FIIs and DIIs
- `_get_screener_company_id` + `fetch_peers`: finds the warehouse ID and calls the peers endpoint
- `compute_indicators`, `get_signal`, `is_volume_spike`, `get_technicals`: the technical engine
- `get_fundamentals`: orchestrates all of the above plus the NSE data into one dict

**`nse.py`**
- `get_nse_session`: a `requests.Session` with browser-like headers
- `fetch_nse_data` + `parse_nse_data`: fetch raw NSE responses, then flatten them into clean fields
- `is_material`: keyword-based filter that keeps meaningful announcements and drops routine filings
- `fetch_market_indices`: the five landing-page indices

**`news.py`**
- `fetch_yfinance_news`, `fetch_rss_news`, `fetch_news`

**`gemini.py`**
- `build_prompt`, `get_research`

**`cache.py`**
- `get_cached_research`, `store_research`, `log_search`, `get_search_history`

---

## API Reference

Base URL: `https://finsight-ai-cirw.onrender.com/api/v1`

Interactive docs are available at `/docs` (Swagger UI) on any running instance.

### `GET /health`
Liveness check.
```json
{ "status": "ok", "service": "finsight-ai" }
```

### `GET /research/{ticker}`
The main endpoint. Returns the full research brief. Served from cache when a fresh result exists.

```bash
curl https://finsight-ai-cirw.onrender.com/api/v1/research/INFY
```

Abbreviated response:
```json
{
  "news_sentiment": { "label": "Neutral", "reasoning": "..." },
  "key_risks": ["..."],
  "key_opportunities": ["..."],
  "analyst_verdict": "...",
  "fundamentals": {
    "company_name": "Infosys Limited",
    "current_price": 1318.7,
    "change_pct": -0.04,
    "week_52_high": 1728.0,
    "week_52_low": 1215.1,
    "market_cap": 5336302354432,
    "pe_ratio": 18.35,
    "eps": 71.87,
    "roce": 37.5,
    "roe": 28.8,
    "revenue_growth": [4.7, 6.06, 6.25],
    "profit_growth": [8.88, 1.91, 4.68],
    "shareholding_pattern": {
      "Promoters": [14.61, 14.3, 14.52, 14.38],
      "FIIs": [31.92, 30.08, 30.27, 28.45],
      "DIIs": [39.39, 41.46, 41.08, 43.19]
    },
    "technicals": {
      "trend": "Short-term strength, long-term weak",
      "verdict": "MIXED SIGNALS",
      "rsi": 58.5, "ma20": 1286.18, "ma50": 1339.84,
      "volume_spike": false, "volume_ratio": 0.88,
      "reasoning": "..."
    },
    "nse": {
      "sector": "Information Technology",
      "sector_pe": "18.52", "symbol_pe": "19.11",
      "annual_volatility": "30.95", "delivery_pct": 59.86,
      "returns": { "one_month": 7.06, "three_month": -21.88, "one_year": -7.01 },
      "index_returns": { "one_month": 3.28, "three_month": -5.22, "one_year": 2.1 },
      "announcements": [{ "date": "...", "type": "...", "summary": "..." }]
    },
    "peers": [{ "name": "TCS", "cmp": 2589.0, "pe": 17.91, "roce": 63.03, "...": "..." }]
  },
  "news": [{ "headline": "...", "date": "2026-04-12" }],
  "cached": false
}
```

### `GET /chart/{ticker}`
6 months of OHLCV with MA20 and MA50 series for the candlestick chart. Early MA values are `null` until enough data points exist.
```json
{ "dates": [...], "open": [...], "high": [...], "low": [...], "close": [...],
  "volume": [...], "ma20": [null, ...], "ma50": [null, ...] }
```

### `GET /indices`
Live values for the five landing-page indices.
```json
[{ "name": "NIFTY 50", "last": 24353.55, "change_pct": 0.65,
   "year_high": 26373.2, "year_low": 22182.55 }]
```

### `GET /search?q={query}`
Proxies NSE's autocomplete and returns up to 8 equity matches.
```json
[{ "symbol": "TMPV", "name": "Tata Motors Passenger Vehicles Limited" }]
```

### `GET /history`
The last 20 searches with their sentiment labels.
```json
[{ "ticker": "INFY", "queried_at": "2026-04-20T08:11:02", "verdict_label": "Neutral" }]
```

---

## Caching Strategy

A single research brief touches yfinance, Screener.in (twice), NSE (three endpoints), Google News and Gemini. That is slow and burns LLM quota, so results are cached in PostgreSQL.

**Tables**

| Table | Columns | Purpose |
|---|---|---|
| `research_cache` | `ticker` (PK), `full_response_json`, `fetched_at` | One cached brief per ticker, upserted on refresh |
| `search_history` | `id` (UUID), `ticker`, `queried_at`, `verdict_label` | Powers the "Recent" chips on the landing page |

**Behaviour**
- On each request, a row younger than the TTL is returned immediately with `"cached": true`.
- The TTL is controlled by `CACHE_TTL_HOURS` in `app/services/cache.py`.
- Tables are created automatically with SQLAlchemy's `Base.metadata.create_all`.

---

## Running Locally

### Prerequisites
- Python 3.12+
- Node.js 18+
- A PostgreSQL database (a free Supabase project works well)
- A Gemini API key from [Google AI Studio](https://aistudio.google.com)

### 1. Clone the repository
```bash
git clone https://github.com/devanshdhanuka14/FinSight-AI.git
cd FinSight-AI
```

### 2. Backend setup
```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Create a `.env` file in the project root (see `.env.example`):
```dotenv
GEMINI_API_KEY=your_gemini_api_key
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
```

> **Supabase tip:** use the **session pooler** connection string (host ends in `pooler.supabase.com`, port `5432`). The direct connection host is IPv6-only and fails on most free hosting platforms. Double-check the URL ends in exactly one `/postgres`.

Create the tables:
```bash
python -c "from app.models.database import init_db; init_db()"
```

Start the API:
```bash
uvicorn app.main:app --reload
```

The API runs at `http://localhost:8000` with docs at `http://localhost:8000/docs`.

### 3. Frontend setup
```bash
cd frontend
npm install
npm run dev
```

The app runs at `http://localhost:3000` (Vite picks the next free port if 3000 is taken). Without `VITE_API_URL`, the frontend falls back to `http://localhost:8000`.

---

## Deployment

| Component | Platform | Notes |
|---|---|---|
| Backend | **Render** (Web Service) | Build: `pip install -r requirements.txt` · Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT` · Health check: `/api/v1/health` |
| Frontend | **Vercel** | Root directory `frontend`, Vite preset, env var `VITE_API_URL` set to the backend URL |
| Database | **Supabase** | Free-tier PostgreSQL, session pooler connection |

### Environment variables

| Variable | Where | Description |
|---|---|---|
| `GEMINI_API_KEY` | Backend | Google Gemini API key |
| `DATABASE_URL` | Backend | PostgreSQL connection string |
| `VITE_API_URL` | Frontend (build time) | Public URL of the backend, without a trailing `/api/v1` |

> `VITE_API_URL` is baked in at build time, so redeploy the frontend after changing it.

---

## Engineering Challenges & How They Were Solved

**NSE blocks naive scrapers.**
NSE's public pages are backed by undocumented JSON endpoints. They were found by watching the browser's Network tab, then called with browser-like headers from a `requests.Session`. The endpoint paths also changed during development (they moved under `/api/NextApi/apiClient/`), so the calls were updated to match what the site itself uses.

**Screener.in's peer table is rendered by JavaScript.**
The peers section exists in the initial HTML but the table does not. Instead of adding a headless browser, the Network tab revealed an internal endpoint, `/api/company/{warehouse_id}/peers/`. The `warehouse_id` is read from a data attribute on the main company page, so peers load with one extra lightweight request.

**yfinance silently changed its news schema.**
News timestamps moved from a top-level Unix `providerPublishTime` to an ISO `pubDate` string inside `content`, which quietly produced zero headlines. The parser now reads the new field, and Google News RSS remains as a fallback for tickers where yfinance returns nothing.

**Routine filings drown out material ones.**
A large company can file thousands of NSE announcements, most of them routine (newspaper ads, ESOP allotments, depository certificates). A case-insensitive keyword filter keeps material categories and explicitly drops known noise, including the generic "Disclosure under Regulation 30" filings.

**NaN values break JSON responses.**
pandas and numpy produce `NaN` and `numpy.bool` values that are not JSON-serialisable. Technical outputs are cast to native Python types, and a recursive `clean_nans` pass converts `NaN` to `null` on both fresh and cached responses.

**LLMs don't always follow "JSON only".**
Gemini sometimes wraps its output in markdown code fences. The response is stripped of fences before parsing.

**Free-tier infrastructure.**
Supabase pauses inactive free projects, Render's free tier sleeps after inactivity, and Gemini's free quota differs by model. The model name is a single line to change, and the known operational quirks are listed below.

---

## Known Limitations

- **Unofficial data sources.** NSE's internal API and Screener.in's HTML can change without notice and break parts of the pipeline.
- **Screener.in guest view.** Some ratios, such as debt-to-equity, only appear for logged-in users, so they are not included.
- **Exact NSE symbols required.** The pipeline expects NSE symbols (`TMPV`, `ETERNAL`), not common names. The autocomplete helps users find them. Delisted or renamed symbols return errors.
- **Sequential pipeline.** Data sources are currently fetched one after another rather than concurrently, so uncached requests can take longer than 10 seconds.
- **Cold starts.** On Render's free tier the first request after inactivity can take around 50 seconds.
- **Supabase auto-pause.** The free database pauses after a period of inactivity and must be resumed from the dashboard.
- **Gemini quotas.** Free-tier rate limits can cause occasional `429` or `503` errors on uncached searches.
- **No strict response schemas.** Responses are plain dicts rather than validated Pydantic models.
- **LLM output is not advice.** The verdict is only as good as the data supplied and can still be wrong.

---

## Roadmap

- [ ] **Stock comparison mode** for 2 to 3 tickers side by side
- [ ] **Concurrent data fetching** with `asyncio.gather` to cut uncached latency
- [ ] **Pydantic response models** for strict API contracts
- [ ] **Graceful 404s** for delisted or unknown symbols instead of 500s
- [ ] **Full announcement context** by extracting text from material NSE filing PDFs
- [ ] **Server-side PDF generation** for a consistent, branded research note
- [ ] **Rate limiting** and API key protection on the public backend
- [ ] **Automated tests** for scrapers and parsers to catch upstream format changes early

---

## Author

**Devansh Dhanuka**
B.Tech Computer Engineering, DJ Sanghvi College of Engineering, Mumbai

- GitHub: [@devanshdhanuka14](https://github.com/devanshdhanuka14)
- LinkedIn: https://www.linkedin.com/in/devanshdhanuka/

Feedback, issues and pull requests are welcome.

---

<sub>Built for learning. Market data belongs to its respective sources. Not financial advice.</sub>
