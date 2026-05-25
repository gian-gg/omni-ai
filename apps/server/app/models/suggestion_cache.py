from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class SuggestionCache(TimestampMixin, Base):
    """One row per user holding their last-generated prompt suggestions.

    `fingerprint` captures the user's data state when the chips were built;
    `generated_at` bounds staleness. Both are checked before a cache reuse.
    """

    __tablename__ = "suggestion_caches"

    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    prompts: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    fingerprint: Mapped[str] = mapped_column(String(64), nullable=False)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )
