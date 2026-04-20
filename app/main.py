from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes.research import router as research_router

app = FastAPI(
    title="FinSight AI",
    version="0.1.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(research_router, prefix="/api/v1")

@app.get("/")
def root():
    return {"message": "FinSight AI is running.", "docs": "/docs", "health": "/api/v1/health"}