"""drop currency column from transactions

Revision ID: 0007_drop_transaction_currency
Revises: 0006_user_preferences
Create Date: 2026-05-25 16:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0007_drop_transaction_currency"
down_revision = "0006_user_preferences"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("transactions", "currency")


def downgrade() -> None:
    op.add_column(
        "transactions",
        sa.Column(
            "currency",
            sa.String(length=3),
            nullable=False,
            server_default="USD",
        ),
    )
