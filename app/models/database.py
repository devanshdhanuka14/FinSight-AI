from sqlalchemy import create_engine, Column, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from app.config import settings

Base = declarative_base()

class ResearchCache(Base):
    __tablename__ = "research_cache"

    ticker = Column(String(20), primary_key=True)
    full_response_json = Column(Text, nullable=False)
    fetched_at = Column(DateTime, default=datetime.utcnow)


class SearchHistory(Base):
    __tablename__ = "search_history"

    id = Column(String(36), primary_key=True)  # UUID
    ticker = Column(String(20), nullable=False)
    queried_at = Column(DateTime, default=datetime.utcnow)
    verdict_label = Column(String(20))


engine = create_engine(settings.database_url)
SessionLocal = sessionmaker(bind=engine)

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()