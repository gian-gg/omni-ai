from fastapi import FastAPI

from app.v1.router import router as v1_router

app = FastAPI(title="Omni API")

app.include_router(v1_router, prefix="/api/v1")
