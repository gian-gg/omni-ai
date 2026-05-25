# API Reference

All routes are mounted under **`/api/v1`** (`app/main.py` →
`app/v1/router.py`). Interactive OpenAPI docs are served by FastAPI at
`/docs` (Swagger UI) and `/redoc`.

## Conventions

- **Auth.** Every route except `GET /health` and the auth signup/login/refresh/
  google routes requires a Supabase access token:
  `Authorization: Bearer <access_token>`. Missing/invalid → `401`. See
  [`auth.md`](./auth.md).
- **Ownership.** Authenticated routes are scoped to the caller's user; a row
  owned by someone else returns `404`, not `403`.
- **List pagination.** List endpoints accept `limit` (1–100, default 50) and
  `offset` (≥ 0) query params and return `{ items, total, limit, offset }`.
- **Validation.** Prompts/content are 1–10,000 chars, trimmed, non-empty.

---

## Health

### `GET /health`
Liveness probe. No auth. Returns `{ status, service, env }`.

---

## Auth — `/auth`

Backend-proxied Supabase Auth so the client only talks to one base URL. Full
request/response detail in [`apps/server/docs/auth.md`](../apps/server/docs/auth.md).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/signup` | — | Create a Supabase user (email + password). May return a `user` with null tokens if email confirmation is required. |
| `POST` | `/auth/login` | — | Log in; returns a session (`access_token`, `refresh_token`, `expires_in`, `user`). |
| `GET` | `/auth/google` | — | `307` redirect to Supabase Google OAuth; optional `redirect_to` query. |
| `POST` | `/auth/refresh` | — | Exchange a `refresh_token` for a fresh session. |
| `GET` | `/auth/me` | ✅ | The authenticated local user (`id`, `supabase_user_id`, `email`, `display_name`, `currency`, timestamps). |
| `PATCH` | `/auth/me` | ✅ | Update preferences (`display_name`, `currency`). |

---

## Conversations (chat) — `/conversations`

The chat surface and single entrypoint into the orchestrator. Replies stream
over **Server-Sent Events (SSE)**.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/conversations` | ✅ | Start a conversation and **stream** the first reply (SSE). Body: `{ "prompt": string }`. |
| `GET` | `/conversations` | ✅ | List conversations (paginated), newest activity first. |
| `GET` | `/conversations/{id}/messages` | ✅ | All messages in a conversation, oldest first. `404` if not found. |
| `POST` | `/conversations/{id}/messages` | ✅ | Append a user turn and **stream** the reply (SSE). `404` if not found. |
| `POST` | `/conversations/{id}/messages/append` | ✅ | Persist a single message verbatim — **no** LLM call. Body: `{ role, content }`. `201`. |
| `DELETE` | `/conversations/{id}` | ✅ | Delete a conversation (cascades messages). `204`. |

### SSE event contract

Streaming endpoints respond with `Content-Type: text/event-stream`
(`Cache-Control: no-cache`, `X-Accel-Buffering: no`). Events, in order:

| Event | Data | When |
|-------|------|------|
| `meta` | `{ conversation_id, title }` | First, on `POST /conversations` (so the client learns the new id). |
| `delta` | `{ text }` | Repeated — incremental reply tokens (chat intent only). |
| `message` | the persisted assistant `Message` | Last — the full assistant turn, including `details`. |
| `error` | `{ detail }` | Instead of `message` if the turn fails. |

The user message is committed **before** streaming starts, so it survives a
dropped connection. The assistant `message.details` JSON carries `intent`,
`complete_response`, `cancelled_response`, `data` (typed capture payload or
null), `tokens`, `sources`, and `tool_calls`.

> For a **capture intent** (`finance`/`todo`/`note`), there are no `delta`
> events — the proposal arrives whole in the `message`. To commit it, the client
> calls the matching CRUD endpoint below with `details.data`.

---

## Transactions — `/transactions`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/transactions` | Create (body = `FinanceData`: `type`, `amount`, `category?`, `description?`, `date?`). `201`. |
| `GET` | `/transactions` | List (paginated). |
| `GET` | `/transactions/{id}` | Get one. `404` if not found. |
| `PATCH` | `/transactions/{id}` | Partial update. |
| `DELETE` | `/transactions/{id}` | Delete. `204`. |

---

## Todos — `/todos`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/todos` | Create (body = `TodoData`: `title`, `description?`, `due_date?`, `priority`, `date?`). `201`. |
| `GET` | `/todos` | List (paginated). |
| `GET` | `/todos/{id}` | Get one. |
| `PATCH` | `/todos/{id}` | Partial update. |
| `POST` | `/todos/{id}/complete` | Mark done. |
| `DELETE` | `/todos/{id}` | Delete. `204`. |

---

## Notes — `/notes`

Create and update write a Gemini embedding into the note's `pgvector` column for
RAG retrieval during chat.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/notes` | Create (body = `NoteData`: `title?`, `content`, `tags`, `date?`). `201`. |
| `GET` | `/notes` | List (paginated). |
| `GET` | `/notes/{id}` | Get one. |
| `PATCH` | `/notes/{id}` | Partial update (re-embeds). |
| `DELETE` | `/notes/{id}` | Delete. `204`. |
| `POST` | `/notes/search` | Semantic search. Body: `{ query, limit }`. Returns matches with `similarity`. `503` if the embedding service is unavailable. |

---

## Suggestions — `/suggestions`

### `GET /suggestions`
Cached, data-grounded prompt suggestions (the chips shown in the client).
Returns `{ suggestions, generated_at, cached }`. Pass `?refresh=true` to force
regeneration. Cache lives in `suggestion_caches`, keyed by a data fingerprint +
timestamp.

---

## Analytics — `/analytics`

Read-only summaries for the Spaces dashboards.

| Method | Path | Returns |
|--------|------|---------|
| `GET` | `/analytics/finance` | `income`, `expense`, `net`, `transaction_count`, `by_category`, `by_type`. Optional `from_date` / `to_date` query params. |
| `GET` | `/analytics/todos` | `total`, `open`, `done`, `overdue`, `by_priority`. |
| `GET` | `/analytics/notes` | `total`, `recent`, `top_tags`. |
| `GET` | `/analytics/overview` | `net_balance`, `transaction_count`, `open_todos`, `overdue_todos`, `total_notes`. |
