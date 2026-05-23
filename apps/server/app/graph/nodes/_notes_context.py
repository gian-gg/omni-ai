from __future__ import annotations

from typing import Any


def format_notes_context(notes_context: list[dict[str, Any]] | None) -> str:
    """Render retrieved notes as a system-prompt block.

    Returns "" when there is nothing to inject so callers can safely prepend.
    """
    if not notes_context:
        return ""

    lines = ["## Relevant context from the user's notes", ""]
    for note in notes_context:
        note_id = note.get("id") or ""
        title = (note.get("title") or "Untitled").strip()
        date = note.get("date")
        date_suffix = f" ({date})" if date else ""
        content = (note.get("content") or "").strip()
        lines.append(f"- id=`{note_id}` **{title}**{date_suffix}: {content}")
    lines.append("")
    lines.append(
        "Use a note only when it directly informs the user's current message. "
        "Prefer specific details from notes over generic answers. "
        "In your JSON output, include a `used_source_ids` array listing the `id` "
        "of every note you actually used. If you didn't use any note, return an "
        "empty array."
    )
    lines.append("")
    return "\n".join(lines)
