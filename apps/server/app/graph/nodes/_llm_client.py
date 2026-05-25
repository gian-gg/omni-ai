from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Any, TypeGuard

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class LLMCallResult:
    content: str | None
    tokens: int = 0
    tool_calls: list[dict[str, Any]] = field(default_factory=list)


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


def _extract_tool_calls(payload: object) -> list[dict[str, Any]]:
    if not _is_string_key_dict(payload):
        return []
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return []
    first = choices[0]
    if not _is_string_key_dict(first):
        return []
    message = first.get("message")
    if not _is_string_key_dict(message):
        return []
    tool_calls = message.get("tool_calls")
    if not isinstance(tool_calls, list):
        return []

    parsed: list[dict[str, Any]] = []
    for call in tool_calls:
        if not _is_string_key_dict(call):
            continue
        fn = call.get("function")
        if not _is_string_key_dict(fn):
            continue
        name = fn.get("name")
        raw_args = fn.get("arguments")
        if not isinstance(name, str):
            continue
        args: dict[str, Any] = {}
        if isinstance(raw_args, str):
            try:
                decoded = json.loads(raw_args)
                if isinstance(decoded, dict):
                    args = decoded
            except json.JSONDecodeError:
                logger.warning("Tool call arguments were not valid JSON: %r", raw_args)
                continue
        elif isinstance(raw_args, dict):
            args = raw_args
        parsed.append(
            {
                "id": call.get("id") if isinstance(call.get("id"), str) else "",
                "name": name,
                "args": args,
            }
        )
    return parsed


_VALID_HISTORY_ROLES = frozenset({"user", "assistant"})


def _history_messages(
    history: list[dict[str, str]] | None,
) -> list[dict[str, str]]:
    if not history:
        return []
    messages: list[dict[str, str]] = []
    for entry in history:
        if not _is_string_key_dict(entry):
            continue
        role = entry.get("role")
        content = entry.get("content")
        if role not in _VALID_HISTORY_ROLES or not isinstance(content, str):
            continue
        messages.append({"role": role, "content": content})
    return messages


def call_llm(
    system_prompt: str,
    user_input: str,
    *,
    json_mode: bool = False,
    temperature: float = 0.2,
    tools: list[dict[str, Any]] | None = None,
    history: list[dict[str, str]] | None = None,
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
            *_history_messages(history),
            {"role": "user", "content": user_input},
        ],
        "temperature": temperature,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"

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
        tool_calls=_extract_tool_calls(response_data),
    )


def parse_json_object(raw: str) -> dict[str, Any] | None:
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None
