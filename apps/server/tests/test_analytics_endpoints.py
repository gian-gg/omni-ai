import unittest
from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta

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
from app.models import Note, Todo, Transaction, User  # noqa: F401 — populate metadata


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


class AnalyticsEndpointsTestCase(unittest.TestCase):
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

        self.today = date.today()
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
            self._seed(setup_session)

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

    def _seed(self, session: Session) -> None:
        # Caller's transactions: income 100, expenses 30 (food) + 20 (rent).
        session.add_all(
            [
                Transaction(
                    user_id="local-user-123",
                    type="income",
                    amount=100,
                    category="salary",
                    date=self.today,
                ),
                Transaction(
                    user_id="local-user-123",
                    type="expense",
                    amount=30,
                    category="food",
                    date=self.today,
                ),
                Transaction(
                    user_id="local-user-123",
                    type="expense",
                    amount=20,
                    category="rent",
                    date=self.today,
                ),
                # Other user's transaction must never leak into the caller's totals.
                Transaction(
                    user_id="other-user-456",
                    type="expense",
                    amount=999,
                    category="food",
                    date=self.today,
                ),
            ]
        )
        # Todos: one done, one open, one overdue (open + past due).
        session.add_all(
            [
                Todo(
                    user_id="local-user-123",
                    title="done one",
                    priority="high",
                    is_done=True,
                    date=self.today,
                ),
                Todo(
                    user_id="local-user-123",
                    title="open one",
                    priority="medium",
                    is_done=False,
                    due_date=self.today + timedelta(days=3),
                    date=self.today,
                ),
                Todo(
                    user_id="local-user-123",
                    title="overdue one",
                    priority="low",
                    is_done=False,
                    due_date=self.today - timedelta(days=2),
                    date=self.today,
                ),
            ]
        )
        # Notes: two recent, one stale; tags overlap on "work".
        session.add_all(
            [
                Note(
                    user_id="local-user-123",
                    content="recent a",
                    tags=["work", "ideas"],
                    date=self.today,
                ),
                Note(
                    user_id="local-user-123",
                    content="recent b",
                    tags=["work"],
                    date=self.today,
                ),
                Note(
                    user_id="local-user-123",
                    content="stale",
                    tags=["old"],
                    date=self.today - timedelta(days=90),
                ),
            ]
        )
        session.commit()

    def test_finance_summary_totals_and_breakdowns(self) -> None:
        response = self.client.get("/api/v1/analytics/finance")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["income"], 100.0)
        self.assertEqual(body["expense"], 50.0)
        self.assertEqual(body["net"], 50.0)
        self.assertEqual(body["transaction_count"], 3)

        by_category = {row["group"]: row["value"] for row in body["by_category"]}
        self.assertEqual(by_category, {"food": 30.0, "rent": 20.0})

        by_type = {row["group"]: row["value"] for row in body["by_type"]}
        self.assertEqual(by_type, {"income": 100.0, "expense": 50.0})

    def test_finance_summary_respects_date_filter(self) -> None:
        future = (self.today + timedelta(days=1)).isoformat()
        response = self.client.get(
            "/api/v1/analytics/finance", params={"from_date": future}
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["transaction_count"], 0)
        self.assertEqual(body["net"], 0.0)

    def test_todos_summary_counts(self) -> None:
        response = self.client.get("/api/v1/analytics/todos")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 3)
        self.assertEqual(body["open"], 2)
        self.assertEqual(body["done"], 1)
        self.assertEqual(body["overdue"], 1)
        by_priority = {row["group"]: row["value"] for row in body["by_priority"]}
        self.assertEqual(by_priority, {"high": 1.0, "medium": 1.0, "low": 1.0})

    def test_notes_summary_counts_and_top_tags(self) -> None:
        response = self.client.get("/api/v1/analytics/notes")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["total"], 3)
        self.assertEqual(body["recent"], 2)
        top = {row["tag"]: row["count"] for row in body["top_tags"]}
        self.assertEqual(top["work"], 2)
        self.assertEqual(top["ideas"], 1)

    def test_overview_combines_domains(self) -> None:
        response = self.client.get("/api/v1/analytics/overview")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["net_balance"], 50.0)
        self.assertEqual(body["transaction_count"], 3)
        self.assertEqual(body["open_todos"], 2)
        self.assertEqual(body["overdue_todos"], 1)
        self.assertEqual(body["total_notes"], 3)

    def test_empty_user_gets_zeroed_results(self) -> None:
        app.dependency_overrides[get_current_authenticated_user] = (
            lambda: _build_authenticated_user("other-user-456")
        )
        # other-user-456 has one expense but no todos or notes.
        overview = self.client.get("/api/v1/analytics/overview").json()
        self.assertEqual(overview["net_balance"], -999.0)
        self.assertEqual(overview["open_todos"], 0)
        self.assertEqual(overview["overdue_todos"], 0)
        self.assertEqual(overview["total_notes"], 0)

        notes = self.client.get("/api/v1/analytics/notes").json()
        self.assertEqual(notes["total"], 0)
        self.assertEqual(notes["top_tags"], [])


if __name__ == "__main__":
    unittest.main()
