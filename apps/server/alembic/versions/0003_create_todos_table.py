"""create todos table

Revision ID: 0003_create_todos_table
Revises: 0002_create_transactions_table
Create Date: 2026-05-23 17:45:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_create_todos_table"
down_revision = "0002_create_transactions_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "todos",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("priority", sa.String(length=8), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column(
            "is_done",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_todos")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_todos_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(op.f("ix_todos_user_id"), "todos", ["user_id"], unique=False)
    op.create_index(op.f("ix_todos_due_date"), "todos", ["due_date"], unique=False)
    op.create_index(op.f("ix_todos_is_done"), "todos", ["is_done"], unique=False)
    op.create_index(
        "ix_todos_user_id_is_done_due_date",
        "todos",
        ["user_id", "is_done", "due_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_todos_user_id_is_done_due_date", table_name="todos")
    op.drop_index(op.f("ix_todos_is_done"), table_name="todos")
    op.drop_index(op.f("ix_todos_due_date"), table_name="todos")
    op.drop_index(op.f("ix_todos_user_id"), table_name="todos")
    op.drop_table("todos")
