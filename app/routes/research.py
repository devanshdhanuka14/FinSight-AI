from fastapi import APIRouter, HTTPException
from app.services.gemini import get_research

router = APIRouter()

@router.get("/health")
def health_check():
    return {"status": "ok", "service": "finsight-ai"}

@router.get("/research/{ticker}")
def research(ticker: str):
    ticker = ticker.upper().strip()
    
    if not ticker or len(ticker) > 20:
        raise HTTPException(status_code=400, detail="Invalid ticker symbol.")
    
    try:
        result = get_research(ticker)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    if not result:
        raise HTTPException(status_code=404, detail=f"No data found for {ticker}.")
    
    return result