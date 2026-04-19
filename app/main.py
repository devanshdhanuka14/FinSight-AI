from fastapi import FastAPI
from app.routes.research import router as research_router

app = FastAPI(
    title="FinSight AI",
    version="0.1.0"
)

app.include_router(research_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"message": "FinSight AI is running.", "docs": "/docs", "health": "/api/v1/health"}