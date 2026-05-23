from __future__ import annotations

from datetime import date as _date

from sqlalchemy import bindparam, func, select, text
from sqlalchemy.orm import Session

from app.models.note import Note
from app.services.embeddings import embed, embed_note_text
from app.v1.schemas import NoteData, NoteUpdateRequest


class EmbeddingUnavailableError(RuntimeError):
    """Raised when an embedding is required (e.g. for search) but cannot be produced."""


def _refresh_embedding(db_session: Session, note: Note) -> None:
    vector = embed(
        embed_note_text(note.title, note.content),
        task_type="RETRIEVAL_DOCUMENT",
    )
    if vector is None:
        return
    note.embedding = vector
    db_session.commit()
    db_session.refresh(note)


def create_note(
    db_session: Session,
    user_id: str,
    payload: NoteData,
) -> Note:
    note = Note(
        user_id=user_id,
        title=payload.title,
        content=payload.content,
        tags=list(payload.tags),
        date=payload.date or _date.today(),
    )
    db_session.add(note)
    db_session.commit()
    db_session.refresh(note)

    _refresh_embedding(db_session, note)
    return note


def list_notes(
    db_session: Session,
    user_id: str,
    limit: int,
    offset: int,
) -> tuple[list[Note], int]:
    total = db_session.scalar(
        select(func.count()).select_from(Note).where(Note.user_id == user_id)
    )
    items = list(
        db_session.scalars(
            select(Note)
            .where(Note.user_id == user_id)
            .order_by(Note.date.desc(), Note.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return items, int(total or 0)


def get_note(
    db_session: Session,
    user_id: str,
    note_id: str,
) -> Note | None:
    return db_session.scalar(
        select(Note).where(Note.id == note_id, Note.user_id == user_id)
    )


def update_note(
    db_session: Session,
    user_id: str,
    note_id: str,
    payload: NoteUpdateRequest,
) -> Note | None:
    note = get_note(db_session, user_id, note_id)
    if note is None:
        return None

    updates = payload.model_dump(exclude_unset=True)
    text_changed = "title" in updates or "content" in updates
    for field, value in updates.items():
        setattr(note, field, value)

    db_session.commit()
    db_session.refresh(note)

    if text_changed:
        _refresh_embedding(db_session, note)
    return note


def delete_note(
    db_session: Session,
    user_id: str,
    note_id: str,
) -> bool:
    note = get_note(db_session, user_id, note_id)
    if note is None:
        return False
    db_session.delete(note)
    db_session.commit()
    return True


def search_notes(
    db_session: Session,
    user_id: str,
    query: str,
    limit: int,
) -> list[tuple[Note, float]]:
    query_vector = embed(query, task_type="RETRIEVAL_QUERY")
    if query_vector is None:
        raise EmbeddingUnavailableError("Could not generate query embedding.")

    # Use raw SQL with pgvector's cosine distance operator (<=>).
    # similarity = 1 - cosine_distance, ordered by closeness ascending.
    sql = text(
        """
        SELECT id, 1 - (embedding <=> CAST(:query_vector AS vector)) AS similarity
        FROM notes
        WHERE user_id = :user_id AND embedding IS NOT NULL
        ORDER BY embedding <=> CAST(:query_vector AS vector) ASC
        LIMIT :limit
        """
    ).bindparams(
        bindparam("query_vector"),
        bindparam("user_id"),
        bindparam("limit"),
    )
    rows = db_session.execute(
        sql,
        {"query_vector": query_vector, "user_id": user_id, "limit": limit},
    ).all()
    if not rows:
        return []

    id_to_similarity = {row.id: float(row.similarity) for row in rows}
    notes = list(
        db_session.scalars(
            select(Note).where(Note.id.in_(list(id_to_similarity.keys())))
        )
    )
    notes.sort(key=lambda n: id_to_similarity[n.id], reverse=True)
    return [(note, id_to_similarity[note.id]) for note in notes]
