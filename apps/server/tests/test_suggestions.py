import json
import unittest
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
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
from app.graph.nodes._llm_client import LLMCallResult
from app.main import app
from app.models import Note, SuggestionCache, Todo, Transaction, User
from app.services import suggestions as service

_USER_ID = "user-1"


def _llm(content: str | None) -> LLMCallResult:
    return LLMCallResult(content=content, tokens=0)


def _ok_llm() -> LLMCallResult:
    return _llm(
        json.dumps({"suggestions": ["What did I spend on coffee?", "Any todos due?"]})
    )


class SuggestionsServiceTests(unittest.TestCase):
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
        self.session = self.session_factory()
        self.user = User(
            id=_USER_ID,
            supabase_user_id="supabase-user-1",
            email="user-1@example.com",
            currency="PHP",
        )
        self.session.add(self.user)
        self.session.commit()

    def tearDown(self) -> None:
        self.session.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def _add_note(self, title: str = "Pour-over grind") -> None:
        self.session.add(
            Note(
                user_id=_USER_ID,
                title=title,
                content="Consistent grind matters.",
                tags=["coffee"],
                date=date.today(),
            )
        )
        self.session.commit()

    def test_generates_and_persists_on_first_call(self) -> None:
        self._add_note()
        with patch.object(service, "call_llm", return_value=_ok_llm()) as llm:
            result = service.get_suggestions(self.session, self.user)

        llm.assert_called_once()
        self.assertFalse(result.cached)
        self.assertEqual(
            result.suggestions, ["What did I spend on coffee?", "Any todos due?"]
        )
        stored = self.session.get(SuggestionCache, _USER_ID)
        self.assertIsNotNone(stored)
        self.assertEqual(stored.prompts, result.suggestions)

    def test_returns_cache_when_fresh(self) -> None:
        self._add_note()
        with patch.object(service, "call_llm", return_value=_ok_llm()):
            service.get_suggestions(self.session, self.user)

        with patch.object(service, "call_llm") as llm:
            result = service.get_suggestions(self.session, self.user)

        llm.assert_not_called()
        self.assertTrue(result.cached)

    def test_regenerates_when_fingerprint_changes(self) -> None:
        self._add_note()
        with patch.object(service, "call_llm", return_value=_ok_llm()):
            service.get_suggestions(self.session, self.user)

        self._add_note("Second note")  # data changed → fingerprint differs
        with patch.object(service, "call_llm", return_value=_ok_llm()) as llm:
            result = service.get_suggestions(self.session, self.user)

        llm.assert_called_once()
        self.assertFalse(result.cached)

    def test_regenerates_when_ttl_expired(self) -> None:
        self._add_note()
        with patch.object(service, "call_llm", return_value=_ok_llm()):
            service.get_suggestions(self.session, self.user)

        stale = datetime.now(UTC) - service.SUGGESTIONS_TTL - timedelta(minutes=1)
        cache = self.session.get(SuggestionCache, _USER_ID)
        cache.generated_at = stale
        self.session.commit()

        with patch.object(service, "call_llm", return_value=_ok_llm()) as llm:
            result = service.get_suggestions(self.session, self.user)

        llm.assert_called_once()
        self.assertFalse(result.cached)

    def test_force_bypasses_fresh_cache(self) -> None:
        self._add_note()
        with patch.object(service, "call_llm", return_value=_ok_llm()):
            service.get_suggestions(self.session, self.user)

        with patch.object(service, "call_llm", return_value=_ok_llm()) as llm:
            result = service.get_suggestions(self.session, self.user, force=True)

        llm.assert_called_once()
        self.assertFalse(result.cached)

    def test_falls_back_when_llm_unavailable(self) -> None:
        self._add_note()
        with patch.object(service, "call_llm", return_value=_llm(None)):
            result = service.get_suggestions(self.session, self.user)

        self.assertEqual(result.suggestions, service.STATIC_FALLBACK)

    def test_falls_back_on_malformed_json(self) -> None:
        self._add_note()
        with patch.object(service, "call_llm", return_value=_llm("not json")):
            result = service.get_suggestions(self.session, self.user)

        self.assertEqual(result.suggestions, service.STATIC_FALLBACK)

    def test_static_fallback_without_llm_when_no_activity(self) -> None:
        with patch.object(service, "call_llm") as llm:
            result = service.get_suggestions(self.session, self.user)

        llm.assert_not_called()
        self.assertEqual(result.suggestions, service.STATIC_FALLBACK)

    def test_caps_count_and_length(self) -> None:
        self._add_note()
        long = "x" * 200
        payload = {"suggestions": [long, "b", "c", "d", "e", "f"]}
        with patch.object(service, "call_llm", return_value=_llm(json.dumps(payload))):
            result = service.get_suggestions(self.session, self.user)

        self.assertLessEqual(len(result.suggestions), service.MAX_SUGGESTIONS)
        self.assertLessEqual(len(result.suggestions[0]), service.MAX_SUGGESTION_LENGTH)

    def test_fingerprint_tracks_todos_and_transactions(self) -> None:
        base = service._compute_fingerprint(self.session, _USER_ID)
        self.session.add(
            Todo(
                user_id=_USER_ID,
                title="Call dentist",
                priority="high",
                date=date.today(),
                is_done=False,
            )
        )
        self.session.add(
            Transaction(
                user_id=_USER_ID,
                type="expense",
                amount=Decimal("4.00"),
                category="food",
                date=date.today(),
            )
        )
        self.session.commit()
        self.assertNotEqual(base, service._compute_fingerprint(self.session, _USER_ID))


def _authenticated_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        claims=VerifiedTokenClaims(
            subject="supabase-user-1",
            issuer="https://demo.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email="user-1@example.com",
            role="authenticated",
        ),
        user=User(
            id=_USER_ID,
            supabase_user_id="supabase-user-1",
            email="user-1@example.com",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )


class SuggestionsEndpointTests(unittest.TestCase):
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
        with self.session_factory() as setup:
            setup.add(
                User(
                    id=_USER_ID,
                    supabase_user_id="supabase-user-1",
                    email="user-1@example.com",
                )
            )
            setup.commit()

        def override_db_session() -> Iterator[Session]:
            session = self.session_factory()
            try:
                yield session
            finally:
                session.close()

        app.dependency_overrides[get_db_session] = override_db_session
        app.dependency_overrides[get_current_authenticated_user] = _authenticated_user
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_requires_auth(self) -> None:
        app.dependency_overrides.pop(get_current_authenticated_user, None)
        response = self.client.get("/api/v1/suggestions")
        self.assertEqual(response.status_code, 401)

    def test_returns_suggestions_payload(self) -> None:
        response = self.client.get("/api/v1/suggestions")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertIn("suggestions", body)
        self.assertIn("generated_at", body)
        self.assertFalse(body["cached"])
        # No activity for this user → static fallback.
        self.assertEqual(body["suggestions"], service.STATIC_FALLBACK)


if __name__ == "__main__":
    unittest.main()
