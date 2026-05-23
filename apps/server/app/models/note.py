from __future__ import annotations

from datetime import date as _date
from uuid import uuid4

from sqlalchemy import JSON, Date, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin
from app.db.types import VectorType


class Note(TimestampMixin, Base):
    __tablename__ = "notes"

    id: Mapped[str] = mapped_column(
        String(36),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    user_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags: Mapped[list[str]] = mapped_column(
        JSON,
        nullable=False,
        default=list,
    )
    date: Mapped[_date] = mapped_column(Date, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(
        VectorType(768), nullable=True
    )

    __table_args__ = (
        Index("ix_notes_user_id_date", "user_id", "date"),
    )
