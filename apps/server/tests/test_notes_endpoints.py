import unittest
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any
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
from app.models import Note, User  # noqa: F401 — ensure metadata is populated


DETERMINISTIC_VECTOR = [0.01] * 768


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


class NotesEndpointsTestCase(unittest.TestCase):
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

        # Patch the embedding call across the entire test so create_note /
        # update_note don't hit Gemini.
        self.embed_patcher = patch(
            "app.services.notes.embed", return_value=DETERMINISTIC_VECTOR
        )
        self.embed_mock = self.embed_patcher.start()

    def tearDown(self) -> None:
        self.embed_patcher.stop()
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _act_as(self, user_id: str) -> None:
        app.dependency_overrides[get_current_authenticated_user] = (
            lambda: _build_authenticated_user(user_id)
        )

    def _payload(self, **overrides: Any) -> dict[str, Any]:
        base: dict[str, Any] = {
            "title": "Coffee notes",
            "content": "single-origin pour-over feels best at 92°C",
            "tags": ["coffee"],
            "date": "2026-05-23",
        }
        base.update(overrides)
        return base

    def test_post_creates_note_and_embeds_once(self) -> None:
        response = self.client.post("/api/v1/notes", json=self._payload())
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["id"])
        self.assertEqual(body["title"], "Coffee notes")
        self.assertEqual(body["tags"], ["coffee"])
        self.assertNotIn("embedding", body)
        self.embed_mock.assert_called_once()
        self.assertEqual(self.embed_mock.call_args.kwargs["task_type"], "RETRIEVAL_DOCUMENT")

    def test_post_still_succeeds_when_embedding_fails(self) -> None:
        self.embed_mock.return_value = None
        response = self.client.post("/api/v1/notes", json=self._payload())
        self.assertEqual(response.status_code, 201)

    def test_list_returns_only_callers_notes(self) -> None:
        self.client.post("/api/v1/notes", json=self._payload(title="mine"))

        self._act_as("other-user-456")
        self.client.post("/api/v1/notes", json=self._payload(title="theirs"))

        self._act_as("local-user-123")
        response = self.client.get("/api/v1/notes")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["title"], "mine")

    def test_get_by_id_is_404_for_other_users_row(self) -> None:
        self._act_as("other-user-456")
        created = self.client.post("/api/v1/notes", json=self._payload()).json()

        self._act_as("local-user-123")
        response = self.client.get(f"/api/v1/notes/{created['id']}")
        self.assertEqual(response.status_code, 404)

    def test_patch_re_embeds_only_on_text_change(self) -> None:
        created = self.client.post("/api/v1/notes", json=self._payload()).json()
        self.embed_mock.reset_mock()

        # Tag-only edit: no re-embed.
        self.client.patch(
            f"/api/v1/notes/{created['id']}", json={"tags": ["coffee", "brewing"]}
        )
        self.assertEqual(self.embed_mock.call_count, 0)

        # Content edit: re-embed.
        self.client.patch(
            f"/api/v1/notes/{created['id']}", json={"content": "switched to 94°C"}
        )
        self.assertEqual(self.embed_mock.call_count, 1)

    def test_delete_removes_note(self) -> None:
        created = self.client.post("/api/v1/notes", json=self._payload()).json()

        delete_response = self.client.delete(f"/api/v1/notes/{created['id']}")
        self.assertEqual(delete_response.status_code, 204)

        follow_up = self.client.get(f"/api/v1/notes/{created['id']}")
        self.assertEqual(follow_up.status_code, 404)

    def test_search_returns_ranked_matches(self) -> None:
        created = self.client.post("/api/v1/notes", json=self._payload()).json()

        with patch(
            "app.v1.notes.service.search_notes",
            return_value=[
                (
                    Note(
                        id=created["id"],
                        user_id="local-user-123",
                        title=created["title"],
                        content=created["content"],
                        tags=created["tags"],
                        date=datetime.fromisoformat(created["date"]).date(),
                        created_at=datetime.now(UTC),
                        updated_at=datetime.now(UTC),
                    ),
                    0.93,
                )
            ],
        ) as search_mock:
            response = self.client.post(
                "/api/v1/notes/search",
                json={"query": "how to brew pour over", "limit": 5},
            )

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(len(body["items"]), 1)
        self.assertEqual(body["items"][0]["id"], created["id"])
        self.assertAlmostEqual(body["items"][0]["similarity"], 0.93, places=2)
        search_mock.assert_called_once()

    def test_search_returns_503_when_embedding_unavailable(self) -> None:
        from app.services.notes import EmbeddingUnavailableError

        with patch(
            "app.v1.notes.service.search_notes",
            side_effect=EmbeddingUnavailableError("no key"),
        ):
            response = self.client.post(
                "/api/v1/notes/search",
                json={"query": "anything", "limit": 5},
            )
        self.assertEqual(response.status_code, 503)

    def test_endpoints_require_auth(self) -> None:
        app.dependency_overrides.pop(get_current_authenticated_user, None)
        cases = [
            ("post", "/api/v1/notes", {"json": self._payload()}),
            ("get", "/api/v1/notes", {}),
            ("get", "/api/v1/notes/anything", {}),
            ("patch", "/api/v1/notes/anything", {"json": {"content": "x"}}),
            ("delete", "/api/v1/notes/anything", {}),
            ("post", "/api/v1/notes/search", {"json": {"query": "x"}}),
        ]
        for method, path, kwargs in cases:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path, **kwargs)
                self.assertEqual(response.status_code, 401)
