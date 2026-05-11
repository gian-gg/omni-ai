import unittest
from datetime import datetime, UTC
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.core.auth import AuthenticatedUser, VerifiedTokenClaims, get_current_authenticated_user
from app.main import app
from app.models.user import User


def _build_authenticated_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        claims=VerifiedTokenClaims(
            subject="supabase-user-123",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email="user@example.com",
            role="authenticated",
        ),
        user=User(
            id="local-user-123",
            supabase_user_id="supabase-user-123",
            email="user@example.com",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )


class ChatEndpointsTestCase(unittest.TestCase):
    def tearDown(self) -> None:
        app.dependency_overrides.clear()

    def test_chat_endpoint_returns_401_without_auth(self) -> None:
        client = TestClient(app)
        response = client.post("/api/v1/chat", json={"prompt": "hello"})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Authentication required."})

    def test_chat_endpoint_returns_chat_response_shape_when_authenticated(self) -> None:
        app.dependency_overrides[get_current_authenticated_user] = _build_authenticated_user

        with patch(
            "app.v1.chat.run_orchestrator",
            return_value="DeepSeek reply",
        ) as run_orchestrator_mock:
            client = TestClient(app)
            response = client.post("/api/v1/chat", json={"prompt": "hello"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"response": "DeepSeek reply"})
        run_orchestrator_mock.assert_called_once_with("hello", user_id="local-user-123")

    def test_agent_endpoint_returns_401_without_auth(self) -> None:
        client = TestClient(app)
        response = client.post("/api/v1/agent", json={"prompt": "hello"})

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Authentication required."})

    def test_agent_endpoint_returns_chat_response_shape_when_authenticated(self) -> None:
        app.dependency_overrides[get_current_authenticated_user] = _build_authenticated_user

        with patch(
            "app.v1.chat.run_orchestrator",
            return_value="DeepSeek reply",
        ) as run_orchestrator_mock:
            client = TestClient(app)
            response = client.post("/api/v1/agent", json={"prompt": "hello"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"response": "DeepSeek reply"})
        run_orchestrator_mock.assert_called_once_with("hello", user_id="local-user-123")
