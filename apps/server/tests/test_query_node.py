import unittest
from typing import Any
from unittest.mock import MagicMock, patch

from app.graph.nodes._llm_client import LLMCallResult
from app.graph.nodes.query import query_node
from app.graph.state import OrchestratorState


def _state(user_id: str | None = "u1") -> OrchestratorState:
    return {
        "user_id": user_id,
        "user_input": "how much did I spend on coffee?",
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


def _llm(tool_calls: list[dict[str, Any]], tokens: int = 0) -> LLMCallResult:
    return LLMCallResult(content=None, tokens=tokens, tool_calls=tool_calls)


class QueryNodeTests(unittest.TestCase):
    def test_returns_empty_when_user_id_missing(self) -> None:
        with patch("app.graph.nodes.query.call_llm") as call_mock:
            result = query_node(_state(user_id=None))
        call_mock.assert_not_called()
        self.assertEqual(result, {"tool_calls": [], "tokens": 0})

    def test_short_circuits_for_capture_intents(self) -> None:
        for intent in ("finance", "todo", "note"):
            with self.subTest(intent=intent):
                state = _state()
                state["intent"] = intent  # type: ignore[typeddict-item]
                with patch("app.graph.nodes.query.call_llm") as call_mock:
                    result = query_node(state)
                call_mock.assert_not_called()
                self.assertEqual(result, {"tool_calls": [], "tokens": 0})

    def test_returns_empty_when_llm_emits_no_tool_calls(self) -> None:
        with (
            patch("app.graph.nodes.query.call_llm", return_value=_llm([], tokens=5)),
            patch("app.graph.nodes.query.get_session_factory") as factory_mock,
        ):
            result = query_node(_state())
        factory_mock.assert_not_called()
        self.assertEqual(result, {"tool_calls": [], "tokens": 5})

    def test_executes_known_tools_and_drops_unknowns(self) -> None:
        def fake_count_todos(_db, user_id, **kwargs):
            self.assertEqual(user_id, "u1")
            return {"result": {"count": 3}, "summary": "Count: 3."}

        fake_session = MagicMock()
        session_factory = MagicMock(return_value=fake_session)
        scripted_calls = [
            {"id": "t1", "name": "count_todos", "args": {"is_done": False}},
            {"id": "t2", "name": "nonexistent_tool", "args": {}},
        ]

        with (
            patch(
                "app.graph.nodes.query.call_llm",
                return_value=_llm(scripted_calls, tokens=42),
            ),
            patch(
                "app.graph.nodes.query.get_session_factory",
                return_value=session_factory,
            ),
            patch.dict(
                "app.graph.nodes.query.TOOL_EXECUTORS",
                {"count_todos": fake_count_todos},
                clear=False,
            ),
        ):
            result = query_node(_state())

        self.assertEqual(result["tokens"], 42)
        self.assertEqual(len(result["tool_calls"]), 1)
        self.assertEqual(result["tool_calls"][0]["name"], "count_todos")
        self.assertEqual(result["tool_calls"][0]["result"], {"count": 3})
        self.assertEqual(result["tool_calls"][0]["summary"], "Count: 3.")
        fake_session.close.assert_called_once()

    def test_drops_tool_that_raises(self) -> None:
        def broken(_db, _user_id, **_kwargs):
            raise ValueError("bad args")

        fake_session = MagicMock()
        session_factory = MagicMock(return_value=fake_session)

        with (
            patch(
                "app.graph.nodes.query.call_llm",
                return_value=_llm(
                    [{"id": "t1", "name": "count_todos", "args": {}}], tokens=1
                ),
            ),
            patch(
                "app.graph.nodes.query.get_session_factory",
                return_value=session_factory,
            ),
            patch.dict(
                "app.graph.nodes.query.TOOL_EXECUTORS",
                {"count_todos": broken},
                clear=False,
            ),
        ):
            result = query_node(_state())

        self.assertEqual(result["tool_calls"], [])
        fake_session.close.assert_called_once()
