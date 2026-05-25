import json
import unittest
from collections.abc import Iterator
from unittest.mock import patch

from app.graph.nodes._llm_client import (
    parse_json_object,
    stream_llm,
    strip_reasoning,
)

# The fullwidth end-of-thinking token deepseek-v4-flash actually emits when its
# chain-of-thought bleeds into the `content` channel under json_object mode.
MARKER = "<｜end▁of▁thinking｜>"


class StripReasoningTests(unittest.TestCase):
    def test_returns_plain_text_unchanged(self) -> None:
        self.assertEqual(strip_reasoning("Bruno."), "Bruno.")

    def test_keeps_only_text_after_last_thinking_marker(self) -> None:
        leaked = (
            f"Let's craft.{MARKER} should be a proposal.{MARKER}"
            "Your dog's name is Bruno."
        )
        self.assertEqual(strip_reasoning(leaked), "Your dog's name is Bruno.")

    def test_strips_ascii_marker_variant(self) -> None:
        leaked = "reasoning here<|end_of_thinking|>Final answer."
        self.assertEqual(strip_reasoning(leaked), "Final answer.")

    def test_removes_think_tag_blocks(self) -> None:
        leaked = "<think>deliberating</think>Hello."
        self.assertEqual(strip_reasoning(leaked), "Hello.")


class ParseJsonObjectTests(unittest.TestCase):
    def test_parses_clean_json(self) -> None:
        self.assertEqual(parse_json_object('{"response": "hi"}'), {"response": "hi"})

    def test_recovers_json_after_leaked_reasoning_and_code_fence(self) -> None:
        # Mirrors a real captured leak: whitespace + reasoning + markers, then a
        # fenced JSON answer.
        raw = (
            "      Let's craft.{m}: \"Got it\".{m} produce JSON.{m}```json\n"
            '{{\n  "response": "Got it — added to your todos.",\n'
            '  "used_source_ids": []\n}}\n```'
        ).format(m=MARKER)
        parsed = parse_json_object(raw)
        assert parsed is not None
        self.assertEqual(parsed["response"], "Got it — added to your todos.")
        self.assertEqual(parsed["used_source_ids"], [])

    def test_extracts_embedded_object_without_fence(self) -> None:
        raw = f"thinking aloud{MARKER}\n{{\"response\": \"ok\"}}"
        self.assertEqual(parse_json_object(raw), {"response": "ok"})

    def test_returns_none_for_unparseable(self) -> None:
        self.assertIsNone(parse_json_object("not json at all"))


def _fake_stream_client(lines: list[str]):
    class _FakeResponse:
        def raise_for_status(self) -> None:
            pass

        def iter_lines(self) -> Iterator[str]:
            yield from lines

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

    class _FakeClient:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def stream(self, *_args, **_kwargs):
            return _FakeResponse()

    return _FakeClient


class StreamSanitizerTests(unittest.TestCase):
    def _run(self, lines: list[str]) -> str:
        with (
            patch(
                "app.graph.nodes._llm_client.httpx.Client",
                _fake_stream_client(lines),
            ),
            patch("app.graph.nodes._llm_client.settings.llm_api_key", "test-key"),
        ):
            events = list(stream_llm("system", "user"))
        return "".join(e.delta for e in events if e.delta)

    def test_strips_marker_split_across_deltas(self) -> None:
        # The marker arrives one character per chunk; none of it should surface.
        chars = list("answer ") + list(MARKER) + list("text")
        lines = [
            "data: " + json.dumps({"choices": [{"delta": {"content": c}}]})
            for c in chars
        ]
        self.assertEqual(self._run(lines), "answer text")


if __name__ == "__main__":
    unittest.main()
