from __future__ import annotations

import hashlib
import logging
from dataclasses import dataclass
from datetime import UTC, date as _date, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.graph.nodes._currency_context import format_currency_context
from app.graph.nodes._llm_client import call_llm, parse_json_object
from app.models.note import Note
from app.models.suggestion_cache import SuggestionCache
from app.models.todo import Todo
from app.models.transaction import Transaction
from app.models.user import User
from app.services import tools
from app.services.notes import list_notes

logger = logging.getLogger(__name__)

# Regenerate at least this often even when the user's data is unchanged, so
# relative phrasing ("due this week") doesn't go stale.
SUGGESTIONS_TTL = timedelta(hours=6)
MAX_SUGGESTIONS = 4
MAX_SUGGESTION_LENGTH = 80
_RECENT_NOTES = 5
_OPEN_TODOS = 5

# Used before the user has data, or whenever the LLM is unavailable.
STATIC_FALLBACK: list[str] = [
    "What did I get done this week?",
    "Log a quick expense",
    "Add a reminder for tomorrow",
    "Capture a new note",
]

SUGGESTIONS_SYSTEM_PROMPT = (
    "You generate short prompt chips for Omni, a personal finance/todo/notes "
    "assistant. Using the user's recent activity below, write tappable prompts "
    "the user might want to send next.\n\n"
    "Rules:\n"
    f"- Return {MAX_SUGGESTIONS} or fewer prompts.\n"
    '- Each is first-person, as the user would type it (e.g. "How much did I '
    'spend on food?").\n'
    "- Keep each under 80 characters.\n"
    "- Vary across recall, finance, todos, and notes; ground them in the "
    "activity shown, not generic filler.\n"
    "- If activity is thin, fall back to broadly useful starters.\n\n"
    'Return JSON only: {"suggestions": ["...", "..."]}'
)


@dataclass(frozen=True)
class SuggestionsResult:
    suggestions: list[str]
    generated_at: datetime
    cached: bool


def _compute_fingerprint(db_session: Session, user_id: str) -> str:
    notes_count, notes_latest = db_session.execute(
        select(func.count(Note.id), func.max(Note.updated_at)).where(
            Note.user_id == user_id
        )
    ).one()
    open_todos, todos_latest = db_session.execute(
        select(func.count(Todo.id), func.max(Todo.updated_at)).where(
            Todo.user_id == user_id, Todo.is_done.is_(False)
        )
    ).one()
    txn_count, txn_latest = db_session.execute(
        select(func.count(Transaction.id), func.max(Transaction.date)).where(
            Transaction.user_id == user_id
        )
    ).one()

    raw = "|".join(
        str(part)
        for part in (
            notes_count,
            notes_latest,
            open_todos,
            todos_latest,
            txn_count,
            txn_latest,
        )
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _month_start_iso() -> str:
    return _date.today().replace(day=1).isoformat()


def _build_activity_context(db_session: Session, user_id: str) -> str:
    lines: list[str] = []

    notes, _ = list_notes(db_session, user_id, limit=_RECENT_NOTES, offset=0)
    if notes:
        lines.append("Recent notes:")
        for note in notes:
            title = (note.title or "Untitled").strip()
            tags = ", ".join(note.tags) if note.tags else ""
            tag_suffix = f" [{tags}]" if tags else ""
            lines.append(f"- {title}{tag_suffix}")

    todos = tools.list_todos(db_session, user_id, is_done=False, limit=_OPEN_TODOS)[
        "result"
    ]["items"]
    if todos:
        lines.append("Open todos:")
        for todo in todos:
            due = f" (due {todo['due_date']})" if todo.get("due_date") else ""
            lines.append(f"- {todo['title']}{due}")

    spend = tools.aggregate_transactions(
        db_session,
        user_id,
        metric="sum",
        group_by="category",
        type="expense",
        from_date=_month_start_iso(),
    )["result"].get("items", [])
    if spend:
        top = spend[0]
        lines.append(
            f"Top expense category this month: {top['group']} ({top['value']:g})."
        )

    return "\n".join(lines)


def _clean_suggestions(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    cleaned: list[str] = []
    for item in value:
        if not isinstance(item, str):
            continue
        text = item.strip()
        if not text:
            continue
        cleaned.append(text[:MAX_SUGGESTION_LENGTH])
        if len(cleaned) >= MAX_SUGGESTIONS:
            break
    return cleaned


def _generate(db_session: Session, user: User) -> list[str]:
    activity = _build_activity_context(db_session, user.id)
    if not activity:
        return list(STATIC_FALLBACK)

    currency_block = format_currency_context(user.currency)
    system_prompt = f"{currency_block}{SUGGESTIONS_SYSTEM_PROMPT}"
    result = call_llm(system_prompt, activity, json_mode=True)
    if result.content is None:
        return list(STATIC_FALLBACK)

    parsed = parse_json_object(result.content)
    suggestions = (
        _clean_suggestions(parsed.get("suggestions"))
        if isinstance(parsed, dict)
        else []
    )
    return suggestions or list(STATIC_FALLBACK)


def _persist(
    db_session: Session,
    user_id: str,
    prompts: list[str],
    fingerprint: str,
    generated_at: datetime,
) -> None:
    cache = db_session.get(SuggestionCache, user_id)
    if cache is None:
        db_session.add(
            SuggestionCache(
                user_id=user_id,
                prompts=prompts,
                fingerprint=fingerprint,
                generated_at=generated_at,
            )
        )
    else:
        cache.prompts = prompts
        cache.fingerprint = fingerprint
        cache.generated_at = generated_at
    db_session.commit()


def _is_fresh(cache: SuggestionCache, fingerprint: str, now: datetime) -> bool:
    if cache.fingerprint != fingerprint:
        return False
    generated_at = cache.generated_at
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=UTC)
    return now - generated_at < SUGGESTIONS_TTL


def get_suggestions(
    db_session: Session,
    user: User,
    *,
    force: bool = False,
) -> SuggestionsResult:
    """Return cached chips when fresh, otherwise regenerate via one LLM call."""
    now = datetime.now(UTC)
    fingerprint = _compute_fingerprint(db_session, user.id)

    if not force:
        cache = db_session.get(SuggestionCache, user.id)
        if cache is not None and _is_fresh(cache, fingerprint, now):
            return SuggestionsResult(
                suggestions=list(cache.prompts),
                generated_at=cache.generated_at,
                cached=True,
            )

    prompts = _generate(db_session, user)
    _persist(db_session, user.id, prompts, fingerprint, now)
    return SuggestionsResult(suggestions=prompts, generated_at=now, cached=False)
