from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date as _date, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.note import Note
from app.models.todo import Todo
from app.services import tools

# Notes within this many days count as "recent" activity.
_RECENT_NOTES_WINDOW = timedelta(days=30)
_TOP_TAGS_LIMIT = 10


@dataclass(frozen=True)
class Breakdown:
    group: str | None
    value: float


@dataclass(frozen=True)
class FinanceSummary:
    income: float
    expense: float
    net: float
    transaction_count: int
    by_category: list[Breakdown] = field(default_factory=list)
    by_type: list[Breakdown] = field(default_factory=list)


@dataclass(frozen=True)
class TagCount:
    tag: str
    count: int


@dataclass(frozen=True)
class TodosSummary:
    total: int
    open: int
    done: int
    overdue: int
    by_priority: list[Breakdown] = field(default_factory=list)


@dataclass(frozen=True)
class NotesSummary:
    total: int
    recent: int
    top_tags: list[TagCount] = field(default_factory=list)


@dataclass(frozen=True)
class Overview:
    net_balance: float
    transaction_count: int
    open_todos: int
    overdue_todos: int
    total_notes: int


def _breakdowns(result: dict[str, Any]) -> list[Breakdown]:
    items = result.get("result", {}).get("items", [])
    return [Breakdown(group=item["group"], value=item["value"]) for item in items]


def _typed_total(db_session: Session, user_id: str, txn_type: str, **kwargs: Any) -> float:
    return float(
        tools.aggregate_transactions(
            db_session, user_id, metric="sum", type=txn_type, **kwargs
        )["result"]["value"]
    )


def _count_overdue_todos(db_session: Session, user_id: str) -> int:
    today = _date.today()
    return int(
        db_session.scalar(
            select(func.count(Todo.id)).where(
                Todo.user_id == user_id,
                Todo.is_done.is_(False),
                Todo.due_date.is_not(None),
                Todo.due_date < today,
            )
        )
        or 0
    )


def finance_summary(
    db_session: Session,
    user_id: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
) -> FinanceSummary:
    date_filters: dict[str, Any] = {"from_date": from_date, "to_date": to_date}

    income = _typed_total(db_session, user_id, "income", **date_filters)
    expense = _typed_total(db_session, user_id, "expense", **date_filters)
    transaction_count = int(
        tools.aggregate_transactions(
            db_session, user_id, metric="count", **date_filters
        )["result"]["value"]
    )

    by_category = _breakdowns(
        tools.aggregate_transactions(
            db_session,
            user_id,
            metric="sum",
            group_by="category",
            type="expense",
            **date_filters,
        )
    )
    by_type = _breakdowns(
        tools.aggregate_transactions(
            db_session, user_id, metric="sum", group_by="type", **date_filters
        )
    )

    return FinanceSummary(
        income=income,
        expense=expense,
        net=round(income - expense, 2),
        transaction_count=transaction_count,
        by_category=by_category,
        by_type=by_type,
    )


def todos_summary(db_session: Session, user_id: str) -> TodosSummary:
    total = tools.count_todos(db_session, user_id)["result"]["count"]
    done = tools.count_todos(db_session, user_id, is_done=True)["result"]["count"]
    open_ = tools.count_todos(db_session, user_id, is_done=False)["result"]["count"]
    overdue = _count_overdue_todos(db_session, user_id)

    by_priority = [
        Breakdown(
            group=priority,
            value=float(
                tools.count_todos(db_session, user_id, priority=priority)["result"][
                    "count"
                ]
            ),
        )
        for priority in ("high", "medium", "low")
    ]

    return TodosSummary(
        total=total,
        open=open_,
        done=done,
        overdue=overdue,
        by_priority=by_priority,
    )


def notes_summary(db_session: Session, user_id: str) -> NotesSummary:
    total = int(
        db_session.scalar(
            select(func.count(Note.id)).where(Note.user_id == user_id)
        )
        or 0
    )

    cutoff = _date.today() - _RECENT_NOTES_WINDOW
    recent = int(
        db_session.scalar(
            select(func.count(Note.id)).where(
                Note.user_id == user_id, Note.date >= cutoff
            )
        )
        or 0
    )

    tag_lists = db_session.scalars(
        select(Note.tags).where(Note.user_id == user_id)
    )
    counter: Counter[str] = Counter()
    for tags in tag_lists:
        if tags:
            counter.update(tag for tag in tags if tag)
    top_tags = [
        TagCount(tag=tag, count=count)
        for tag, count in counter.most_common(_TOP_TAGS_LIMIT)
    ]

    return NotesSummary(total=total, recent=recent, top_tags=top_tags)


def overview(db_session: Session, user_id: str) -> Overview:
    finance = finance_summary(db_session, user_id)
    todos = todos_summary(db_session, user_id)
    notes = notes_summary(db_session, user_id)

    return Overview(
        net_balance=finance.net,
        transaction_count=finance.transaction_count,
        open_todos=todos.open,
        overdue_todos=todos.overdue,
        total_notes=notes.total,
    )
