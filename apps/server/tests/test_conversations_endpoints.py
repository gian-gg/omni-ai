import unittest
from collections.abc import Iterator
from datetime import UTC, datetime

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

# Reply generation is covered by tests/test_conversations_streaming.py; this
# module exercises the non-streaming CRUD endpoints (list, messages, append,
# delete) and seeds conversations directly through the database.


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

    def _seed_conversation(
        self,
        title: str = "seed",
        user_id: str = "local-user-123",
        *,
        with_message: bool = False,
    ) -> str:
        with self.session_factory() as session:
            conversation = Conversation(user_id=user_id, title=title)
            session.add(conversation)
            session.flush()
            if with_message:
                session.add(
                    Message(
                        conversation_id=conversation.id,
                        user_id=user_id,
                        role="user",
                        content="earlier turn",
                    )
                )
            session.commit()
            return conversation.id

    def test_requires_auth(self) -> None:
        app.dependency_overrides.pop(get_current_authenticated_user, None)
        response = self.client.post(
            "/api/v1/conversations", json={"prompt": "hello"}
        )
        self.assertEqual(response.status_code, 401)

    def test_list_returns_only_callers_conversations(self) -> None:
        self._seed_conversation("mine")
        self._seed_conversation("theirs", user_id="other-user-456")

        body = self.client.get("/api/v1/conversations").json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["title"], "mine")

    def test_messages_for_other_users_conversation_is_404(self) -> None:
        conversation_id = self._seed_conversation("secret", user_id="other-user-456")
        response = self.client.get(
            f"/api/v1/conversations/{conversation_id}/messages"
        )
        self.assertEqual(response.status_code, 404)

    def test_append_message_stores_without_generating_reply(self) -> None:
        conversation_id = self._seed_conversation()

        response = self.client.post(
            f"/api/v1/conversations/{conversation_id}/messages/append",
            json={"role": "assistant", "content": "manually inserted"},
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["role"], "assistant")
        self.assertEqual(body["content"], "manually inserted")
        self.assertIsNone(body["details"])

        messages = self.client.get(
            f"/api/v1/conversations/{conversation_id}/messages"
        ).json()["items"]
        self.assertEqual(messages[-1]["content"], "manually inserted")

    def test_append_message_is_404_for_other_users_conversation(self) -> None:
        conversation_id = self._seed_conversation(user_id="other-user-456")
        response = self.client.post(
            f"/api/v1/conversations/{conversation_id}/messages/append",
            json={"role": "user", "content": "hi"},
        )
        self.assertEqual(response.status_code, 404)

    def test_append_message_rejects_invalid_role(self) -> None:
        conversation_id = self._seed_conversation()
        response = self.client.post(
            f"/api/v1/conversations/{conversation_id}/messages/append",
            json={"role": "system", "content": "nope"},
        )
        self.assertEqual(response.status_code, 422)

    def test_delete_conversation(self) -> None:
        conversation_id = self._seed_conversation()

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


if __name__ == "__main__":
    unittest.main()
