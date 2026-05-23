"""create transactions table

Revision ID: 0002_create_transactions_table
Revises: 0001_create_users_table
Create Date: 2026-05-23 17:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_create_transactions_table"
down_revision = "0001_create_users_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "transactions",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("category", sa.String(length=64), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("date", sa.Date(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_transactions")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_transactions_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        op.f("ix_transactions_user_id"),
        "transactions",
        ["user_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_transactions_date"),
        "transactions",
        ["date"],
        unique=False,
    )
    op.create_index(
        "ix_transactions_user_id_date",
        "transactions",
        ["user_id", "date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_transactions_user_id_date", table_name="transactions")
    op.drop_index(op.f("ix_transactions_date"), table_name="transactions")
    op.drop_index(op.f("ix_transactions_user_id"), table_name="transactions")
    op.drop_table("transactions")
