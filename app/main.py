from fastapi import FastAPI

app = FastAPI(
    title="FinSight AI",
    version="0.10"
)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "finsight-ai"}
