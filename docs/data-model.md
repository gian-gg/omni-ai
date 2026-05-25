# Data Model

The backend owns its own tables in the Supabase PostgreSQL database via
SQLAlchemy 2 ORM models (`app/models/`) and Alembic migrations
(`apps/server/alembic/`). All app tables share a `Base` plus a `TimestampMixin`
that adds `created_at` / `updated_at` (timezone-aware, server-defaulted to
`now()`).

Identity rows are keyed to Supabase users but stored locally — the backend never
relies on Supabase tables for app data.

## Tables

### `users`

The local mirror of a Supabase identity, bootstrapped on first authenticated
request (`upsert_user_from_claims`).

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String(36)` PK | App-generated UUID. Foreign key target for all other tables. |
| `supabase_user_id` | `String(255)` | Unique, indexed. The Supabase `sub` claim. |
| `email` | `String(320)` nullable | Indexed. |
| `display_name` | `String(120)` nullable | User preference. |
| `currency` | `String(3)` nullable | ISO 4217 display currency; clients format amounts with it. |
| `created_at` / `updated_at` | `DateTime(tz)` | From `TimestampMixin`. |

### `transactions`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String(36)` PK | UUID. |
| `user_id` | `String(36)` FK → `users.id` | `ON DELETE CASCADE`, indexed. |
| `type` | `String(16)` | `income` or `expense`. |
| `amount` | `Numeric(12,2)` | Positive; the sign is carried by `type`. |
| `category` | `String(64)` nullable | |
| `description` | `Text` nullable | |
| `date` | `Date` | Indexed. |

Composite index `ix_transactions_user_id_date` on `(user_id, date)`.

> Note: an early `currency` column on transactions was removed (migration
> `0007_drop_transaction_currency`). Currency now lives once on the user.

### `todos`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String(36)` PK | UUID. |
| `user_id` | `String(36)` FK → `users.id` | Cascade, indexed. |
| `title` | `String(255)` | |
| `description` | `Text` nullable | |
| `due_date` | `Date` nullable | Indexed. |
| `priority` | `String(8)` | `low` \| `medium` \| `high`, default `medium`. |
| `date` | `Date` | When the todo was logged. |
| `is_done` | `Boolean` | Default `false`, indexed. |

Composite index `ix_todos_user_id_is_done_due_date` on
`(user_id, is_done, due_date)`.

### `notes`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String(36)` PK | UUID. |
| `user_id` | `String(36)` FK → `users.id` | Cascade, indexed. |
| `title` | `String(255)` nullable | |
| `content` | `Text` | |
| `tags` | `JSON` (JSONB) | Defaults to `[]`. |
| `date` | `Date` | |
| `embedding` | `Vector(768)` nullable | `pgvector` column for RAG; `NULL` if embedding failed. |

Composite index `ix_notes_user_id_date` on `(user_id, date)`. The migration
enables the `vector` extension (`CREATE EXTENSION IF NOT EXISTS vector`).

The custom `VectorType` (`app/db/types.py`) maps the ORM field to a `pgvector`
column. Inserts/updates trigger a Gemini embedding write; see
[`orchestration.md`](./orchestration.md) for retrieval.

### `conversations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String(36)` PK | UUID. |
| `user_id` | `String(36)` FK → `users.id` | Cascade, indexed. |
| `title` | `String(255)` | Derived from the first prompt (≤ 60 chars, ellipsized). |

Composite index `ix_conversations_user_id_updated_at` on
`(user_id, updated_at)` so the conversation list orders by recent activity.

### `messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | `String(36)` PK | UUID. |
| `conversation_id` | `String(36)` FK → `conversations.id` | Cascade, indexed. |
| `user_id` | `String(36)` FK → `users.id` | Cascade, indexed. |
| `role` | `String(16)` | `user` or `assistant`. |
| `content` | `Text` | The message text (for assistant turns, the final reply). |
| `details` | `JSON` nullable | Assistant turns store `intent`, `complete_response`, `cancelled_response`, `data`, `tokens`, `sources`, `tool_calls` for rehydration. |

Composite index `ix_messages_conversation_id_created_at` on
`(conversation_id, created_at)`.

### `suggestion_caches`

One row per user holding their last-generated prompt suggestions (the chips the
client shows). `user_id` is the primary key.

| Column | Type | Notes |
|--------|------|-------|
| `user_id` | `String(36)` PK FK → `users.id` | Cascade. |
| `prompts` | `JSON` | The cached suggestion strings. |
| `fingerprint` | `String(64)` | Captures the user's data state when built. |
| `generated_at` | `DateTime(tz)` | Bounds staleness. |

Both `fingerprint` and `generated_at` are checked before a cache reuse;
`?refresh=true` forces regeneration.

## Migrations

Linear Alembic history under `apps/server/alembic/versions/`:

| Revision | Adds |
|----------|------|
| `0001_create_users_table` | `users` |
| `0002_create_transactions_table` | `transactions` |
| `0003_create_todos_table` | `todos` |
| `0004_create_notes_table` | `notes` + `vector` extension |
| `0005_create_conversations` | `conversations` + `messages` |
| `0006_user_preferences` | `users.display_name`, `users.currency` |
| `0007_drop_transaction_currency` | drops `transactions.currency` |
| `0008_create_suggestion_caches` | `suggestion_caches` |

Run them with `uv run alembic upgrade head` from `apps/server` (see
[`development.md`](./development.md)). Alembic reads `DATABASE_URL` from the
environment.
