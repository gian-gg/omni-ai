from fastapi import FastAPI

from app.core.logging import setup_logging
from app.v1.router import router as v1_router

setup_logging()

app = FastAPI(title="Omni API")

app.include_router(v1_router, prefix="/api/v1")
