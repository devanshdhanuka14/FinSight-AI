from fastapi import FastAPI
from app.config import Config

app = FastAPI(title="FinSight")


@app.get("/health")
def health():
    return {"status": "ok"}
