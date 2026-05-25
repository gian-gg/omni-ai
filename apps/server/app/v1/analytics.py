from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.db.session import get_db_session
from app.services import analytics as service
from app.v1.schemas import (
    AnalyticsOverviewResponse,
    FinanceAnalyticsResponse,
    NotesAnalyticsResponse,
    TodosAnalyticsResponse,
)

router = APIRouter(prefix="/analytics")


@router.get(
    "/finance",
    response_model=FinanceAnalyticsResponse,
    summary="Finance summary: income, expense, net, and breakdowns",
)
def finance(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
    from_date: Annotated[str | None, Query()] = None,
    to_date: Annotated[str | None, Query()] = None,
) -> FinanceAnalyticsResponse:
    summary = service.finance_summary(
        db_session,
        authenticated_user.user.id,
        from_date=from_date,
        to_date=to_date,
    )
    return FinanceAnalyticsResponse(
        income=summary.income,
        expense=summary.expense,
        net=summary.net,
        transaction_count=summary.transaction_count,
        by_category=summary.by_category,
        by_type=summary.by_type,
    )


@router.get(
    "/todos",
    response_model=TodosAnalyticsResponse,
    summary="Todos summary: total, open, done, overdue, by priority",
)
def todos(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TodosAnalyticsResponse:
    summary = service.todos_summary(db_session, authenticated_user.user.id)
    return TodosAnalyticsResponse(
        total=summary.total,
        open=summary.open,
        done=summary.done,
        overdue=summary.overdue,
        by_priority=summary.by_priority,
    )


@router.get(
    "/notes",
    response_model=NotesAnalyticsResponse,
    summary="Notes summary: total, recent count, top tags",
)
def notes(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> NotesAnalyticsResponse:
    summary = service.notes_summary(db_session, authenticated_user.user.id)
    return NotesAnalyticsResponse(
        total=summary.total,
        recent=summary.recent,
        top_tags=summary.top_tags,
    )


@router.get(
    "/overview",
    response_model=AnalyticsOverviewResponse,
    summary="High-level numbers across finance, todos, and notes",
)
def overview(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AnalyticsOverviewResponse:
    result = service.overview(db_session, authenticated_user.user.id)
    return AnalyticsOverviewResponse(
        net_balance=result.net_balance,
        transaction_count=result.transaction_count,
        open_todos=result.open_todos,
        overdue_todos=result.overdue_todos,
        total_notes=result.total_notes,
    )
