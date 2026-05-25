from __future__ import annotations

import logging
from datetime import date as _date
from decimal import Decimal
from typing import Any, Callable

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.todo import Todo
from app.models.transaction import Transaction

logger = logging.getLogger(__name__)


LIST_HARD_CAP = 50
GROUP_HARD_CAP = 100


def _decimal(value: Any) -> float:
    if isinstance(value, Decimal):
        return float(value)
    if value is None:
        return 0.0
    return float(value)


# ----- Transactions -----------------------------------------------------------


def list_transactions(
    db_session: Session,
    user_id: str,
    *,
    from_date: str | None = None,
    to_date: str | None = None,
    type: str | None = None,  # noqa: A002 — matches public arg name
    category: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    limit = max(1, min(limit, LIST_HARD_CAP))
    stmt = select(Transaction).where(Transaction.user_id == user_id)

    if from_date:
        stmt = stmt.where(Transaction.date >= _date.fromisoformat(from_date))
    if to_date:
        stmt = stmt.where(Transaction.date <= _date.fromisoformat(to_date))
    if type:
        stmt = stmt.where(Transaction.type == type)
    if category:
        stmt = stmt.where(Transaction.category == category)

    stmt = stmt.order_by(Transaction.date.desc(), Transaction.created_at.desc()).limit(limit)
    rows = list(db_session.scalars(stmt))

    items = [
        {
            "id": r.id,
            "type": r.type,
            "amount": _decimal(r.amount),
            "category": r.category,
            "description": r.description,
            "date": r.date.isoformat(),
        }
        for r in rows
    ]
    summary = (
        f"Returned {len(items)} transactions"
        + (f" (type={type})" if type else "")
        + (f" (category={category})" if category else "")
        + (f" from {from_date or 'beginning'} to {to_date or 'today'}.")
    )
    return {"result": {"items": items}, "summary": summary}


def aggregate_transactions(
    db_session: Session,
    user_id: str,
    *,
    metric: str = "sum",
    group_by: str | None = None,
    from_date: str | None = None,
    to_date: str | None = None,
    type: str | None = None,  # noqa: A002
    category: str | None = None,
) -> dict[str, Any]:
    if metric not in {"sum", "count", "avg"}:
        return {
            "result": {"error": f"metric must be sum|count|avg, got {metric!r}"},
            "summary": "Invalid metric.",
        }

    metric_expr = {
        "sum": func.coalesce(func.sum(Transaction.amount), 0),
        "count": func.count(Transaction.id),
        "avg": func.coalesce(func.avg(Transaction.amount), 0),
    }[metric]

    columns: list[Any] = [metric_expr.label("value")]
    group_label: str | None = None

    if group_by == "category":
        columns.insert(0, Transaction.category.label("group"))
        group_label = "category"
    elif group_by == "day":
        columns.insert(0, Transaction.date.label("group"))
        group_label = "day"
    elif group_by == "type":
        columns.insert(0, Transaction.type.label("group"))
        group_label = "type"
    elif group_by is not None:
        return {
            "result": {"error": f"group_by must be category|day|type|null, got {group_by!r}"},
            "summary": "Invalid group_by.",
        }

    stmt = select(*columns).where(Transaction.user_id == user_id)
    if from_date:
        stmt = stmt.where(Transaction.date >= _date.fromisoformat(from_date))
    if to_date:
        stmt = stmt.where(Transaction.date <= _date.fromisoformat(to_date))
    if type:
        stmt = stmt.where(Transaction.type == type)
    if category:
        stmt = stmt.where(Transaction.category == category)

    if group_label:
        group_col = columns[0]
        stmt = stmt.group_by(group_col).order_by(metric_expr.desc()).limit(GROUP_HARD_CAP)

    rows = db_session.execute(stmt).all()

    if group_label is None:
        value = _decimal(rows[0].value) if rows else 0.0
        summary = f"{metric}={value:g} ({type or 'all types'}, {from_date or 'beginning'} → {to_date or 'today'})."
        return {"result": {"value": value}, "summary": summary}

    items = [
        {"group": (r._mapping["group"].isoformat() if hasattr(r._mapping["group"], "isoformat") else r._mapping["group"]), "value": _decimal(r.value)}
        for r in rows
    ]
    summary = f"{metric} grouped by {group_label}: {len(items)} groups."
    return {"result": {"items": items, "group_by": group_label}, "summary": summary}


# ----- Todos ------------------------------------------------------------------


def list_todos(
    db_session: Session,
    user_id: str,
    *,
    is_done: bool | None = None,
    priority: str | None = None,
    due_from: str | None = None,
    due_to: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    limit = max(1, min(limit, LIST_HARD_CAP))
    stmt = select(Todo).where(Todo.user_id == user_id)

    if is_done is not None:
        stmt = stmt.where(Todo.is_done == is_done)
    if priority:
        stmt = stmt.where(Todo.priority == priority)
    if due_from:
        stmt = stmt.where(Todo.due_date >= _date.fromisoformat(due_from))
    if due_to:
        stmt = stmt.where(Todo.due_date <= _date.fromisoformat(due_to))

    stmt = stmt.order_by(
        Todo.is_done.asc(),
        Todo.due_date.asc().nullslast(),
        Todo.created_at.desc(),
    ).limit(limit)
    rows = list(db_session.scalars(stmt))

    items = [
        {
            "id": r.id,
            "title": r.title,
            "description": r.description,
            "due_date": r.due_date.isoformat() if r.due_date else None,
            "priority": r.priority,
            "is_done": r.is_done,
            "date": r.date.isoformat(),
        }
        for r in rows
    ]
    summary = (
        f"Returned {len(items)} todos"
        + (f" (is_done={is_done})" if is_done is not None else "")
        + (f" (priority={priority})" if priority else "")
        + "."
    )
    return {"result": {"items": items}, "summary": summary}


def count_todos(
    db_session: Session,
    user_id: str,
    *,
    is_done: bool | None = None,
    priority: str | None = None,
) -> dict[str, Any]:
    stmt = select(func.count(Todo.id)).where(Todo.user_id == user_id)
    if is_done is not None:
        stmt = stmt.where(Todo.is_done == is_done)
    if priority:
        stmt = stmt.where(Todo.priority == priority)
    count = int(db_session.scalar(stmt) or 0)
    summary = f"Count: {count}" + (f" (is_done={is_done})" if is_done is not None else "") + "."
    return {"result": {"count": count}, "summary": summary}


# ----- Misc -------------------------------------------------------------------


def get_current_date(db_session: Session, user_id: str) -> dict[str, Any]:
    today = _date.today().isoformat()
    return {"result": {"date": today}, "summary": f"Today is {today}."}


# ----- Specs + dispatch -------------------------------------------------------


TOOL_SPECS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_transactions",
            "description": (
                "List the caller's transactions, optionally filtered by date range, "
                "type (income|expense), or category. Use this to inspect specific rows."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "from_date": {"type": "string", "description": "ISO 8601 date (inclusive)"},
                    "to_date": {"type": "string", "description": "ISO 8601 date (inclusive)"},
                    "type": {"type": "string", "enum": ["income", "expense"]},
                    "category": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 20},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "aggregate_transactions",
            "description": (
                "Aggregate the caller's transactions. Use for questions like "
                "'how much did I spend on X', 'what categories do I spend most on'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "metric": {"type": "string", "enum": ["sum", "count", "avg"], "default": "sum"},
                    "group_by": {"type": "string", "enum": ["category", "day", "type"]},
                    "from_date": {"type": "string"},
                    "to_date": {"type": "string"},
                    "type": {"type": "string", "enum": ["income", "expense"]},
                    "category": {"type": "string"},
                },
                "required": ["metric"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "list_todos",
            "description": (
                "List the caller's todos, optionally filtered by completion, priority, or due date."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "is_done": {"type": "boolean"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                    "due_from": {"type": "string"},
                    "due_to": {"type": "string"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50, "default": 20},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "count_todos",
            "description": "Count the caller's todos, optionally filtered.",
            "parameters": {
                "type": "object",
                "properties": {
                    "is_done": {"type": "boolean"},
                    "priority": {"type": "string", "enum": ["low", "medium", "high"]},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_current_date",
            "description": "Returns today's date so you can resolve relative time phrases.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


ToolExecutor = Callable[..., dict[str, Any]]

TOOL_EXECUTORS: dict[str, ToolExecutor] = {
    "list_transactions": list_transactions,
    "aggregate_transactions": aggregate_transactions,
    "list_todos": list_todos,
    "count_todos": count_todos,
    "get_current_date": get_current_date,
}


__all__ = [
    "TOOL_SPECS",
    "TOOL_EXECUTORS",
    "list_transactions",
    "aggregate_transactions",
    "list_todos",
    "count_todos",
    "get_current_date",
]
