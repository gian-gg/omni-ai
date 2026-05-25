import unittest
from collections.abc import Iterator
from datetime import UTC, datetime
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.auth import (
    AuthenticatedUser,
    VerifiedTokenClaims,
    get_current_authenticated_user,
)
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models import Conversation, Message, User  # noqa: F401 — populate metadata
from app.services.orchestrator import OrchestratorResult


def _build_authenticated_user(user_id: str = "local-user-123") -> AuthenticatedUser:
    return AuthenticatedUser(
        claims=VerifiedTokenClaims(
            subject=f"supabase-{user_id}",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email=f"{user_id}@example.com",
            role="authenticated",
        ),
        user=User(
            id=user_id,
            supabase_user_id=f"supabase-{user_id}",
            email=f"{user_id}@example.com",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )


def _result(response: str = "DeepSeek reply", **overrides) -> OrchestratorResult:
    base = {
        "intent": "chat",
        "response": response,
        "complete_response": None,
        "cancelled_response": None,
        "data": None,
        "tokens": 7,
        "datetime": datetime(2026, 5, 25, 12, 0, tzinfo=UTC),
        "sources": [],
        "tool_calls": [],
    }
    base.update(overrides)
    return OrchestratorResult(**base)


class ConversationsEndpointsTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine, autoflush=False, expire_on_commit=False
        )

        with self.session_factory() as setup_session:
            setup_session.add_all(
                [
                    User(
                        id="local-user-123",
                        supabase_user_id="supabase-local-user-123",
                        email="local-user-123@example.com",
                    ),
                    User(
                        id="other-user-456",
                        supabase_user_id="supabase-other-user-456",
                        email="other-user-456@example.com",
                    ),
                ]
            )
            setup_session.commit()

        def override_db_session() -> Iterator[Session]:
            session = self.session_factory()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db_session] = override_db_session
        app.dependency_overrides[get_current_authenticated_user] = (
            lambda: _build_authenticated_user("local-user-123")
        )
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _act_as(self, user_id: str) -> None:
        app.dependency_overrides[get_current_authenticated_user] = (
            lambda: _build_authenticated_user(user_id)
        )

    def test_requires_auth(self) -> None:
        app.dependency_overrides.pop(get_current_authenticated_user, None)
        response = self.client.post(
            "/api/v1/conversations", json={"prompt": "hello"}
        )
        self.assertEqual(response.status_code, 401)

    def test_create_conversation_returns_conversation_and_reply(self) -> None:
        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result("Hi there!", tokens=12),
        ):
            response = self.client.post(
                "/api/v1/conversations",
                json={"prompt": "  hello   world  "},
            )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        # Title is derived (whitespace collapsed) from the first prompt.
        self.assertEqual(body["conversation"]["title"], "hello world")
        self.assertTrue(body["conversation"]["id"])
        self.assertEqual(body["message"]["role"], "assistant")
        self.assertEqual(body["message"]["content"], "Hi there!")
        self.assertEqual(body["message"]["details"]["intent"], "chat")
        self.assertEqual(body["message"]["details"]["tokens"], 12)

    def test_create_persists_user_and_assistant_messages(self) -> None:
        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result("Hi!"),
        ):
            created = self.client.post(
                "/api/v1/conversations", json={"prompt": "hello"}
            ).json()

        conversation_id = created["conversation"]["id"]
        messages = self.client.get(
            f"/api/v1/conversations/{conversation_id}/messages"
        ).json()["items"]
        self.assertEqual([m["role"] for m in messages], ["user", "assistant"])
        self.assertEqual(messages[0]["content"], "hello")
        self.assertEqual(messages[1]["content"], "Hi!")

    def test_long_prompt_title_is_truncated(self) -> None:
        long_prompt = "word " * 40  # 200 chars
        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result(),
        ):
            body = self.client.post(
                "/api/v1/conversations", json={"prompt": long_prompt}
            ).json()
        title = body["conversation"]["title"]
        self.assertLessEqual(len(title), 60)
        self.assertTrue(title.endswith("…"))

    def test_add_message_forwards_prior_history_to_orchestrator(self) -> None:
        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result("Logged a $4 coffee expense."),
        ):
            created = self.client.post(
                "/api/v1/conversations",
                json={"prompt": "I spent $4 on coffee"},
            ).json()
        conversation_id = created["conversation"]["id"]

        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result("Not really, that's typical."),
        ) as run_mock:
            response = self.client.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                json={"prompt": "was that a lot?"},
            )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["content"], "Not really, that's typical.")

        # History from the DB (first user + assistant turn) is forwarded.
        passed_history = run_mock.call_args.kwargs["history"]
        self.assertEqual(
            passed_history,
            [
                {"role": "user", "content": "I spent $4 on coffee"},
                {"role": "assistant", "content": "Logged a $4 coffee expense."},
            ],
        )

    def test_list_returns_only_callers_conversations(self) -> None:
        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result(),
        ):
            self.client.post("/api/v1/conversations", json={"prompt": "mine"})
            self._act_as("other-user-456")
            self.client.post("/api/v1/conversations", json={"prompt": "theirs"})

        self._act_as("local-user-123")
        body = self.client.get("/api/v1/conversations").json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["title"], "mine")

    def test_other_users_conversation_is_404(self) -> None:
        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result(),
        ):
            self._act_as("other-user-456")
            created = self.client.post(
                "/api/v1/conversations", json={"prompt": "secret"}
            ).json()

        conversation_id = created["conversation"]["id"]
        self._act_as("local-user-123")

        self.assertEqual(
            self.client.get(
                f"/api/v1/conversations/{conversation_id}/messages"
            ).status_code,
            404,
        )
        self.assertEqual(
            self.client.post(
                f"/api/v1/conversations/{conversation_id}/messages",
                json={"prompt": "hi"},
            ).status_code,
            404,
        )

    def _create_conversation(self, prompt: str = "hello") -> str:
        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result(),
        ):
            return self.client.post(
                "/api/v1/conversations", json={"prompt": prompt}
            ).json()["conversation"]["id"]

    def test_append_message_stores_without_generating_reply(self) -> None:
        conversation_id = self._create_conversation()

        with patch("app.services.conversations.run_orchestrator") as run_mock:
            response = self.client.post(
                f"/api/v1/conversations/{conversation_id}/messages/append",
                json={"role": "assistant", "content": "manually inserted"},
            )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["role"], "assistant")
        self.assertEqual(body["content"], "manually inserted")
        self.assertIsNone(body["details"])
        run_mock.assert_not_called()

        messages = self.client.get(
            f"/api/v1/conversations/{conversation_id}/messages"
        ).json()["items"]
        self.assertEqual(messages[-1]["content"], "manually inserted")

    def test_append_message_is_404_for_other_users_conversation(self) -> None:
        self._act_as("other-user-456")
        conversation_id = self._create_conversation("theirs")

        self._act_as("local-user-123")
        response = self.client.post(
            f"/api/v1/conversations/{conversation_id}/messages/append",
            json={"role": "user", "content": "hi"},
        )
        self.assertEqual(response.status_code, 404)

    def test_append_message_rejects_invalid_role(self) -> None:
        conversation_id = self._create_conversation()
        response = self.client.post(
            f"/api/v1/conversations/{conversation_id}/messages/append",
            json={"role": "system", "content": "nope"},
        )
        self.assertEqual(response.status_code, 422)

    def test_delete_conversation(self) -> None:
        with patch(
            "app.services.conversations.run_orchestrator",
            return_value=_result(),
        ):
            created = self.client.post(
                "/api/v1/conversations", json={"prompt": "hello"}
            ).json()
        conversation_id = created["conversation"]["id"]

        self.assertEqual(
            self.client.delete(
                f"/api/v1/conversations/{conversation_id}"
            ).status_code,
            204,
        )
        self.assertEqual(
            self.client.get(
                f"/api/v1/conversations/{conversation_id}/messages"
            ).status_code,
            404,
        )
