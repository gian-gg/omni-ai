from fastapi import APIRouter

from app.v1 import auth, chat, health, transactions

router = APIRouter()

router.include_router(
    health.router,
    tags=["health"],
)
router.include_router(
    auth.router,
    tags=["auth"],
)
router.include_router(
    chat.router,
    tags=["chat"],
)
router.include_router(
    transactions.router,
    tags=["transactions"],
)
