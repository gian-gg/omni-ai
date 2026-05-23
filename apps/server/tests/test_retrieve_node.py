import unittest
from datetime import date
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app.graph.nodes.retrieve import (
    CONTENT_CAP_CHARS,
    SIMILARITY_THRESHOLD,
    retrieve_node,
)
from app.graph.state import OrchestratorState


def _state(user_id: str | None = "u1") -> OrchestratorState:
    return {
        "user_id": user_id,
        "user_input": "how do I brew coffee",
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


def _row(
    id: str,
    title: str | None,
    content: str,
    similarity: float,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=id,
        title=title,
        content=content,
        date=date(2026, 5, 20),
        similarity=similarity,
    )


class RetrieveNodeTests(unittest.TestCase):
    def test_returns_empty_when_user_id_missing(self) -> None:
        with patch("app.graph.nodes.retrieve.embed") as embed_mock:
            result = retrieve_node(_state(user_id=None))
        embed_mock.assert_not_called()
        self.assertEqual(result, {"notes_context": [], "sources": []})

    def test_returns_empty_when_embed_fails(self) -> None:
        with patch("app.graph.nodes.retrieve.embed", return_value=None):
            result = retrieve_node(_state())
        self.assertEqual(result, {"notes_context": [], "sources": []})

    def test_filters_below_threshold_and_caps_content(self) -> None:
        long_content = "x" * (CONTENT_CAP_CHARS + 200)
        rows = [
            _row("a", "Coffee", "Spanish coffee from Café X", 0.85),
            _row("b", None, long_content, 0.72),
            _row("c", "Unrelated", "ignored", SIMILARITY_THRESHOLD - 0.05),
        ]

        fake_session = MagicMock()
        fake_session.execute.return_value.all.return_value = rows
        session_factory = MagicMock(return_value=fake_session)

        with (
            patch("app.graph.nodes.retrieve.embed", return_value=[0.1] * 768),
            patch(
                "app.graph.nodes.retrieve.get_session_factory",
                return_value=session_factory,
            ),
        ):
            result = retrieve_node(_state())

        self.assertEqual(len(result["notes_context"]), 2)
        self.assertEqual(result["notes_context"][0]["id"], "a")
        self.assertEqual(
            len(result["notes_context"][1]["content"]), CONTENT_CAP_CHARS
        )
        self.assertEqual(
            [s["id"] for s in result["sources"]], ["a", "b"]
        )
        fake_session.close.assert_called_once()

    def test_returns_empty_on_db_error(self) -> None:
        fake_session = MagicMock()
        fake_session.execute.side_effect = RuntimeError("boom")
        session_factory = MagicMock(return_value=fake_session)

        with (
            patch("app.graph.nodes.retrieve.embed", return_value=[0.1] * 768),
            patch(
                "app.graph.nodes.retrieve.get_session_factory",
                return_value=session_factory,
            ),
        ):
            result = retrieve_node(_state())

        self.assertEqual(result, {"notes_context": [], "sources": []})
        fake_session.close.assert_called_once()
