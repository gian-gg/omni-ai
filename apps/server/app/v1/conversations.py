from __future__ import annotations

import json
import logging
from collections.abc import Iterator
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.db.session import get_db_session
from app.services import conversations as service
from app.services.conversations import ConvStreamEvent
from app.v1.schemas import (
    ConversationCreateRequest,
    ConversationListResponse,
    ConversationMessagesResponse,
    ConversationResponse,
    MessageAppendRequest,
    MessageCreateRequest,
    MessageResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conversations")


_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Conversation not found.",
)

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "X-Accel-Buffering": "no",
}


def _format_sse(event: ConvStreamEvent) -> str:
    if event.event == "message":
        payload = MessageResponse.model_validate(event.data).model_dump(mode="json")
    else:
        payload = event.data
    return f"event: {event.event}\ndata: {json.dumps(payload)}\n\n"


def _sse_stream(events: Iterator[ConvStreamEvent]) -> Iterator[str]:
    """Render conversation stream events as SSE; surface failures as an error event."""
    try:
        for event in events:
            yield _format_sse(event)
    except ValueError as error:
        yield f"event: error\ndata: {json.dumps({'detail': str(error)})}\n\n"
    except Exception:
        logger.exception("Streaming conversation failed.")
        yield (
            "event: error\n"
            f"data: {json.dumps({'detail': 'Failed to process request.'})}\n\n"
        )


@router.post(
    "",
    summary="Start a conversation and stream the first reply (SSE)",
)
def create(
    payload: ConversationCreateRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    events = service.stream_create_conversation(
        db_session,
        authenticated_user.user.id,
        payload.prompt,
        currency=authenticated_user.user.currency,
    )
    return StreamingResponse(
        _sse_stream(events),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.get(
    "",
    response_model=ConversationListResponse,
    summary="List conversations",
)
def list_(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ConversationListResponse:
    items, total = service.list_conversations(
        db_session, authenticated_user.user.id, limit, offset
    )
    return ConversationListResponse(
        items=[ConversationResponse.model_validate(i) for i in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{conversation_id}/messages",
    response_model=ConversationMessagesResponse,
    summary="List messages in a conversation",
)
def list_conversation_messages(
    conversation_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ConversationMessagesResponse:
    messages = service.list_messages(
        db_session, authenticated_user.user.id, conversation_id
    )
    if messages is None:
        raise _NOT_FOUND
    return ConversationMessagesResponse(
        items=[MessageResponse.model_validate(m) for m in messages]
    )


@router.post(
    "/{conversation_id}/messages",
    summary="Append a turn and stream the reply (SSE)",
)
def create_message(
    conversation_id: str,
    payload: MessageCreateRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> StreamingResponse:
    events = service.stream_add_message(
        db_session,
        authenticated_user.user.id,
        conversation_id,
        payload.prompt,
        currency=authenticated_user.user.currency,
    )
    if events is None:
        raise _NOT_FOUND
    return StreamingResponse(
        _sse_stream(events),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@router.post(
    "/{conversation_id}/messages/append",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Append a message to a conversation without generating a reply",
)
def append_message(
    conversation_id: str,
    payload: MessageAppendRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> MessageResponse:
    message = service.append_message(
        db_session,
        authenticated_user.user.id,
        conversation_id,
        payload.role,
        payload.content,
    )
    if message is None:
        raise _NOT_FOUND
    return MessageResponse.model_validate(message)


@router.delete(
    "/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a conversation",
)
def delete(
    conversation_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    deleted = service.delete_conversation(
        db_session, authenticated_user.user.id, conversation_id
    )
    if not deleted:
        raise _NOT_FOUND
    return Response(status_code=status.HTTP_204_NO_CONTENT)
