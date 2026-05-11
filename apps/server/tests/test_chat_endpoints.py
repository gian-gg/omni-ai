import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.main import app


class ChatEndpointsTestCase(unittest.TestCase):
    def test_chat_endpoint_returns_chat_response_shape(self) -> None:
        with patch(
            "app.v1.chat.run_orchestrator",
            return_value="DeepSeek reply",
        ):
            client = TestClient(app)
            response = client.post("/api/v1/chat", json={"prompt": "hello"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"response": "DeepSeek reply"})

    def test_agent_endpoint_returns_chat_response_shape(self) -> None:
        with patch(
            "app.v1.chat.run_orchestrator",
            return_value="DeepSeek reply",
        ):
            client = TestClient(app)
            response = client.post("/api/v1/agent", json={"prompt": "hello"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"response": "DeepSeek reply"})
