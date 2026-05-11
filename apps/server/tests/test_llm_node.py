import unittest
from unittest.mock import MagicMock, patch

import httpx

from app.graph.nodes.llm import llm_node
from app.graph.state import OrchestratorState


class LlmNodeTestCase(unittest.TestCase):
    def test_llm_node_posts_to_deepseek_chat_completions(self) -> None:
        state: OrchestratorState = {
            "user_input": "Plan my groceries",
            "intent": "llm",
            "response": "",
        }
        response = MagicMock()
        response.json.return_value = {
            "choices": [
                {
                    "message": {
                        "content": "Buy rice and eggs.",
                    }
                }
            ]
        }
        client = MagicMock()
        client.__enter__.return_value = client
        client.post.return_value = response

        with (
            patch("app.graph.nodes.llm.httpx.Client", return_value=client),
            patch("app.graph.nodes.llm.settings.llm_api_key", "test-key"),
            patch("app.graph.nodes.llm.settings.llm_base_url", "https://api.deepseek.com"),
            patch("app.graph.nodes.llm.settings.llm_model", "deepseek-v4-flash"),
            patch(
                "app.graph.nodes.llm.settings.system_prompt",
                "You are a helpful, concise assistant.",
            ),
        ):
            result = llm_node(state)

        self.assertEqual(result, {"response": "Buy rice and eggs."})
        client.post.assert_called_once_with(
            "https://api.deepseek.com/chat/completions",
            headers={
                "Authorization": "Bearer test-key",
                "Content-Type": "application/json",
            },
            json={
                "model": "deepseek-v4-flash",
                "messages": [
                    {
                        "role": "system",
                        "content": "You are a helpful, concise assistant.",
                    },
                    {"role": "user", "content": "Plan my groceries"},
                ],
                "temperature": 0.2,
            },
        )

    def test_llm_node_returns_fallback_when_api_key_is_missing(self) -> None:
        state: OrchestratorState = {
            "user_input": "hello",
            "intent": "llm",
            "response": "",
        }

        with patch("app.graph.nodes.llm.settings.llm_api_key", None):
            result = llm_node(state)

        self.assertEqual(result, {"response": "(LLM unavailable) You said: hello"})

    def test_llm_node_returns_fallback_on_http_error(self) -> None:
        state: OrchestratorState = {
            "user_input": "hello",
            "intent": "llm",
            "response": "",
        }
        client = MagicMock()
        client.__enter__.return_value = client
        client.post.side_effect = httpx.HTTPError("boom")

        with (
            patch("app.graph.nodes.llm.httpx.Client", return_value=client),
            patch("app.graph.nodes.llm.settings.llm_api_key", "test-key"),
            patch("app.graph.nodes.llm.settings.llm_base_url", "https://api.deepseek.com"),
            patch("app.graph.nodes.llm.settings.llm_model", "deepseek-v4-flash"),
            patch(
                "app.graph.nodes.llm.settings.system_prompt",
                "You are a helpful, concise assistant.",
            ),
        ):
            result = llm_node(state)

        self.assertEqual(result, {"response": "(LLM unavailable) You said: hello"})

    def test_llm_node_returns_fallback_on_invalid_json(self) -> None:
        state: OrchestratorState = {
            "user_input": "hello",
            "intent": "llm",
            "response": "",
        }
        response = MagicMock()
        response.json.side_effect = ValueError("invalid json")
        client = MagicMock()
        client.__enter__.return_value = client
        client.post.return_value = response

        with (
            patch("app.graph.nodes.llm.httpx.Client", return_value=client),
            patch("app.graph.nodes.llm.settings.llm_api_key", "test-key"),
            patch("app.graph.nodes.llm.settings.llm_base_url", "https://api.deepseek.com"),
            patch("app.graph.nodes.llm.settings.llm_model", "deepseek-v4-flash"),
            patch(
                "app.graph.nodes.llm.settings.system_prompt",
                "You are a helpful, concise assistant.",
            ),
        ):
            result = llm_node(state)

        self.assertEqual(result, {"response": "(LLM unavailable) You said: hello"})
