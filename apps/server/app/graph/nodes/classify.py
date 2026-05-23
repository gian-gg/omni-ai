from __future__ import annotations

import logging
from typing import Any

from app.graph.nodes._llm_client import call_llm, parse_json_object
from app.graph.state import VALID_INTENTS, IntentType, OrchestratorState

logger = logging.getLogger(__name__)


CLASSIFY_SYSTEM_PROMPT = """You classify a user message into exactly one intent.

Intents:
- "finance": tracking income, expenses, purchases, bills, transactions, money matters
- "todo": tasks, reminders, action items, things to complete
- "note": thoughts, ideas, journal entries, observations
- "chat": general conversation, questions, greetings, anything else

Respond with JSON only: {"intent": "finance" | "todo" | "note" | "chat"}"""


def _coerce_intent(value: object) -> IntentType:
    if isinstance(value, str) and value in VALID_INTENTS:
        return value  # type: ignore[return-value]
    return "chat"


def classify_node(state: OrchestratorState) -> dict[str, Any]:
    raw = call_llm(CLASSIFY_SYSTEM_PROMPT, state["user_input"], json_mode=True)
    if raw is None:
        return {"intent": "chat"}

    parsed = parse_json_object(raw)
    if parsed is None:
        return {"intent": "chat"}

    return {"intent": _coerce_intent(parsed.get("intent"))}


def route_by_intent(state: OrchestratorState) -> str:
    intent = state["intent"]
    if intent == "finance":
        return "extract_finance"
    if intent == "todo":
        return "extract_todo"
    if intent == "note":
        return "extract_note"
    return "chat_reply"
