from __future__ import annotations

from datetime import date as _date
from uuid import uuid4

from sqlalchemy import Boolean, Date, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin


class Todo(TimestampMixin, Base):
    __tablename__ = "todos"

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
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[_date | None] = mapped_column(Date, nullable=True, index=True)
    priority: Mapped[str] = mapped_column(String(8), nullable=False, default="medium")
    date: Mapped[_date] = mapped_column(Date, nullable=False)
    is_done: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, index=True
    )

    __table_args__ = (
        Index("ix_todos_user_id_is_done_due_date", "user_id", "is_done", "due_date"),
    )
