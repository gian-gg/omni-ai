from fastapi import APIRouter
from pydantic import BaseModel

from app.core.config import settings

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str
    env: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Basic liveness check for the Omni API",
)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        env=settings.env,
    )
