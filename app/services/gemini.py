from google import genai
from app.config import settings

client = genai.Client(api_key=settings.gemini_api_key)

def build_prompt(ticker: str, company_name: str, fundamentals: dict, news: list) -> str:
    
    price = fundamentals.get("current_price")
    change = fundamentals.get("change_pct")
    pe = fundamentals.get("pe_ratio")
    roe = fundamentals.get("roe")
    roce = fundamentals.get("roce")
    revenue_growth = fundamentals.get("revenue_growth")
    profit_growth = fundamentals.get("profit_growth")
    shareholding = fundamentals.get("shareholding_pattern", {})
    technicals = fundamentals.get("technicals", {})
    
    # format news as numbered list
    news_block = "\n".join(
        f"{i+1}. [{h['date']}] {h['headline']}"
        for i, h in enumerate(news)
    )

    nse = fundamentals.get("nse", {})
    nse_returns = nse.get("returns", {})
    index_returns = nse.get("index_returns", {})
    announcements = nse.get("announcements", [])

    announcements_block = "\n".join(
        f"{i+1}. [{a['date']}] {a['summary']}"
        for i, a in enumerate(announcements)
    )

    peers = fundamentals.get("peers", [])
    peers_block = "\n".join(
        f"- {p['name']}: P/E={p['pe']}, ROCE={p['roce']}%, Qtr Profit Growth={p['qtr_profit_growth']}%"
        for p in peers[:5]  # top 5 peers only
    )
    
    prompt = f"""
        You are a senior equity research analyst at a top Indian brokerage firm, specializing in NSE-listed stocks.
        Your analysis will be read by retail investors in India who want institutional-quality research but cannot afford Bloomberg or a personal advisor.
        They are trying to decide whether a stock deserves their attention today — not a buy/sell call, but a reasoned, data-backed view.
        Your verdict must be grounded strictly in the data provided below — do not rely on general knowledge about the company.
        Be direct, specific, and use the numbers. Vague analysis is useless to the investor reading this.
        Analyze the following data for {company_name} ({ticker}) and return a structured JSON response.

        --- PRICE ---
        Current Price: ₹{price}
        Change: {change}%

        --- TECHNICALS ---
        Trend: {technicals.get('trend')}
        Verdict: {technicals.get('verdict')}
        RSI: {technicals.get('rsi')}
        Reasoning: {technicals.get('reasoning')}

        --- FUNDAMENTALS ---
        P/E Ratio: {pe}
        ROE: {roe}%
        ROCE: {roce}%
        Revenue Growth (3yr): {revenue_growth}
        Profit Growth (3yr): {profit_growth}

        --- SHAREHOLDING TREND ---
        Promoters: {shareholding.get('Promoters')}
        FIIs: {shareholding.get('FIIs')}
        DIIs: {shareholding.get('DIIs')}

        --- VALUATION CONTEXT ---
        Sector: {nse.get('sector')}
        Sector P/E: {nse.get('sector_pe')} | Stock P/E: {nse.get('symbol_pe')}
        Annual Volatility: {nse.get('annual_volatility')}%
        Delivery %: {nse.get('delivery_pct')}% (higher = more conviction, less speculation)

        --- PRICE PERFORMANCE vs {nse.get('index_name', 'NIFTY 50')} ---
        Stock 1M: {nse_returns.get('one_month')}% | Index 1M: {index_returns.get('one_month')}%
        Stock 3M: {nse_returns.get('three_month')}% | Index 3M: {index_returns.get('three_month')}%
        Stock 1Y: {nse_returns.get('one_year')}% | Index 1Y: {index_returns.get('one_year')}%

        --- NSE CORPORATE ANNOUNCEMENTS (Official exchange filings by the company)---
        These are regulatory disclosures filed directly with NSE. Use these to identify material corporate actions, strategic moves, and management signals.
        {announcements_block}

        --- NEWS HEADLINES (From financial news sources)---
        These are third-party news articles about the company. Use these to gauge market sentiment and recent developments.
        {news_block}

        --- PEER COMPARISON (Screener.in data)---
        These are the closest sector peers. Use these to assess relative valuation and performance positioning.
        {peers_block}

        --- OUTPUT INSTRUCTIONS ---
        Return ONLY a JSON object with exactly these fields:
        {{
            "news_sentiment": {{
                "label": "Bullish/Neutral/Bearish",
                "reasoning": "2-3 sentences explaining why"
            }},
            "key_risks": ["risk 1", "risk 2", "risk 3"],
            "key_opportunities": ["opportunity 1", "opportunity 2", "opportunity 3"],
            "analyst_verdict": "150 word analyst verdict here"
        }}

        Return ONLY the JSON. No explanation, no markdown, no extra text.
    """
    return prompt

def get_research(ticker: str) -> dict:
    from app.services.fundamentals import get_fundamentals
    from app.services.news import fetch_news
    import json

    fundamentals = get_fundamentals(ticker)
    company_name = fundamentals.get("company_name", ticker)
    news = fetch_news(ticker, company_name)
    
    prompt = build_prompt(ticker, company_name, fundamentals, news)
    
    response = client.models.generate_content(
        model="gemini-3.1-flash-lite-preview",
        contents=prompt
    )
    raw = response.text.strip()
    
    # Gemini sometimes wraps JSON in ```json ``` even when told not to
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    
    result = json.loads(raw)
    result["fundamentals"] = fundamentals
    result["news"] = news
    
    return result