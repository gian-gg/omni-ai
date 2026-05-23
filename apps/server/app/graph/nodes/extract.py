from __future__ import annotations

import logging
from datetime import date as _date
from typing import Any

from app.graph.nodes._llm_client import call_llm, parse_json_object
from app.graph.nodes._notes_context import format_notes_context
from app.graph.nodes._tool_context import format_tool_context
from app.graph.state import OrchestratorState

logger = logging.getLogger(__name__)


def _today_iso() -> str:
    return _date.today().isoformat()


FINANCE_PROMPT = """Extract a finance transaction the user just told you about.

Return JSON ONLY. Every key shown below MUST appear. Strings use double quotes, numbers are unquoted, null is unquoted (not "null"). `amount` MUST be a positive number — the `type` field carries the sign (income vs expense).

Schema:
{
  "response": string,            // action-oriented proposal; invite the user to confirm
  "complete_response": string,   // shown after the user approves
  "cancelled_response": string,  // shown after the user cancels
  "used_source_ids": [string],   // ids of provided notes you actually used; [] if none
  "data": {
    "type": "income" | "expense",
    "amount": number,            // positive
    "currency": string,          // ISO 4217, default "USD"
    "category": string | null,
    "description": string | null,
    "date": string | null        // ISO 8601 date if the user stated one; else null
  }
}

Canonical example (user said: "I bought coffee for $4 at Starbucks"):
{
  "response": "Ooh, coffee run! Want me to add that to your transactions?",
  "complete_response": "Done — logged a $4 coffee expense.",
  "cancelled_response": "No worries, didn't save it.",
  "used_source_ids": [],
  "data": {
    "type": "expense",
    "amount": 4,
    "currency": "USD",
    "category": "food",
    "description": "coffee at Starbucks",
    "date": null
  }
}"""


TODO_PROMPT = """Extract a todo the user just asked you to remember.

Return JSON ONLY. Every key shown below MUST appear. Strings use double quotes, null is unquoted.

Schema:
{
  "response": string,            // action-oriented proposal; invite the user to confirm
  "complete_response": string,   // shown after the user approves
  "cancelled_response": string,  // shown after the user cancels
  "used_source_ids": [string],   // ids of provided notes you actually used; [] if none
  "data": {
    "title": string,             // short imperative phrase
    "description": string | null,
    "due_date": string | null,   // ISO 8601 if mentioned
    "priority": "low" | "medium" | "high",
    "date": string | null        // ISO 8601 if the user stated when they logged this; else null
  }
}

Canonical example (user said: "remind me to call mom tomorrow, it's important"):
{
  "response": "Got it — adding that to your todos. Sound good?",
  "complete_response": "Done — added \"call mom\" to your todos.",
  "cancelled_response": "No worries, didn't save it.",
  "used_source_ids": [],
  "data": {
    "title": "Call mom",
    "description": null,
    "due_date": null,
    "priority": "high",
    "date": null
  }
}"""


NOTE_PROMPT = """Extract a note/idea the user just shared.

Return JSON ONLY. Every key shown below MUST appear. Strings use double quotes, null is unquoted, empty arrays are [] (never null).

Schema:
{
  "response": string,            // action-oriented proposal; invite the user to confirm
  "complete_response": string,   // shown after the user approves
  "cancelled_response": string,  // shown after the user cancels
  "used_source_ids": [string],   // ids of provided notes you actually used; [] if none
  "data": {
    "title": string | null,      // a short headline if you can write one; else null
    "content": string,           // the user's thought, lightly cleaned up
    "tags": [string],            // lowercase, kebab-case, 0-5 tags
    "date": string | null        // ISO 8601 if the user stated when this happened; else null
  }
}

Canonical example (user said: "random thought: pour-over coffee tastes way better when the grinder is consistent"):
{
  "response": "Ooh, nice insight! Want me to save that as a note?",
  "complete_response": "Saved to your notes.",
  "cancelled_response": "No worries, didn't save it.",
  "used_source_ids": [],
  "data": {
    "title": "Grinder consistency matters more than the bean",
    "content": "Pour-over coffee tastes way better when the grinder is consistent.",
    "tags": ["coffee", "brewing"],
    "date": null
  }
}"""


def _run_extractor(
    prompt: str,
    user_input: str,
    notes_context: list[dict[str, Any]] | None = None,
    tool_calls: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    blocks = [format_notes_context(notes_context), format_tool_context(tool_calls)]
    context_block = "".join(b for b in blocks if b)
    full_prompt = f"{context_block}\n{prompt}" if context_block else prompt
    result = call_llm(full_prompt, user_input, json_mode=True)
    if result.content is None:
        return {
            "response": f"(LLM unavailable) Captured: {user_input}",
            "complete_response": None,
            "cancelled_response": None,
            "data": None,
            "tokens": result.tokens,
            "used_source_ids": [],
        }

    parsed = parse_json_object(result.content)
    if parsed is None:
        return {
            "response": result.content,
            "complete_response": None,
            "cancelled_response": None,
            "data": None,
            "tokens": result.tokens,
            "used_source_ids": [],
        }

    def _clean(value: object) -> str | None:
        if isinstance(value, str) and value.strip():
            return value.strip()
        return None

    response_text = _clean(parsed.get("response")) or f"Captured: {user_input}"
    complete_text = _clean(parsed.get("complete_response"))
    cancelled_text = _clean(parsed.get("cancelled_response"))

    data = parsed.get("data")
    if not isinstance(data, dict):
        data = None
    elif not data.get("date"):
        data["date"] = _today_iso()

    raw_ids = parsed.get("used_source_ids")
    used_source_ids = (
        [str(item) for item in raw_ids if isinstance(item, str)]
        if isinstance(raw_ids, list)
        else []
    )

    return {
        "response": response_text,
        "complete_response": complete_text,
        "cancelled_response": cancelled_text,
        "data": data,
        "tokens": result.tokens,
        "used_source_ids": used_source_ids,
    }


def extract_finance_node(state: OrchestratorState) -> dict[str, Any]:
    return _run_extractor(
        FINANCE_PROMPT,
        state["user_input"],
        state.get("notes_context"),
        state.get("tool_calls"),
    )


def extract_todo_node(state: OrchestratorState) -> dict[str, Any]:
    return _run_extractor(
        TODO_PROMPT,
        state["user_input"],
        state.get("notes_context"),
        state.get("tool_calls"),
    )


def extract_note_node(state: OrchestratorState) -> dict[str, Any]:
    return _run_extractor(
        NOTE_PROMPT,
        state["user_input"],
        state.get("notes_context"),
        state.get("tool_calls"),
    )
