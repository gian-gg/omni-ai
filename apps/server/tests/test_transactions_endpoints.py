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
from app.models import Transaction, User  # noqa: F401 — ensure metadata is populated


def _build_authenticated_user(
    user_id: str = "local-user-123", currency: str | None = None
) -> AuthenticatedUser:
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
            currency=currency,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    )


class TransactionsEndpointsTestCase(unittest.TestCase):
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

        # Seed two users so we can assert isolation.
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
            "type": "expense",
            "amount": 12.50,
            "currency": "USD",
            "category": "food",
            "description": "coffee",
            "date": "2026-05-23",
        }
        base.update(overrides)
        return base

    def test_post_creates_transaction(self) -> None:
        response = self.client.post("/api/v1/transactions", json=self._payload())
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertTrue(body["id"])
        self.assertEqual(body["amount"], 12.50)
        self.assertEqual(body["date"], "2026-05-23")

    def test_post_applies_user_default_currency_when_omitted(self) -> None:
        app.dependency_overrides[get_current_authenticated_user] = (
            lambda: _build_authenticated_user("local-user-123", currency="PHP")
        )
        payload = self._payload()
        payload.pop("currency")  # client omits currency
        response = self.client.post("/api/v1/transactions", json=payload)
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["currency"], "PHP")

    def test_post_respects_explicit_currency_over_user_default(self) -> None:
        app.dependency_overrides[get_current_authenticated_user] = (
            lambda: _build_authenticated_user("local-user-123", currency="PHP")
        )
        response = self.client.post(
            "/api/v1/transactions", json=self._payload(currency="EUR")
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["currency"], "EUR")

    def test_list_returns_only_callers_transactions(self) -> None:
        # Caller transaction.
        self.client.post(
            "/api/v1/transactions", json=self._payload(description="mine")
        )
        # Other user's transaction.
        self._act_as("other-user-456")
        self.client.post(
            "/api/v1/transactions", json=self._payload(description="theirs")
        )

        self._act_as("local-user-123")
        response = self.client.get("/api/v1/transactions")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 1)
        self.assertEqual(body["items"][0]["description"], "mine")

    def test_get_by_id_is_404_for_other_users_row(self) -> None:
        self._act_as("other-user-456")
        created = self.client.post(
            "/api/v1/transactions", json=self._payload()
        ).json()

        self._act_as("local-user-123")
        response = self.client.get(f"/api/v1/transactions/{created['id']}")
        self.assertEqual(response.status_code, 404)

    def test_patch_updates_only_provided_fields(self) -> None:
        created = self.client.post(
            "/api/v1/transactions", json=self._payload()
        ).json()

        response = self.client.patch(
            f"/api/v1/transactions/{created['id']}",
            json={"amount": 99.99},
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["amount"], 99.99)
        self.assertEqual(body["description"], "coffee")
        self.assertEqual(body["category"], "food")

    def test_delete_removes_transaction(self) -> None:
        created = self.client.post(
            "/api/v1/transactions", json=self._payload()
        ).json()

        delete_response = self.client.delete(
            f"/api/v1/transactions/{created['id']}"
        )
        self.assertEqual(delete_response.status_code, 204)

        follow_up = self.client.get(f"/api/v1/transactions/{created['id']}")
        self.assertEqual(follow_up.status_code, 404)

    def test_endpoints_require_auth(self) -> None:
        app.dependency_overrides.pop(get_current_authenticated_user, None)
        cases = [
            ("post", "/api/v1/transactions", {"json": self._payload()}),
            ("get", "/api/v1/transactions", {}),
            ("get", "/api/v1/transactions/anything", {}),
            ("patch", "/api/v1/transactions/anything", {"json": {"amount": 1}}),
            ("delete", "/api/v1/transactions/anything", {}),
        ]
        for method, path, kwargs in cases:
            with self.subTest(method=method, path=path):
                response = getattr(self.client, method)(path, **kwargs)
                self.assertEqual(response.status_code, 401)
