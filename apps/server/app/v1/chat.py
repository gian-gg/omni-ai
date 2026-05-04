import logging

from fastapi import APIRouter, HTTPException, status

from app.services.orchestrator import run_orchestrator
from app.v1.schemas import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _run_chat(prompt: str) -> ChatResponse:
    try:
        reply = run_orchestrator(prompt)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        ) from error
    except Exception as error:
        logger.exception("Orchestration request failed.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to process request.",
        ) from error

    return ChatResponse(response=reply)


@router.post("/chat", response_model=ChatResponse, summary="Chat with the orchestrator")
def chat(req: ChatRequest) -> ChatResponse:
    return _run_chat(req.prompt)


@router.post("/agent", response_model=ChatResponse, summary="Run the agent orchestrator")
def agent(req: ChatRequest) -> ChatResponse:
    return _run_chat(req.prompt)
