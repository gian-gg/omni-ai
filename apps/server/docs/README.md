# Omni Backend Documentation

This directory contains architectural and operational documentation for the Omni backend service.

These documents explain **why** the system is built the way it is. Implementation details live in the code under `apps/server/app`, including the versioned FastAPI routes and the LangGraph orchestration runtime.

## Contents

- `architecture.md` — High-level system architecture and principles.
- `auth.md` — Auth endpoints, session handling, refresh flow, and required environment variables.

## API Surface (`/api/v1`)

Mounted in `app/v1/router.py`.

- `health` — Liveness probe.
- `auth` — Supabase-backed signup, login, refresh, and `me`. The backend proxies Supabase Auth so the client only talks to one base URL.
- `chat` — Single entrypoint into the orchestrator. Returns the classified intent, the reply, an optional typed `data` payload, optional approve / cancel response strings, token usage, completion datetime, retrieved note `sources`, and any `tool_calls` made.
- `transactions` — CRUD for finance entries.
- `todos` — CRUD for task items.
- `notes` — CRUD for free-form notes. Inserts and updates trigger a Gemini embedding write into `pgvector` for RAG retrieval during chat.

All non-auth, non-health routes require a Supabase access token via `Authorization: Bearer <token>`.

## Orchestration Graph

LangGraph nodes under `app/graph/nodes`:

- `classify` — Routes the prompt to `finance`, `todo`, `note`, or `chat`.
- `extract` — Produces the typed payload (`FinanceData`, `TodoData`, `NoteData`) for the non-chat intents.
- `retrieve` — Pulls top-k note matches from `pgvector` for intents that benefit from prior context.
- `query` — Executes gated read-only tools against the authenticated user's transactions, todos, and notes when the chat intent calls for it.
- `chat_reply` — Generates the final user-facing response, grounded in retrieved notes and tool results, and emits the approve / cancel response strings.

Shared graph state is defined in `app/graph/state.py`. Domain helpers (embeddings, tools, per-domain queries, the Supabase auth proxy) live under `app/services/`. ORM models are under `app/models/`, with Alembic migrations under `apps/server/alembic/`.

## LLM and Embeddings

- Chat completions go through the DeepSeek API using the OpenAI chat-completions format (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`).
- Embeddings go through Gemini (`GEMINI_API_KEY`, `GEMINI_EMBEDDING_MODEL`).

See `app/core/config.py` for the full list of settings.
