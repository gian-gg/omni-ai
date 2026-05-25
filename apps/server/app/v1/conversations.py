from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.db.session import get_db_session
from app.services import conversations as service
from app.v1.schemas import (
    ConversationCreateRequest,
    ConversationCreateResponse,
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


def _handle_orchestrator_error(error: Exception) -> HTTPException:
    if isinstance(error, ValueError):
        return HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(error),
        )
    logger.exception("Orchestration request failed.")
    return HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Failed to process request.",
    )


@router.post(
    "",
    response_model=ConversationCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Start a conversation and reply to the first prompt",
)
def create(
    payload: ConversationCreateRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> ConversationCreateResponse:
    try:
        conversation, message = service.create_conversation(
            db_session, authenticated_user.user.id, payload.prompt
        )
    except Exception as error:
        raise _handle_orchestrator_error(error) from error

    return ConversationCreateResponse(
        conversation=ConversationResponse.model_validate(conversation),
        message=MessageResponse.model_validate(message),
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
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Append a turn to a conversation",
)
def create_message(
    conversation_id: str,
    payload: MessageCreateRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> MessageResponse:
    try:
        message = service.add_message(
            db_session,
            authenticated_user.user.id,
            conversation_id,
            payload.prompt,
        )
    except Exception as error:
        raise _handle_orchestrator_error(error) from error

    if message is None:
        raise _NOT_FOUND
    return MessageResponse.model_validate(message)


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
