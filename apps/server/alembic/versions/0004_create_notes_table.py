"""create notes table

Revision ID: 0004_create_notes_table
Revises: 0003_create_todos_table
Create Date: 2026-05-23 18:00:00
"""

from __future__ import annotations

from alembic import op
from pgvector.sqlalchemy import Vector
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0004_create_notes_table"
down_revision = "0003_create_todos_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "notes",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("user_id", sa.String(length=36), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags", JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("embedding", Vector(768), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notes")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_notes_user_id_users"),
            ondelete="CASCADE",
        ),
    )
    op.create_index(op.f("ix_notes_user_id"), "notes", ["user_id"], unique=False)
    op.create_index("ix_notes_user_id_date", "notes", ["user_id", "date"], unique=False)

    # HNSW index for cosine similarity search on the embedding column.
    op.execute(
        "CREATE INDEX ix_notes_embedding_hnsw "
        "ON notes USING hnsw (embedding vector_cosine_ops)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_notes_embedding_hnsw")
    op.drop_index("ix_notes_user_id_date", table_name="notes")
    op.drop_index(op.f("ix_notes_user_id"), table_name="notes")
    op.drop_table("notes")
