from __future__ import annotations

from typing import Any


def format_tool_context(tool_calls: list[dict[str, Any]] | None) -> str:
    """Render executed tool calls as a system-prompt block.

    Returns "" when there are no calls so callers can safely prepend.
    """
    if not tool_calls:
        return ""

    lines = ["## Recent context from your data", ""]
    for call in tool_calls:
        name = call.get("name") or "unknown"
        args = call.get("args") or {}
        args_repr = ", ".join(f"{k}={v!r}" for k, v in args.items())
        summary = (call.get("summary") or "").strip()
        lines.append(f"- `{name}({args_repr})` → {summary}")
    lines.append("")
    lines.append(
        "Use these tool results to ground your answer in the user's actual data. "
        "Cite specific numbers when relevant."
    )
    lines.append("")
    return "\n".join(lines)
