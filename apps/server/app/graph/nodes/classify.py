from __future__ import annotations

import logging
from typing import Any

from app.graph.nodes._llm_client import call_llm, parse_json_object
from app.graph.state import VALID_INTENTS, IntentType, OrchestratorState

logger = logging.getLogger(__name__)


CLASSIFY_SYSTEM_PROMPT = """You classify a user message into exactly one intent.

The decisive question: is the user RECORDING new data, or doing anything else (asking, recalling, chatting)?

Intents — only pick a capture intent when the user is recording NEW data right now:
- "finance": the user reports a transaction they just made or received. e.g. "I bought coffee for $4", "got paid $1000 from freelance".
- "todo": the user is adding a new task or reminder. e.g. "remind me to call mom", "I need to file taxes".
- "note": the user is capturing a new thought, idea, observation, or journal entry. e.g. "random thought: …", "noticed today that …".
- "chat": EVERYTHING ELSE — questions about past data, lookups, recall, greetings, follow-ups, advice, ambiguous prompts.

A question or lookup about finance, todos, or notes is ALWAYS "chat", not the matching capture intent.

Examples:
- "I bought coffee for $4" → {"intent": "finance"}
- "how much did I spend on coffee this month?" → {"intent": "chat"}
- "what are my biggest expense categories?" → {"intent": "chat"}
- "remind me to call mom tomorrow" → {"intent": "todo"}
- "what todos do I have due this week?" → {"intent": "chat"}
- "random thought: pour-over tastes better with consistent grind" → {"intent": "note"}
- "what did I write about coffee?" → {"intent": "chat"}
- "hello" → {"intent": "chat"}
- "what's the capital of France?" → {"intent": "chat"}

Respond with JSON only: {"intent": "finance" | "todo" | "note" | "chat"}"""


def _coerce_intent(value: object) -> IntentType:
    if isinstance(value, str) and value in VALID_INTENTS:
        return value  # type: ignore[return-value]
    return "chat"


def classify_node(state: OrchestratorState) -> dict[str, Any]:
    result = call_llm(
        CLASSIFY_SYSTEM_PROMPT,
        state["user_input"],
        json_mode=True,
        history=state.get("history"),
    )
    update: dict[str, Any] = {"intent": "chat", "tokens": result.tokens}
    if result.content is None:
        return update

    parsed = parse_json_object(result.content)
    if parsed is None:
        return update

    update["intent"] = _coerce_intent(parsed.get("intent"))
    return update


def route_by_intent(state: OrchestratorState) -> str:
    intent = state["intent"]
    if intent == "finance":
        return "extract_finance"
    if intent == "todo":
        return "extract_todo"
    if intent == "note":
        return "extract_note"
    return "chat_reply"
