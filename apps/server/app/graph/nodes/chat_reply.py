from __future__ import annotations

from typing import Any

from app.graph.nodes._llm_client import call_llm
from app.graph.state import OrchestratorState


CHAT_SYSTEM_PROMPT = "You are Omni, a helpful, concise assistant. Reply in plain text."


def chat_reply_node(state: OrchestratorState) -> dict[str, Any]:
    user_input = state["user_input"]
    reply = call_llm(CHAT_SYSTEM_PROMPT, user_input)
    if reply is None:
        reply = f"(LLM unavailable) You said: {user_input}"
    return {
        "response": reply,
        "complete_response": None,
        "cancelled_response": None,
        "data": None,
    }
