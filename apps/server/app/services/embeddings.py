from __future__ import annotations

import logging
from typing import Literal

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


TaskType = Literal["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"]


def embed_note_text(title: str | None, content: str) -> str:
    """Combine title and content into the string to embed.

    Title carries strong topical signal — prepend it so retrieval benefits
    from it even when the query matches the title rather than the body.
    """
    title_clean = (title or "").strip()
    if title_clean:
        return f"{title_clean}\n\n{content.strip()}"
    return content.strip()


def embed(text: str, *, task_type: TaskType) -> list[float] | None:
    """Call Gemini's text-embedding-004 endpoint.

    Returns the 768-element vector, or None if the embedding call fails.
    Callers decide how to handle a None — `create_note` saves without an
    embedding so the row is still usable; search raises an error.
    """
    api_key = settings.gemini_api_key
    if not api_key:
        logger.warning("GEMINI_API_KEY is not configured.")
        return None

    url = (
        f"{settings.gemini_base_url.rstrip('/')}"
        f"/v1beta/models/{settings.gemini_embedding_model}:embedContent"
        f"?key={api_key}"
    )
    payload = {
        "model": f"models/{settings.gemini_embedding_model}",
        "content": {"parts": [{"text": text}]},
        "taskType": task_type,
        "outputDimensionality": 768,
    }

    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
    except httpx.HTTPError:
        logger.exception("Gemini embedding request failed.")
        return None
    except ValueError:
        logger.exception("Gemini embedding response was not JSON.")
        return None

    embedding = data.get("embedding") if isinstance(data, dict) else None
    if not isinstance(embedding, dict):
        logger.error("Gemini embedding payload is missing 'embedding'.")
        return None
    values = embedding.get("values")
    if not isinstance(values, list) or not all(isinstance(v, (int, float)) for v in values):
        logger.error("Gemini embedding payload is missing 'values'.")
        return None
    return [float(v) for v in values]
