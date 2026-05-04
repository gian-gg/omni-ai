from fastapi import APIRouter

from app.v1 import chat, health

router = APIRouter()

router.include_router(
    health.router,
    tags=["health"],
)
router.include_router(
    chat.router,
    tags=["chat"],
)
