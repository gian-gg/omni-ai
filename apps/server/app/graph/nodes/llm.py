from __future__ import annotations

import logging
from typing import TypeGuard

import httpx

from app.core.config import settings
from app.graph.state import OrchestratorState

logger = logging.getLogger(__name__)


def _fallback_response(user_input: str) -> dict[str, str]:
    return {"response": f"(LLM unavailable) You said: {user_input}"}


def _is_string_key_dict(value: object) -> TypeGuard[dict[str, object]]:
    return isinstance(value, dict) and all(isinstance(key, str) for key in value)


def _parse_content(data: dict[str, object]) -> str | None:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    first_choice = choices[0]
    if not _is_string_key_dict(first_choice):
        return None

    message = first_choice.get("message")
    if not _is_string_key_dict(message):
        return None

    content = message.get("content")
    if not isinstance(content, str):
        return None

    stripped_content = content.strip()
    if not stripped_content:
        return None

    return stripped_content


def llm_node(state: OrchestratorState) -> dict[str, str]:
    user_input = state["user_input"].strip()
    api_key = settings.llm_api_key
    if not api_key:
        logger.warning("LLM_API_KEY is not configured.")
        return _fallback_response(user_input)

    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if settings.llm_site_url:
        headers["HTTP-Referer"] = settings.llm_site_url
    if settings.llm_app_title:
        headers["X-OpenRouter-Title"] = settings.llm_app_title

    payload: dict[str, object] = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": settings.system_prompt},
            {"role": "user", "content": user_input},
        ],
        "temperature": 0.2,
    }

    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            response_data = response.json()
    except httpx.HTTPError:
        logger.exception("LLM request failed.")
        return _fallback_response(user_input)

    if not _is_string_key_dict(response_data):
        logger.error("LLM response payload is not a dict.")
        return _fallback_response(user_input)

    content = _parse_content(response_data)
    if content is None:
        logger.error("LLM response payload did not include valid content.")
        return _fallback_response(user_input)

    return {"response": content}
