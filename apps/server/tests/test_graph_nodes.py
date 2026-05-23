import json
import unittest
from unittest.mock import patch

from app.graph.nodes._llm_client import LLMCallResult
from app.graph.nodes.chat_reply import chat_reply_node
from app.graph.nodes.classify import classify_node, route_by_intent
from app.graph.nodes.extract import (
    extract_finance_node,
    extract_note_node,
    extract_todo_node,
)
from app.graph.state import OrchestratorState


def _state(
    user_input: str,
    intent: str = "chat",
    notes_context: list[dict] | None = None,
    tool_calls: list[dict] | None = None,
) -> OrchestratorState:
    return {
        "user_id": None,
        "user_input": user_input,
        "intent": intent,  # type: ignore[typeddict-item]
        "response": "",
        "complete_response": None,
        "cancelled_response": None,
        "data": None,
        "tokens": 0,
        "notes_context": notes_context or [],
        "sources": [],
        "used_source_ids": [],
        "tool_calls": tool_calls or [],
    }


def _llm(content: str | None, tokens: int = 0) -> LLMCallResult:
    return LLMCallResult(content=content, tokens=tokens)


class ClassifyNodeTests(unittest.TestCase):
    def test_returns_intent_and_tokens_from_llm(self) -> None:
        with patch(
            "app.graph.nodes.classify.call_llm",
            return_value=_llm(json.dumps({"intent": "finance"}), tokens=42),
        ):
            result = classify_node(_state("Spent $5 on coffee"))
        self.assertEqual(result, {"intent": "finance", "tokens": 42})

    def test_falls_back_to_chat_on_invalid_intent(self) -> None:
        with patch(
            "app.graph.nodes.classify.call_llm",
            return_value=_llm(json.dumps({"intent": "garbage"}), tokens=10),
        ):
            result = classify_node(_state("hello"))
        self.assertEqual(result, {"intent": "chat", "tokens": 10})

    def test_falls_back_to_chat_when_llm_unavailable(self) -> None:
        with patch("app.graph.nodes.classify.call_llm", return_value=_llm(None)):
            result = classify_node(_state("hello"))
        self.assertEqual(result, {"intent": "chat", "tokens": 0})

    def test_prompt_distinguishes_capture_from_question(self) -> None:
        # Smoke-check the prompt contains the capture-vs-question framing so
        # future edits can't quietly remove it.
        from app.graph.nodes.classify import CLASSIFY_SYSTEM_PROMPT

        self.assertIn("RECORDING new data", CLASSIFY_SYSTEM_PROMPT)
        self.assertIn("ALWAYS", CLASSIFY_SYSTEM_PROMPT)
        # Examples must cover both sides of the distinction.
        self.assertIn("I bought coffee", CLASSIFY_SYSTEM_PROMPT)
        self.assertIn("how much did I spend", CLASSIFY_SYSTEM_PROMPT)


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
    def test_finance_extractor_parses_data_and_tokens(self) -> None:
        payload = json.dumps(
            {
                "response": "Ooh interesting! Add to transactions?",
                "complete_response": "Done — added.",
                "cancelled_response": "No worries.",
                "data": {"type": "expense", "amount": 5, "currency": "USD"},
            }
        )
        with patch(
            "app.graph.nodes.extract.call_llm",
            return_value=_llm(payload, tokens=120),
        ):
            result = extract_finance_node(_state("Spent $5 on coffee"))
        self.assertEqual(result["response"], "Ooh interesting! Add to transactions?")
        self.assertEqual(result["complete_response"], "Done — added.")
        self.assertEqual(result["cancelled_response"], "No worries.")
        self.assertEqual(result["tokens"], 120)
        assert result["data"] is not None
        self.assertEqual(result["data"]["type"], "expense")

    def test_todo_extractor_leaves_missing_fields_null(self) -> None:
        with patch(
            "app.graph.nodes.extract.call_llm",
            return_value=_llm(json.dumps({"response": "ok"}), tokens=5),
        ):
            result = extract_todo_node(_state("buy milk"))
        self.assertEqual(result["response"], "ok")
        self.assertIsNone(result["complete_response"])
        self.assertIsNone(result["cancelled_response"])
        self.assertIsNone(result["data"])
        self.assertEqual(result["tokens"], 5)

    def test_note_extractor_falls_back_when_llm_unavailable(self) -> None:
        with patch("app.graph.nodes.extract.call_llm", return_value=_llm(None)):
            result = extract_note_node(_state("remember to call mom"))
        self.assertIn("Captured", result["response"])
        self.assertIsNone(result["complete_response"])
        self.assertIsNone(result["cancelled_response"])
        self.assertIsNone(result["data"])
        self.assertEqual(result["tokens"], 0)

    def test_finance_extractor_injects_notes_context_into_prompt(self) -> None:
        notes = [
            {
                "id": "n1",
                "title": "Coffee preference",
                "content": "Spanish coffee from Café X is my favorite",
                "date": "2026-05-20",
                "similarity": 0.82,
            }
        ]
        with patch(
            "app.graph.nodes.extract.call_llm",
            return_value=_llm(json.dumps({"response": "ok", "data": {}}), tokens=1),
        ) as call_mock:
            extract_finance_node(_state("I bought coffee for $4", notes_context=notes))

        system_prompt = call_mock.call_args.args[0]
        self.assertIn("Spanish coffee", system_prompt)
        self.assertIn("Relevant context", system_prompt)


