from fastapi import APIRouter

from app.v1 import (
    analytics,
    auth,
    conversations,
    health,
    notes,
    suggestions,
    todos,
    transactions,
)

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
router.include_router(
    suggestions.router,
    tags=["suggestions"],
)
router.include_router(
    analytics.router,
    tags=["analytics"],
)
