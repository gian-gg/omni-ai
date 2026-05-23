from __future__ import annotations

from datetime import date as _date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.todo import Todo
from app.v1.schemas import TodoData, TodoUpdateRequest


def create_todo(
    db_session: Session,
    user_id: str,
    payload: TodoData,
) -> Todo:
    todo = Todo(
        user_id=user_id,
        title=payload.title,
        description=payload.description,
        due_date=payload.due_date,
        priority=payload.priority,
        date=payload.date or _date.today(),
        is_done=False,
    )
    db_session.add(todo)
    db_session.commit()
    db_session.refresh(todo)
    return todo


def list_todos(
    db_session: Session,
    user_id: str,
    limit: int,
    offset: int,
) -> tuple[list[Todo], int]:
    total = db_session.scalar(
        select(func.count()).select_from(Todo).where(Todo.user_id == user_id)
    )
    items = list(
        db_session.scalars(
            select(Todo)
            .where(Todo.user_id == user_id)
            .order_by(
                Todo.is_done.asc(),
                Todo.due_date.asc().nullslast(),
                Todo.created_at.desc(),
            )
            .limit(limit)
            .offset(offset)
        )
    )
    return items, int(total or 0)


def get_todo(
    db_session: Session,
    user_id: str,
    todo_id: str,
) -> Todo | None:
    return db_session.scalar(
        select(Todo).where(Todo.id == todo_id, Todo.user_id == user_id)
    )


def update_todo(
    db_session: Session,
    user_id: str,
    todo_id: str,
    payload: TodoUpdateRequest,
) -> Todo | None:
    todo = get_todo(db_session, user_id, todo_id)
    if todo is None:
        return None

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(todo, field, value)

    db_session.commit()
    db_session.refresh(todo)
    return todo


def complete_todo(
    db_session: Session,
    user_id: str,
    todo_id: str,
) -> Todo | None:
    todo = get_todo(db_session, user_id, todo_id)
    if todo is None:
        return None

    todo.is_done = True
    db_session.commit()
    db_session.refresh(todo)
    return todo


def delete_todo(
    db_session: Session,
    user_id: str,
    todo_id: str,
) -> bool:
    todo = get_todo(db_session, user_id, todo_id)
    if todo is None:
        return False

    db_session.delete(todo)
    db_session.commit()
    return True
