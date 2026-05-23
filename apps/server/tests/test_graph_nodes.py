import json
import unittest
from typing import Any
from unittest.mock import patch

from app.graph.nodes.chat_reply import chat_reply_node
from app.graph.nodes.classify import classify_node, route_by_intent
from app.graph.nodes.extract import (
    extract_finance_node,
    extract_note_node,
    extract_todo_node,
)
from app.graph.state import OrchestratorState


def _state(user_input: str, intent: str = "chat") -> OrchestratorState:
    return {
        "user_id": None,
        "user_input": user_input,
        "intent": intent,  # type: ignore[typeddict-item]
        "response": "",
        "data": None,
    }


class ClassifyNodeTests(unittest.TestCase):
    def test_returns_intent_from_llm(self) -> None:
        with patch(
            "app.graph.nodes.classify.call_llm",
            return_value=json.dumps({"intent": "finance"}),
        ):
            result = classify_node(_state("Spent $5 on coffee"))
        self.assertEqual(result, {"intent": "finance"})

    def test_falls_back_to_chat_on_invalid_intent(self) -> None:
        with patch(
            "app.graph.nodes.classify.call_llm",
            return_value=json.dumps({"intent": "garbage"}),
        ):
            result = classify_node(_state("hello"))
        self.assertEqual(result, {"intent": "chat"})

    def test_falls_back_to_chat_when_llm_unavailable(self) -> None:
        with patch("app.graph.nodes.classify.call_llm", return_value=None):
            result = classify_node(_state("hello"))
        self.assertEqual(result, {"intent": "chat"})


class RouterTests(unittest.TestCase):
    def test_routes_each_intent_to_its_node(self) -> None:
        cases: dict[str, str] = {
            "finance": "extract_finance",
            "todo": "extract_todo",
            "note": "extract_note",
            "chat": "chat_reply",
        }
        for intent, expected_node in cases.items():
            with self.subTest(intent=intent):
                self.assertEqual(
                    route_by_intent(_state("x", intent=intent)), expected_node
                )


class ExtractorTests(unittest.TestCase):
    def test_finance_extractor_parses_data(self) -> None:
        payload = json.dumps(
            {
                "response": "Ooh interesting! Add to transactions?",
                "complete_response": "Done — added.",
                "cancelled_response": "No worries.",
                "data": {"type": "expense", "amount": 5, "currency": "USD"},
            }
        )
        with patch("app.graph.nodes.extract.call_llm", return_value=payload):
            result = extract_finance_node(_state("Spent $5 on coffee"))
        self.assertEqual(result["response"], "Ooh interesting! Add to transactions?")
        self.assertEqual(result["complete_response"], "Done — added.")
        self.assertEqual(result["cancelled_response"], "No worries.")
        assert result["data"] is not None
        self.assertEqual(result["data"]["type"], "expense")

    def test_todo_extractor_leaves_missing_fields_null(self) -> None:
        with patch(
            "app.graph.nodes.extract.call_llm",
            return_value=json.dumps({"response": "ok"}),
        ):
            result = extract_todo_node(_state("buy milk"))
        self.assertEqual(result["response"], "ok")
        self.assertIsNone(result["complete_response"])
        self.assertIsNone(result["cancelled_response"])
        self.assertIsNone(result["data"])

    def test_note_extractor_falls_back_when_llm_unavailable(self) -> None:
        with patch("app.graph.nodes.extract.call_llm", return_value=None):
            result = extract_note_node(_state("remember to call mom"))
        self.assertIn("Captured", result["response"])
        self.assertIsNone(result["complete_response"])
        self.assertIsNone(result["cancelled_response"])
        self.assertIsNone(result["data"])


class ChatReplyTests(unittest.TestCase):
    def test_returns_llm_reply(self) -> None:
        with patch("app.graph.nodes.chat_reply.call_llm", return_value="Hi!"):
            result = chat_reply_node(_state("hello"))
        self.assertEqual(
            result,
            {
                "response": "Hi!",
                "complete_response": None,
                "cancelled_response": None,
                "data": None,
            },
        )

    def test_falls_back_when_llm_unavailable(self) -> None:
        with patch("app.graph.nodes.chat_reply.call_llm", return_value=None):
            result = chat_reply_node(_state("hello"))
        self.assertEqual(
            result,
            {
                "response": "(LLM unavailable) You said: hello",
                "complete_response": None,
                "cancelled_response": None,
                "data": None,
            },
        )
