from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.db.session import get_db_session
from app.services import notes as service
from app.services.notes import EmbeddingUnavailableError
from app.v1.schemas import (
    NoteData,
    NoteListResponse,
    NoteResponse,
    NoteSearchRequest,
    NoteSearchResponse,
    NoteSearchResult,
    NoteUpdateRequest,
)

router = APIRouter(prefix="/notes")


_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Note not found.",
)


@router.post(
    "",
    response_model=NoteResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a note",
)
def create(
    payload: NoteData,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> NoteResponse:
    note = service.create_note(db_session, authenticated_user.user.id, payload)
    return NoteResponse.model_validate(note)


@router.get(
    "",
    response_model=NoteListResponse,
    summary="List notes",
)
def list_(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> NoteListResponse:
    items, total = service.list_notes(
        db_session, authenticated_user.user.id, limit, offset
    )
    return NoteListResponse(
        items=[NoteResponse.model_validate(i) for i in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{note_id}",
    response_model=NoteResponse,
    summary="Get a note",
)
def get(
    note_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> NoteResponse:
    note = service.get_note(db_session, authenticated_user.user.id, note_id)
    if note is None:
        raise _NOT_FOUND
    return NoteResponse.model_validate(note)


@router.patch(
    "/{note_id}",
    response_model=NoteResponse,
    summary="Update a note",
)
def update(
    note_id: str,
    payload: NoteUpdateRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> NoteResponse:
    note = service.update_note(
        db_session, authenticated_user.user.id, note_id, payload
    )
    if note is None:
        raise _NOT_FOUND
    return NoteResponse.model_validate(note)


@router.delete(
    "/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a note",
)
def delete(
    note_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    deleted = service.delete_note(db_session, authenticated_user.user.id, note_id)
    if not deleted:
        raise _NOT_FOUND
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/search",
    response_model=NoteSearchResponse,
    summary="Semantic search across notes",
)
def search(
    payload: NoteSearchRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> NoteSearchResponse:
    try:
        matches = service.search_notes(
            db_session,
            authenticated_user.user.id,
            payload.query,
            payload.limit,
        )
    except EmbeddingUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Embedding service is unavailable.",
        ) from error

    items = [
        NoteSearchResult.model_validate({
            **NoteResponse.model_validate(note).model_dump(),
            "similarity": similarity,
        })
        for note, similarity in matches
    ]
    return NoteSearchResponse(items=items)
