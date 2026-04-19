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