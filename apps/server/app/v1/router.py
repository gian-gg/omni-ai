from fastapi import APIRouter

from app.v1 import auth, conversations, health, notes, todos, transactions

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
    conversations.router,
    tags=["conversations"],
)
router.include_router(
    transactions.router,
    tags=["transactions"],
)
router.include_router(
    todos.router,
    tags=["todos"],
)
router.include_router(
    notes.router,
    tags=["notes"],
)
