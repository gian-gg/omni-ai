from __future__ import annotations

from langgraph.graph import END, START, StateGraph

from app.graph.nodes import llm_node
from app.graph.state import OrchestratorState


def build_orchestrator():
    graph_builder: StateGraph[OrchestratorState] = StateGraph(OrchestratorState)

    graph_builder.add_node("llm", llm_node)
    graph_builder.add_edge(START, "llm")
    graph_builder.add_edge("llm", END)

    return graph_builder.compile()


orchestrator_graph = build_orchestrator()


def run_orchestrator(user_input: str, user_id: str | None = None) -> str:
    clean_input = user_input.strip()
    if not clean_input:
        raise ValueError("user_input must not be empty")

    initial_state: OrchestratorState = {
        "user_id": user_id,
        "user_input": clean_input,
        "intent": "llm",
        "response": "",
    }
    final_state = orchestrator_graph.invoke(initial_state)
    return final_state["response"]
