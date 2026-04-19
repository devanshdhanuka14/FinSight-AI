import json
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from app.models.database import SessionLocal, ResearchCache, SearchHistory
import uuid

CACHE_TTL_HOURS = 1

def get_cached_research(ticker: str):
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)
        result = db.query(ResearchCache)\
            .filter(ResearchCache.ticker == ticker.upper())\
            .filter(ResearchCache.fetched_at >= cutoff)\
            .first()
        
        if result:
            return json.loads(result.full_response_json)
        return None
    finally:
        db.close()

def store_research(ticker: str, data: dict):
    db = SessionLocal()
    try:
        existing = db.query(ResearchCache)\
            .filter(ResearchCache.ticker == ticker.upper())\
            .first()
        
        if existing:
            existing.full_response_json = json.dumps(data, default=str)
            existing.fetched_at = datetime.utcnow()
        else:
            record = ResearchCache(
                ticker=ticker.upper(),
                full_response_json=json.dumps(data, default=str),
                fetched_at=datetime.utcnow()
            )
            db.add(record)
        
        db.commit()
    finally:
        db.close()

def log_search(ticker: str, verdict_label: str):
    db = SessionLocal()
    try:
        record = SearchHistory(
            id=str(uuid.uuid4()),
            ticker=ticker.upper(),
            queried_at=datetime.utcnow(),
            verdict_label=verdict_label
        )
        db.add(record)
        db.commit()
    finally:
        db.close()

def get_search_history(limit: int = 20) -> list:
    db = SessionLocal()
    try:
        results = db.query(SearchHistory)\
            .order_by(SearchHistory.queried_at.desc())\
            .limit(limit)\
            .all()
        return [
            {
                "ticker": r.ticker,
                "queried_at": r.queried_at.isoformat(),
                "verdict_label": r.verdict_label
            }
            for r in results
        ]
    finally:
        db.close()