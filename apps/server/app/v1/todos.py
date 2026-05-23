from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.db.session import get_db_session
from app.services import todos as service
from app.v1.schemas import (
    TodoData,
    TodoListResponse,
    TodoResponse,
    TodoUpdateRequest,
)

router = APIRouter(prefix="/todos")


_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Todo not found.",
)


@router.post(
    "",
    response_model=TodoResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a todo",
)
def create(
    payload: TodoData,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TodoResponse:
    todo = service.create_todo(db_session, authenticated_user.user.id, payload)
    return TodoResponse.model_validate(todo)


@router.get(
    "",
    response_model=TodoListResponse,
    summary="List todos",
)
def list_(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TodoListResponse:
    items, total = service.list_todos(
        db_session, authenticated_user.user.id, limit, offset
    )
    return TodoListResponse(
        items=[TodoResponse.model_validate(i) for i in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{todo_id}",
    response_model=TodoResponse,
    summary="Get a todo",
)
def get(
    todo_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TodoResponse:
    todo = service.get_todo(db_session, authenticated_user.user.id, todo_id)
    if todo is None:
        raise _NOT_FOUND
    return TodoResponse.model_validate(todo)


@router.patch(
    "/{todo_id}",
    response_model=TodoResponse,
    summary="Update a todo",
)
def update(
    todo_id: str,
    payload: TodoUpdateRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TodoResponse:
    todo = service.update_todo(
        db_session, authenticated_user.user.id, todo_id, payload
    )
    if todo is None:
        raise _NOT_FOUND
    return TodoResponse.model_validate(todo)


@router.post(
    "/{todo_id}/complete",
    response_model=TodoResponse,
    summary="Mark a todo as done",
)
def complete(
    todo_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TodoResponse:
    todo = service.complete_todo(db_session, authenticated_user.user.id, todo_id)
    if todo is None:
        raise _NOT_FOUND
    return TodoResponse.model_validate(todo)


@router.delete(
    "/{todo_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a todo",
)
def delete(
    todo_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    deleted = service.delete_todo(db_session, authenticated_user.user.id, todo_id)
    if not deleted:
        raise _NOT_FOUND
    return Response(status_code=status.HTTP_204_NO_CONTENT)
