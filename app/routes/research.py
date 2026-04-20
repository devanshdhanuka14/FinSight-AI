from fastapi import APIRouter, HTTPException
from app.services.gemini import get_research
from app.services.cache import get_cached_research, store_research, log_search

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok", "service": "finsight-ai"}

@router.get("/research/{ticker}")
def research(ticker: str):
    ticker = ticker.upper().strip()
    
    if not ticker or len(ticker) > 20:
        raise HTTPException(status_code=400, detail="Invalid ticker symbol.")
    
    # Check cache first
    cached = get_cached_research(ticker)
    if cached:
        cached["cached"] = True
        return cached
    
    # Run full pipeline
    try:
        result = get_research(ticker)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    if not result:
        raise HTTPException(status_code=404, detail=f"No data found for {ticker}.")
    
    # Store in cache and log search
    result["cached"] = False
    store_research(ticker, result)
    verdict_label = result.get("news_sentiment", {}).get("label", "Unknown")
    log_search(ticker, verdict_label)
    
    return result

@router.get("/history")
def history():
    from app.services.cache import get_search_history
    return get_search_history()

@router.get("/chart/{ticker}")
def chart(ticker: str):
    import yfinance as yf
    import math
    
    ticker = ticker.upper().strip()
    df = yf.Ticker(f"{ticker}.NS").history(period="6mo")
    
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No chart data for {ticker}")
    
    df["MA20"] = df["Close"].rolling(20).mean()
    df["MA50"] = df["Close"].rolling(50).mean()
    
    def clean(val):
        if isinstance(val, float) and math.isnan(val):
            return None
        return val
    
    return {
        "dates": df.index.strftime("%Y-%m-%d").tolist(),
        "open": [clean(x) for x in df["Open"].round(2).tolist()],
        "high": [clean(x) for x in df["High"].round(2).tolist()],
        "low": [clean(x) for x in df["Low"].round(2).tolist()],
        "close": [clean(x) for x in df["Close"].round(2).tolist()],
        "volume": [clean(x) for x in df["Volume"].tolist()],
        "ma20": [clean(x) for x in df["MA20"].round(2).tolist()],
        "ma50": [clean(x) for x in df["MA50"].round(2).tolist()],
    }

@router.get("/indices")
def indices():
    from app.services.nse import fetch_market_indices
    return fetch_market_indices()