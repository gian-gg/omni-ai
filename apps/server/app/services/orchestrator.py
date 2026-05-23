from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from langgraph.graph import END, START, StateGraph

from app.graph.nodes import (
    chat_reply_node,
    classify_node,
    extract_finance_node,
    extract_note_node,
    extract_todo_node,
    retrieve_node,
    route_by_intent,
)
from app.graph.state import IntentType, OrchestratorState


def build_orchestrator():
    graph_builder: StateGraph[OrchestratorState] = StateGraph(OrchestratorState)

    graph_builder.add_node("classify", classify_node)
    graph_builder.add_node("retrieve", retrieve_node)
    graph_builder.add_node("chat_reply", chat_reply_node)
    graph_builder.add_node("extract_finance", extract_finance_node)
    graph_builder.add_node("extract_todo", extract_todo_node)
    graph_builder.add_node("extract_note", extract_note_node)

    graph_builder.add_edge(START, "classify")
    graph_builder.add_edge("classify", "retrieve")
    graph_builder.add_conditional_edges(
        "retrieve",
        route_by_intent,
        {
            "chat_reply": "chat_reply",
            "extract_finance": "extract_finance",
            "extract_todo": "extract_todo",
            "extract_note": "extract_note",
        },
    )
    graph_builder.add_edge("chat_reply", END)
    graph_builder.add_edge("extract_finance", END)
    graph_builder.add_edge("extract_todo", END)
    graph_builder.add_edge("extract_note", END)

    return graph_builder.compile()


orchestrator_graph = build_orchestrator()


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


def run_orchestrator(user_input: str, user_id: str | None = None) -> OrchestratorResult:
    clean_input = user_input.strip()
    if not clean_input:
        raise ValueError("user_input must not be empty")

    initial_state: OrchestratorState = {
        "user_id": user_id,
        "user_input": clean_input,
        "intent": "chat",
        "response": "",
        "complete_response": None,
        "cancelled_response": None,
        "data": None,
        "tokens": 0,
        "notes_context": [],
        "sources": [],
        "used_source_ids": [],
    }
    final_state = orchestrator_graph.invoke(initial_state)

    retrieved_sources = list(final_state.get("sources") or [])
    used_ids = set(final_state.get("used_source_ids") or [])
    filtered_sources = [s for s in retrieved_sources if s.get("id") in used_ids]

    return OrchestratorResult(
        intent=final_state["intent"],
        response=final_state["response"],
        complete_response=final_state.get("complete_response"),
        cancelled_response=final_state.get("cancelled_response"),
        data=final_state.get("data"),
        tokens=int(final_state.get("tokens", 0)),
        datetime=datetime.now(UTC),
        sources=filtered_sources,
    )
