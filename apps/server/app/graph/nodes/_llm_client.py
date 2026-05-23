from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any, TypeGuard

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMCallResult:
    content: str | None
    tokens: int = 0


def _is_string_key_dict(value: object) -> TypeGuard[dict[str, object]]:
    return isinstance(value, dict) and all(isinstance(key, str) for key in value)


def _extract_content(payload: object) -> str | None:
    if not _is_string_key_dict(payload):
        return None
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not _is_string_key_dict(first):
        return None
    message = first.get("message")
    if not _is_string_key_dict(message):
        return None
    content = message.get("content")
    if not isinstance(content, str):
        return None
    stripped = content.strip()
    return stripped or None


def _extract_tokens(payload: object) -> int:
    if not _is_string_key_dict(payload):
        return 0
    usage = payload.get("usage")
    if not _is_string_key_dict(usage):
        return 0
    total = usage.get("total_tokens")
    if isinstance(total, int):
        return total
    prompt = usage.get("prompt_tokens")
    completion = usage.get("completion_tokens")
    if isinstance(prompt, int) and isinstance(completion, int):
        return prompt + completion
    return 0


def call_llm(
    system_prompt: str,
    user_input: str,
    *,
    json_mode: bool = False,
    temperature: float = 0.2,
) -> LLMCallResult:
    """Call the configured LLM. Returns content + token usage; content is None on failure."""
    api_key = settings.llm_api_key
    if not api_key:
        logger.warning("LLM_API_KEY is not configured.")
        return LLMCallResult(content=None)

    url = f"{settings.llm_base_url.rstrip('/')}/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload: dict[str, object] = {
        "model": settings.llm_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_input},
        ],
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            response_data = response.json()
    except httpx.HTTPError:
        logger.exception("LLM request failed.")
        return LLMCallResult(content=None)
    except ValueError:
        logger.exception("LLM response could not be decoded as JSON.")
        return LLMCallResult(content=None)

    return LLMCallResult(
        content=_extract_content(response_data),
        tokens=_extract_tokens(response_data),
    )


def parse_json_object(raw: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
