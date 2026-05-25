"""add user preference columns

Revision ID: 0006_user_preferences
Revises: 0005_create_conversations
Create Date: 2026-05-25 15:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0006_user_preferences"
down_revision = "0005_create_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users", sa.Column("display_name", sa.String(length=120), nullable=True)
    )
    op.add_column(
        "users", sa.Column("currency", sa.String(length=3), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("users", "currency")
    op.drop_column("users", "display_name")
