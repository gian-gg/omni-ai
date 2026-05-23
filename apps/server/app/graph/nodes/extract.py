from __future__ import annotations

import logging
from datetime import date as _date
from typing import Any

from app.graph.nodes._llm_client import call_llm, parse_json_object
from app.graph.state import OrchestratorState

logger = logging.getLogger(__name__)


def _today_iso() -> str:
    return _date.today().isoformat()


FINANCE_PROMPT = """Extract a finance transaction from the user message.

Return JSON only:
{
  "response": "short natural-language confirmation to the user",
  "data": {
    "type": "income" | "expense",
    "amount": number,
    "currency": string (ISO code, default "USD"),
    "category": string | null,
    "description": string | null,
    "date": string | null (ISO 8601 date the transaction occurred, if the user states one; else null)
  }
}"""


TODO_PROMPT = """Extract a todo item from the user message.

Return JSON only:
{
  "response": "short natural-language confirmation to the user",
  "data": {
    "title": string,
    "description": string | null,
    "due_date": string | null (ISO 8601 date if mentioned),
    "priority": "low" | "medium" | "high" (default "medium"),
    "date": string | null (ISO 8601 date the todo was created/logged, if the user states one; else null)
  }
}"""


NOTE_PROMPT = """Extract a note/idea from the user message.

Return JSON only:
{
  "response": "short natural-language confirmation to the user",
  "data": {
    "title": string | null,
    "content": string,
    "tags": [string],
    "date": string | null (ISO 8601 date the note refers to, if the user states one; else null)
  }
}"""


def _run_extractor(prompt: str, user_input: str) -> dict[str, Any]:
    raw = call_llm(prompt, user_input, json_mode=True)
    if raw is None:
        return {
            "response": f"(LLM unavailable) Captured: {user_input}",
            "data": None,
        }

    parsed = parse_json_object(raw)
    if parsed is None:
        return {"response": raw, "data": None}

    response_text = parsed.get("response")
    if not isinstance(response_text, str) or not response_text.strip():
        response_text = f"Captured: {user_input}"

    data = parsed.get("data")
    if not isinstance(data, dict):
        data = None
    elif not data.get("date"):
        data["date"] = _today_iso()

    return {"response": response_text, "data": data}


def extract_finance_node(state: OrchestratorState) -> dict[str, Any]:
    return _run_extractor(FINANCE_PROMPT, state["user_input"])


def extract_todo_node(state: OrchestratorState) -> dict[str, Any]:
    return _run_extractor(TODO_PROMPT, state["user_input"])


def extract_note_node(state: OrchestratorState) -> dict[str, Any]:
    return _run_extractor(NOTE_PROMPT, state["user_input"])
