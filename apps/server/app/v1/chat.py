import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.services.orchestrator import run_orchestrator
from app.v1.schemas import ChatRequest, ChatResponse

logger = logging.getLogger(__name__)

router = APIRouter()


def _run_chat(
    prompt: str,
    authenticated_user: AuthenticatedUser,
    history: list[dict[str, str]] | None = None,
) -> ChatResponse:
    try:
        result = run_orchestrator(
            prompt,
            user_id=authenticated_user.user.id,
            history=history,
        )
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

    return ChatResponse(
        intent=result.intent,
        response=result.response,
        complete_response=result.complete_response,
        cancelled_response=result.cancelled_response,
        data=result.data,
        tokens=result.tokens,
        datetime=result.datetime,
        sources=result.sources,
        tool_calls=[
            {
                "id": call.get("id", ""),
                "name": call.get("name", ""),
                "args": call.get("args") or {},
                "summary": call.get("summary", ""),
            }
            for call in result.tool_calls
        ],
    )


@router.post("/chat", response_model=ChatResponse, summary="Run the agent orchestrator")
def chat(
    req: ChatRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
) -> ChatResponse:
    history = [{"role": m.role, "content": m.content} for m in req.history]
    return _run_chat(req.prompt, authenticated_user, history=history)