class ChatReplyTests(unittest.TestCase):
    def test_returns_llm_reply_with_tokens(self) -> None:
        with patch(
            "app.graph.nodes.chat_reply.call_llm",
            return_value=_llm("Hi!", tokens=7),
        ):
            result = chat_reply_node(_state("hello"))
        self.assertEqual(
            result,
            {
                "response": "Hi!",
                "complete_response": None,
                "cancelled_response": None,
                "data": None,
                "tokens": 7,
                "used_source_ids": [],
            },
        )

    def test_falls_back_when_llm_unavailable(self) -> None:
        with patch("app.graph.nodes.chat_reply.call_llm", return_value=_llm(None)):
            result = chat_reply_node(_state("hello"))
        self.assertEqual(
            result,
            {
                "response": "(LLM unavailable) You said: hello",
                "complete_response": None,
                "cancelled_response": None,
                "data": None,
                "tokens": 0,
                "used_source_ids": [],
            },
        )

    def test_parses_used_source_ids_when_context_present(self) -> None:
        notes = [
            {
                "id": "n1",
                "title": "Pour-over",
                "content": "92°C, 1:16",
                "date": "2026-05-19",
                "similarity": 0.71,
            }
        ]
        payload = json.dumps(
            {"response": "Here's what your notes say.", "used_source_ids": ["n1"]}
        )
        with patch(
            "app.graph.nodes.chat_reply.call_llm",
            return_value=_llm(payload, tokens=10),
        ):
            result = chat_reply_node(_state("how do I brew?", notes_context=notes))
        self.assertEqual(result["response"], "Here's what your notes say.")
        self.assertEqual(result["used_source_ids"], ["n1"])

    def test_injects_notes_context_into_system_prompt(self) -> None:
        notes = [
            {
                "id": "n1",
                "title": "Pour-over recipe",
                "content": "92°C, 1:16 ratio, 4 minute pour",
                "date": "2026-05-19",
                "similarity": 0.71,
            }
        ]
        with patch(
            "app.graph.nodes.chat_reply.call_llm",
            return_value=_llm("Here's what your notes say.", tokens=3),
        ) as call_mock:
            chat_reply_node(_state("how do I brew pour over?", notes_context=notes))

        system_prompt = call_mock.call_args.args[0]
        self.assertIn("Pour-over recipe", system_prompt)
        self.assertIn("Relevant context", system_prompt)
