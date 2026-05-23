from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import bindparam, text

from app.db.session import get_session_factory
from app.graph.state import OrchestratorState
from app.services.embeddings import embed

logger = logging.getLogger(__name__)


TOP_K = 3
SIMILARITY_THRESHOLD = 0.65
CONTENT_CAP_CHARS = 500


def _empty_result() -> dict[str, Any]:
    return {"notes_context": [], "sources": []}


def retrieve_node(state: OrchestratorState) -> dict[str, Any]:
    user_id = state.get("user_id")
    if not user_id:
        return _empty_result()

    query_vector = embed(state["user_input"], task_type="RETRIEVAL_QUERY")
    if query_vector is None:
        return _empty_result()

    sql = text(
        """
        SELECT
            id,
            title,
            content,
            date,
            1 - (embedding <=> CAST(:query_vector AS vector)) AS similarity
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

    session = get_session_factory()()
    try:
        rows = session.execute(
            sql,
            {"query_vector": query_vector, "user_id": user_id, "limit": TOP_K},
        ).all()
    except Exception:
        logger.exception("Notes retrieval failed; falling back to no context.")
        return _empty_result()
    finally:
        session.close()

    notes_context: list[dict[str, Any]] = []
    sources: list[dict[str, Any]] = []
    for row in rows:
        similarity = float(row.similarity)
        if similarity < SIMILARITY_THRESHOLD:
            continue
        content = (row.content or "")[:CONTENT_CAP_CHARS]
        notes_context.append(
            {
                "id": row.id,
                "title": row.title,
                "content": content,
                "date": row.date.isoformat() if row.date else None,
                "similarity": similarity,
            }
        )
        sources.append(
            {
                "id": row.id,
                "title": row.title,
                "similarity": similarity,
            }
        )

    return {"notes_context": notes_context, "sources": sources}
