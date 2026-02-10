from fastapi import APIRouter

from app.v1 import health

router = APIRouter()

router.include_router(
    health.router,
    tags=["health"],
)
