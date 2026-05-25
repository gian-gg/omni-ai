from __future__ import annotations

from typing import Any

from app.graph.nodes._llm_client import call_llm, parse_json_object
from app.graph.nodes._notes_context import format_notes_context
from app.graph.nodes._tool_context import format_tool_context
from app.graph.state import OrchestratorState


CHAT_SYSTEM_PROMPT = "You are Omni, a helpful, concise assistant. Reply in plain text."

CHAT_WITH_CONTEXT_PROMPT = (
    "You are Omni, a helpful, concise assistant. "
    "Return JSON only with this exact shape:\n"
    '{ "response": "your reply in plain text", '
    '"used_source_ids": ["id of each note you actually used"] }'
)


def chat_reply_node(state: OrchestratorState) -> dict[str, Any]:
    user_input = state["user_input"]
    history = state.get("history")
    notes_block = format_notes_context(state.get("notes_context"))
    tools_block = format_tool_context(state.get("tool_calls"))
    context_block = "".join(b for b in (notes_block, tools_block) if b)

    if not context_block:
        result = call_llm(CHAT_SYSTEM_PROMPT, user_input, history=history)
        reply = result.content or f"(LLM unavailable) You said: {user_input}"
        return {
            "response": reply,
            "complete_response": None,
            "cancelled_response": None,
            "data": None,
            "tokens": result.tokens,
            "used_source_ids": [],
        }

    system_prompt = f"{context_block}\n{CHAT_WITH_CONTEXT_PROMPT}"
    result = call_llm(system_prompt, user_input, json_mode=True, history=history)

    reply = f"(LLM unavailable) You said: {user_input}"
    used_source_ids: list[str] = []
    if result.content is not None:
        parsed = parse_json_object(result.content)
        if isinstance(parsed, dict):
            response_value = parsed.get("response")
            if isinstance(response_value, str) and response_value.strip():
                reply = response_value.strip()
            raw_ids = parsed.get("used_source_ids")
            if isinstance(raw_ids, list):
                used_source_ids = [s for s in raw_ids if isinstance(s, str)]
        else:
            reply = result.content

    return {
        "response": reply,
        "complete_response": None,
        "cancelled_response": None,
        "data": None,
        "tokens": result.tokens,
        "used_source_ids": used_source_ids,
    }
