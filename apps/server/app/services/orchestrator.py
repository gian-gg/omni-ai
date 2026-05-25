from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.graph.nodes import (
    classify_node,
    extract_finance_node,
    extract_note_node,
    extract_todo_node,
    query_node,
    retrieve_node,
    route_by_intent,
    stream_chat_reply,
)
from app.graph.state import IntentType, OrchestratorState

# Number of trailing conversation messages forwarded to the LLM. Bounds token
# growth while keeping enough context for multi-turn follow-ups (~5 exchanges).
MAX_HISTORY_MESSAGES = 10

_VALID_ROLES = frozenset({"user", "assistant"})


def _normalize_history(
    history: list[dict[str, Any]] | None,
) -> list[dict[str, str]]:
    if not history:
        return []
    cleaned: list[dict[str, str]] = []
    for message in history:
        if not isinstance(message, dict):
            continue
        role = message.get("role")
        content = message.get("content")
        if role not in _VALID_ROLES or not isinstance(content, str):
            continue
        stripped = content.strip()
        if not stripped:
            continue
        cleaned.append({"role": role, "content": stripped})
    return cleaned[-MAX_HISTORY_MESSAGES:]


@dataclass(frozen=True)
class OrchestratorResult:
    intent: IntentType
    response: str
    complete_response: str | None
    cancelled_response: str | None
    data: dict[str, Any] | None
    tokens: int
    datetime: datetime
    sources: list[dict[str, Any]]
    tool_calls: list[dict[str, Any]]


# ----- Streaming --------------------------------------------------------------


@dataclass(frozen=True)
class StreamTextDelta:
    """An incremental chunk of the assistant's reply text."""

    text: str


@dataclass(frozen=True)
class StreamDone:
    """Terminal stream event carrying the fully-assembled result."""

    result: OrchestratorResult


StreamEvent = StreamTextDelta | StreamDone


def _extract_node(branch: str):
    # Resolved at call time (not frozen in a module-level dict) so the node
    # functions stay patchable in tests.
    return {
        "extract_finance": extract_finance_node,
        "extract_todo": extract_todo_node,
        "extract_note": extract_note_node,
    }[branch]


def _initial_state(
    user_input: str,
    user_id: str | None,
    history: list[dict[str, Any]] | None,
    currency: str | None,
) -> OrchestratorState:
    return {
        "user_id": user_id,
        "currency": currency,
        "user_input": user_input,
        "history": _normalize_history(history),
        "intent": "chat",
        "response": "",
        "complete_response": None,
        "cancelled_response": None,
        "data": None,
        "tokens": 0,
        "notes_context": [],
        "sources": [],
        "used_source_ids": [],
        "tool_calls": [],
    }


def stream_orchestrator(
    user_input: str,
    user_id: str | None = None,
    history: list[dict[str, Any]] | None = None,
    currency: str | None = None,
) -> Iterator[StreamEvent]:
    """Run the orchestrator and stream the reply.

    Runs the classify → retrieve → query pipeline, then either streams a chat
    reply token-by-token (yielding `StreamTextDelta`s) or, for a capture intent,
    runs the matching extractor with no deltas. Always finishes with exactly one
    `StreamDone` carrying the assembled `OrchestratorResult`.
    """
    clean_input = user_input.strip()
    if not clean_input:
        raise ValueError("user_input must not be empty")

    state = _initial_state(clean_input, user_id, history, currency)

    tokens = 0
    for node in (classify_node, retrieve_node, query_node):
        update = node(state)
        tokens += int(update.pop("tokens", 0) or 0)
        state.update(update)

    branch = route_by_intent(state)

    if branch != "chat_reply":
        update = _extract_node(branch)(state)
        tokens += int(update.pop("tokens", 0) or 0)
        state.update(update)
        yield StreamDone(result=_finalize(state, tokens))
        return

    # Chat: stream prose deltas. Streaming uses plain text, so every retrieved
    # note is treated as a candidate source (no LLM-filtered used_source_ids).
    chunks: list[str] = []
    for event in stream_chat_reply(state):
        if event.delta:
            chunks.append(event.delta)
            yield StreamTextDelta(text=event.delta)
        if event.done:
            tokens += event.tokens

    reply = "".join(chunks).strip() or f"(LLM unavailable) You said: {clean_input}"
    state["response"] = reply
    state["used_source_ids"] = [
        s["id"] for s in state.get("sources") or [] if s.get("id")
    ]
    yield StreamDone(result=_finalize(state, tokens))


def _finalize(state: OrchestratorState, tokens: int) -> OrchestratorResult:
    retrieved_sources = list(state.get("sources") or [])
    used_ids = set(state.get("used_source_ids") or [])
    filtered_sources = [s for s in retrieved_sources if s.get("id") in used_ids]

    return OrchestratorResult(
        intent=state["intent"],
        response=state["response"],
        complete_response=state.get("complete_response"),
        cancelled_response=state.get("cancelled_response"),
        data=state.get("data"),
        tokens=tokens,
        datetime=datetime.now(UTC),
        sources=filtered_sources,
        tool_calls=list(state.get("tool_calls") or []),
    )
