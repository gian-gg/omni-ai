"""create suggestion_caches table

Revision ID: 0008_create_suggestion_caches
Revises: 0007_drop_transaction_currency
Create Date: 2026-05-25 17:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0008_create_suggestion_caches"
down_revision = "0007_drop_transaction_currency"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "suggestion_caches",
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("prompts", sa.JSON(), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_suggestion_caches_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_suggestion_caches")),
    )


def downgrade() -> None:
    op.drop_table("suggestion_caches")
