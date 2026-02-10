from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    service: str


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check",
    description="Basic liveness check for the Omni API",
)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        service="omni-api",
    )
