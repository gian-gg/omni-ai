from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any, TypeGuard

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

# Reasoning models (e.g. deepseek-v4-flash) usually emit their chain-of-thought
# on a separate `reasoning_content` channel, which we ignore. But under
# json_object mode they sometimes bleed that thinking into the main `content`
# channel, delimited by a special end-of-thinking token, and fence the real
# answer. These helpers recover just the answer so reasoning never reaches a
# user or breaks JSON parsing.
#
# Both the fullwidth token DeepSeek actually emits and a plain-ASCII variant are
# matched, plus generic <think>...</think> blocks.
_THINKING_MARKERS = ("<｜end▁of▁thinking｜>", "<|end_of_thinking|>")
_THINK_TAG_RE = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)


def strip_reasoning(text: str) -> str:
    """Drop leaked chain-of-thought, keeping only the final answer.

    Removes <think>…</think> blocks and, if a thinking delimiter is present,
    everything up to and including the last one (the answer always follows it).
    """
    cleaned = _THINK_TAG_RE.sub("", text)
    cut_at = -1
    cut_len = 0
    for marker in _THINKING_MARKERS:
        idx = cleaned.rfind(marker)
        if idx > cut_at:
            cut_at, cut_len = idx, len(marker)
    if cut_at != -1:
        cleaned = cleaned[cut_at + cut_len :]
    return cleaned.strip()


def _unwrap_code_fence(text: str) -> str:
    """Strip a leading ```/```json fence and its closing ``` if present."""
    stripped = text.strip()
    if not stripped.startswith("```"):
        return stripped
    newline = stripped.find("\n")
    inner = stripped[newline + 1 :] if newline != -1 else ""
    fence_close = inner.rfind("```")
    if fence_close != -1:
        inner = inner[:fence_close]
    return inner.strip()


def _loads_object(text: str) -> object:
    """Parse JSON, falling back to the outermost {...} substring."""
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except json.JSONDecodeError:
        return None


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
    stripped = strip_reasoning(content)
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
        "max_tokens": settings.llm_max_tokens,
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


@dataclass(frozen=True)
class LLMStreamEvent:
    """One step of a streamed completion.

    `delta` carries incremental text (empty on the terminal event). `done` marks
    the final event, at which point `tokens` holds the total usage if the
    provider reported it.
    """

    delta: str = ""
    tokens: int = 0
    done: bool = False


class _StreamSanitizer:
    """Removes thinking-marker tokens from a streamed content channel.

    Markers can straddle delta boundaries, so a tail that could be the start of
    one is held back until the next delta (or the final flush) resolves it.
    """

    _MAX_MARKER = max(len(m) for m in _THINKING_MARKERS)

    def __init__(self) -> None:
        self._buffer = ""

    def feed(self, delta: str) -> str:
        self._buffer += delta
        for marker in _THINKING_MARKERS:
            self._buffer = self._buffer.replace(marker, "")
        hold = self._partial_tail()
        if hold == 0:
            out, self._buffer = self._buffer, ""
            return out
        out, self._buffer = self._buffer[:-hold], self._buffer[-hold:]
        return out

    def flush(self) -> str:
        out, self._buffer = self._buffer, ""
        return out

    def _partial_tail(self) -> int:
        """Longest buffer suffix that is a prefix of some marker."""
        best = 0
        for marker in _THINKING_MARKERS:
            for k in range(min(len(self._buffer), len(marker) - 1), 0, -1):
                if self._buffer.endswith(marker[:k]):
                    best = max(best, k)
                    break
        return best


def _stream_delta(payload: object) -> str | None:
    """Pull the incremental content out of one streamed chunk."""
    if not _is_string_key_dict(payload):
        return None
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not _is_string_key_dict(first):
        return None
    delta = first.get("delta")
    if not _is_string_key_dict(delta):
        return None
    content = delta.get("content")
    return content if isinstance(content, str) else None


def stream_llm(
    system_prompt: str,
    user_input: str,
    *,
    temperature: float = 0.2,
    history: list[dict[str, str]] | None = None,
) -> Iterator[LLMStreamEvent]:
    """Stream a plain-text completion token-by-token.

    Yields zero or more text-bearing events followed by exactly one terminal
    `done` event (carrying total tokens when the provider reports usage). On a
    missing key or transport error, yields only the terminal event so callers can
    fall back to a static reply.
    """
    api_key = settings.llm_api_key
    if not api_key:
        logger.warning("LLM_API_KEY is not configured.")
        yield LLMStreamEvent(done=True)
        return

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
        "max_tokens": settings.llm_max_tokens,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    total_tokens = 0
    sanitizer = _StreamSanitizer()
    try:
        with httpx.Client(timeout=60) as client:
            with client.stream("POST", url, headers=headers, json=payload) as response:
                response.raise_for_status()
                for line in response.iter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if not data or data == "[DONE]":
                        continue
                    try:
                        chunk = json.loads(data)
                    except json.JSONDecodeError:
                        logger.warning("Skipping non-JSON stream chunk: %r", data)
                        continue
                    tokens = _extract_tokens(chunk)
                    if tokens:
                        total_tokens = tokens
                    delta = _stream_delta(chunk)
                    if delta:
                        emit = sanitizer.feed(delta)
                        if emit:
                            yield LLMStreamEvent(delta=emit)
    except httpx.HTTPError:
        logger.exception("Streaming LLM request failed.")

    tail = sanitizer.flush()
    if tail:
        yield LLMStreamEvent(delta=tail)
    yield LLMStreamEvent(tokens=total_tokens, done=True)


def parse_json_object(raw: str) -> dict[str, Any] | None:
    """Parse an LLM JSON reply, tolerating leaked reasoning and code fences."""
    cleaned = _unwrap_code_fence(strip_reasoning(raw))
    parsed = _loads_object(cleaned)
    return parsed if isinstance(parsed, dict) else None
