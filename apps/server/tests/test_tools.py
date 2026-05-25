import unittest
from datetime import date
from decimal import Decimal

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.models import Note, Todo, Transaction, User  # noqa: F401
from app.services.tools import (
    aggregate_transactions,
    count_todos,
    get_current_date,
    list_todos,
    list_transactions,
)


class ToolsTestCase(unittest.TestCase):
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

        with self.session_factory() as s:
            s.add_all(
                [
                    User(id="u1", supabase_user_id="su1", email="u1@x.com"),
                    User(id="u2", supabase_user_id="su2", email="u2@x.com"),
                ]
            )
            s.commit()
            s.add_all(
                [
                    Transaction(
                        user_id="u1",
                        type="expense",
                        amount=Decimal("12.50"),
                        category="food",
                        description="coffee",
                        date=date(2026, 5, 23),
                    ),
                    Transaction(
                        user_id="u1",
                        type="expense",
                        amount=Decimal("4.00"),
                        category="food",
                        description="bagel",
                        date=date(2026, 5, 22),
                    ),
                    Transaction(
                        user_id="u1",
                        type="income",
                        amount=Decimal("100.00"),
                        category="freelance",
                        description=None,
                        date=date(2026, 5, 20),
                    ),
                    Transaction(
                        user_id="u2",
                        type="expense",
                        amount=Decimal("999.00"),
                        category="food",
                        description="other user's row",
                        date=date(2026, 5, 23),
                    ),
                    Todo(
                        user_id="u1",
                        title="buy milk",
                        priority="medium",
                        date=date(2026, 5, 23),
                        is_done=False,
                        due_date=date(2026, 5, 30),
                    ),
                    Todo(
                        user_id="u1",
                        title="taxes",
                        priority="high",
                        date=date(2026, 5, 20),
                        is_done=True,
                        due_date=None,
                    ),
                    Todo(
                        user_id="u2",
                        title="other",
                        priority="low",
                        date=date(2026, 5, 23),
                        is_done=False,
                        due_date=None,
                    ),
                ]
            )
            s.commit()

    def tearDown(self) -> None:
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_list_transactions_scopes_by_user(self) -> None:
        with self.session_factory() as s:
            out = list_transactions(s, "u1")
        self.assertEqual(len(out["result"]["items"]), 3)
        self.assertTrue(all(item["amount"] != 999.0 for item in out["result"]["items"]))

    def test_list_transactions_filters_by_type_and_category(self) -> None:
        with self.session_factory() as s:
            out = list_transactions(s, "u1", type="expense", category="food")
        items = out["result"]["items"]
        self.assertEqual(len(items), 2)
        self.assertEqual({i["description"] for i in items}, {"coffee", "bagel"})

    def test_aggregate_transactions_sum_no_group(self) -> None:
        with self.session_factory() as s:
            out = aggregate_transactions(s, "u1", metric="sum", type="expense")
        self.assertEqual(out["result"]["value"], 16.5)

    def test_aggregate_transactions_group_by_category(self) -> None:
        with self.session_factory() as s:
            out = aggregate_transactions(
                s, "u1", metric="sum", group_by="category", type="expense"
            )
        groups = {row["group"]: row["value"] for row in out["result"]["items"]}
        self.assertEqual(groups, {"food": 16.5})

    def test_aggregate_transactions_rejects_invalid_metric(self) -> None:
        with self.session_factory() as s:
            out = aggregate_transactions(s, "u1", metric="median")  # type: ignore[arg-type]
        self.assertIn("error", out["result"])

    def test_list_todos_filters_and_scopes(self) -> None:
        with self.session_factory() as s:
            out = list_todos(s, "u1", is_done=False)
        items = out["result"]["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "buy milk")

    def test_count_todos(self) -> None:
        with self.session_factory() as s:
            self.assertEqual(count_todos(s, "u1")["result"]["count"], 2)
            self.assertEqual(
                count_todos(s, "u1", is_done=True)["result"]["count"], 1
            )
            self.assertEqual(count_todos(s, "u2")["result"]["count"], 1)

    def test_get_current_date(self) -> None:
        with self.session_factory() as s:
            out = get_current_date(s, "u1")
        self.assertIn("date", out["result"])
