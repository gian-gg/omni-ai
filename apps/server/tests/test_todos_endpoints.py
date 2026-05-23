import unittest
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

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
from app.models import Todo, User  # noqa: F401 — ensure metadata is populated


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


class TodosEndpointsTestCase(unittest.TestCase):
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

    def _payload(self, **overrides: Any) -> dict[str, Any]:
        base: dict[str, Any] = {
            "title": "buy milk",
            "description": "from the corner store",
            "due_date": "2026-05-30",
            "priority": "medium",
            "date": "2026-05-23",
        }
        base.update(overrides)
        return base

    def test_post_creates_todo_with_is_done_false(self) -> None:
        response = self.client.post("/api/v1/todos", json=self._payload())
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["id"])
        self.assertEqual(body["title"], "buy milk")
        self.assertEqual(body["due_date"], "2026-05-30")
        self.assertFalse(body["is_done"])

    def test_list_returns_only_callers_todos(self) -> None:
        self.client.post("/api/v1/todos", json=self._payload(title="mine"))

        self._act_as("other-user-456")
        self.client.post("/api/v1/todos", json=self._payload(title="theirs"))

        self._act_as("local-user-123")
        response = self.client.get("/api/v1/todos")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["title"], "mine")

    def test_get_by_id_is_404_for_other_users_row(self) -> None:
        self._act_as("other-user-456")
        created = self.client.post("/api/v1/todos", json=self._payload()).json()

        self._act_as("local-user-123")
        response = self.client.get(f"/api/v1/todos/{created['id']}")
        self.assertEqual(response.status_code, 404)

    def test_patch_updates_only_provided_fields(self) -> None:
        created = self.client.post("/api/v1/todos", json=self._payload()).json()

        response = self.client.patch(
            f"/api/v1/todos/{created['id']}",
            json={"priority": "high", "is_done": True},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["priority"], "high")
        self.assertTrue(body["is_done"])
        self.assertEqual(body["title"], "buy milk")
        self.assertEqual(body["description"], "from the corner store")

    def test_complete_marks_todo_done(self) -> None:
        created = self.client.post("/api/v1/todos", json=self._payload()).json()

        response = self.client.post(f"/api/v1/todos/{created['id']}/complete")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["is_done"])

    def test_delete_removes_todo(self) -> None:
        created = self.client.post("/api/v1/todos", json=self._payload()).json()

        delete_response = self.client.delete(f"/api/v1/todos/{created['id']}")
        self.assertEqual(delete_response.status_code, 204)

        follow_up = self.client.get(f"/api/v1/todos/{created['id']}")
        self.assertEqual(follow_up.status_code, 404)

    def test_endpoints_require_auth(self) -> None:
        app.dependency_overrides.pop(get_current_authenticated_user, None)
        cases = [
            ("post", "/api/v1/todos", {"json": self._payload()}),
            ("get", "/api/v1/todos", {}),
            ("get", "/api/v1/todos/anything", {}),
            ("patch", "/api/v1/todos/anything", {"json": {"title": "x"}}),
            ("post", "/api/v1/todos/anything/complete", {}),
            ("delete", "/api/v1/todos/anything", {}),
        ]
        for method, path, kwargs in cases:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path, **kwargs)
                self.assertEqual(response.status_code, 401)
