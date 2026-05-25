from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.conversation import Conversation, Message
from app.services.orchestrator import (
    OrchestratorResult,
    StreamTextDelta,
    stream_orchestrator,
)

MAX_TITLE_LENGTH = 60
# Most recent messages pulled from the DB to seed the orchestrator's history.
HISTORY_QUERY_LIMIT = 3

_WHITESPACE_RE = re.compile(r"\s+")


def _derive_title(prompt: str) -> str:
    collapsed = _WHITESPACE_RE.sub(" ", prompt).strip()
    if len(collapsed) <= MAX_TITLE_LENGTH:
        return collapsed
    return collapsed[: MAX_TITLE_LENGTH - 1].rstrip() + "…"


def _build_details(result: OrchestratorResult) -> dict[str, Any]:
    return {
        "intent": result.intent,
        "complete_response": result.complete_response,
        "cancelled_response": result.cancelled_response,
        "data": result.data,
        "tokens": result.tokens,
        "sources": result.sources,
        "tool_calls": result.tool_calls,
    }


def _load_history(
    db_session: Session, conversation_id: str
) -> list[dict[str, str]]:
    rows = list(
        db_session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(HISTORY_QUERY_LIMIT)
        )
    )
    rows.reverse()
    return [{"role": m.role, "content": m.content} for m in rows]


@dataclass(frozen=True)
class ConvStreamEvent:
    """A server-sent event for a streaming conversation turn.

    `event` is the SSE event name (``meta`` | ``delta`` | ``message``); `data` is
    a plain dict for meta/delta and the persisted assistant `Message` for message.
    """

    event: str
    data: Any


def _stream_reply(
    db_session: Session,
    user_id: str,
    conversation_id: str,
    prompt: str,
    history: list[dict[str, str]],
    currency: str | None,
) -> Iterator[ConvStreamEvent]:
    """Drive the streaming orchestrator, emit deltas, then persist the reply."""
    result: OrchestratorResult | None = None
    for event in stream_orchestrator(
        prompt, user_id=user_id, history=history, currency=currency
    ):
        if isinstance(event, StreamTextDelta):
            yield ConvStreamEvent("delta", {"text": event.text})
        else:
            result = event.result

    if result is None:  # pragma: no cover — stream always ends with StreamDone
        raise RuntimeError("Stream ended without a final result.")

    assistant_message = Message(
        conversation_id=conversation_id,
        user_id=user_id,
        role="assistant",
        content=result.response,
        details=_build_details(result),
    )
    db_session.add(assistant_message)
    db_session.commit()
    db_session.refresh(assistant_message)
    yield ConvStreamEvent("message", assistant_message)


def stream_create_conversation(
    db_session: Session,
    user_id: str,
    prompt: str,
    currency: str | None = None,
) -> Iterator[ConvStreamEvent]:
    """Start a conversation and stream the first reply.

    The conversation and user message are committed before streaming begins, so
    they survive a dropped connection.
    """
    conversation = Conversation(user_id=user_id, title=_derive_title(prompt))
    db_session.add(conversation)
    db_session.flush()
    db_session.add(
        Message(
            conversation_id=conversation.id,
            user_id=user_id,
            role="user",
            content=prompt,
        )
    )
    db_session.commit()
    db_session.refresh(conversation)
    conversation_id = conversation.id
    title = conversation.title

    def generate() -> Iterator[ConvStreamEvent]:
        yield ConvStreamEvent(
            "meta", {"conversation_id": conversation_id, "title": title}
        )
        yield from _stream_reply(
            db_session, user_id, conversation_id, prompt, [], currency
        )

    return generate()


def stream_add_message(
    db_session: Session,
    user_id: str,
    conversation_id: str,
    prompt: str,
    currency: str | None = None,
) -> Iterator[ConvStreamEvent] | None:
    """Append a turn and stream the reply. Returns None if not found (→ 404)."""
    conversation = get_conversation(db_session, user_id, conversation_id)
    if conversation is None:
        return None

    history = _load_history(db_session, conversation_id)
    db_session.add(
        Message(
            conversation_id=conversation_id,
            user_id=user_id,
            role="user",
            content=prompt,
        )
    )
    conversation.updated_at = func.now()
    db_session.commit()

    def generate() -> Iterator[ConvStreamEvent]:
        yield from _stream_reply(
            db_session, user_id, conversation_id, prompt, history, currency
        )

    return generate()


def append_message(
    db_session: Session,
    user_id: str,
    conversation_id: str,
    role: str,
    content: str,
) -> Message | None:
    """Store a single message verbatim — no orchestrator / LLM call."""
    conversation = get_conversation(db_session, user_id, conversation_id)
    if conversation is None:
        return None

    message = Message(
        conversation_id=conversation_id,
        user_id=user_id,
        role=role,
        content=content,
    )
    db_session.add(message)
    conversation.updated_at = func.now()

    db_session.commit()
    db_session.refresh(message)
    return message


def list_conversations(
    db_session: Session,
    user_id: str,
    limit: int,
    offset: int,
) -> tuple[list[Conversation], int]:
    total = db_session.scalar(
        select(func.count())
        .select_from(Conversation)
        .where(Conversation.user_id == user_id)
    )
    items = list(
        db_session.scalars(
            select(Conversation)
            .where(Conversation.user_id == user_id)
            .order_by(Conversation.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return items, int(total or 0)


def get_conversation(
    db_session: Session,
    user_id: str,
    conversation_id: str,
) -> Conversation | None:
    return db_session.scalar(
        select(Conversation).where(
            Conversation.id == conversation_id,
            Conversation.user_id == user_id,
        )
    )


def list_messages(
    db_session: Session,
    user_id: str,
    conversation_id: str,
) -> list[Message] | None:
    conversation = get_conversation(db_session, user_id, conversation_id)
    if conversation is None:
        return None
    return list(
        db_session.scalars(
            select(Message)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.asc())
        )
    )


def delete_conversation(
    db_session: Session,
    user_id: str,
    conversation_id: str,
) -> bool:
    conversation = get_conversation(db_session, user_id, conversation_id)
    if conversation is None:
        return False
    db_session.delete(conversation)
    db_session.commit()
    return True
