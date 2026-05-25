# Architecture

## Purpose

The Omni backend is an AI-first API that converts natural-language input into
structured data (transactions, todos, notes) while keeping client logic thin and
schemas safe to evolve.

## Layered design

```txt
┌─────────────────────────────────────────────────────────────┐
│  HTTP boundary — app/v1/                                      │
│  Thin FastAPI routers. Auth dependency, request/response      │
│  schemas, status codes. No business logic.                    │
├─────────────────────────────────────────────────────────────┤
│  Services — app/services/                                     │
│  Business logic & orchestration entrypoints: conversations,   │
│  transactions, todos, notes, analytics, suggestions, tools,   │
│  embeddings, user, supabase_auth, orchestrator.               │
├─────────────────────────────────────────────────────────────┤
│  Orchestration graph — app/graph/                             │
│  LLM-backed workflow nodes (classify, extract, retrieve,      │
│  query, chat_reply) + shared OrchestratorState. No HTTP.      │
├─────────────────────────────────────────────────────────────┤
│  Data — app/models/ + app/db/                                 │
│  SQLAlchemy ORM models, session factory, custom pgvector type.│
│  Alembic owns the schema (apps/server/alembic/).              │
├─────────────────────────────────────────────────────────────┤
│  Core — app/core/                                             │
│  Settings (pydantic-settings), JWT auth verifier, logging.    │
└─────────────────────────────────────────────────────────────┘
```

External dependencies: **Supabase** (Auth + Postgres), **DeepSeek** (chat
completions, OpenAI format), **Gemini** (embeddings).

## Principles

- **Routes are thin.** `app/v1/*` files only wire HTTP → service calls and map
  results to response models. Nothing domain-specific lives there.
- **Business logic lives in services.** Each resource has a service module under
  `app/services/`.
- **Graph nodes are isolated from HTTP.** Nodes take and return plain dicts over
  `OrchestratorState`; they never touch FastAPI types. This keeps them unit
  testable and patchable.
- **Schemas are contracts, not logic.** Pydantic models in `app/v1/schemas.py`
  define the API surface; validation lives there, behavior does not.
- **APIs are versioned.** Everything is mounted under `/api/v1`
  (`app/main.py` → `app/v1/router.py`).
- **The LLM stays out of the write path.** Capture intents propose; the client
  confirms and calls CRUD endpoints explicitly. Tools exposed to the LLM are
  **read-only**.

## Key components

### HTTP boundary (`app/main.py`, `app/v1/`)

`app/main.py` builds the FastAPI app, configures logging, and mounts the v1
router under `/api/v1`. `app/v1/router.py` includes one sub-router per resource:
`health`, `auth`, `conversations`, `transactions`, `todos`, `notes`,
`suggestions`, `analytics`.

### Auth (`app/core/auth.py`)

A `HTTPBearer` dependency verifies the Supabase JWT against the project's JWKS
(supports `RS256`, `ES256`, `EdDSA`), checks issuer/expiry/audience, then
upserts a local `users` row from the token claims. Protected routes depend on
`get_current_authenticated_user`, which yields an `AuthenticatedUser`
(verified claims + the local `User`). See [`auth.md`](./auth.md).

### Orchestration (`app/services/orchestrator.py`, `app/graph/`)

The orchestrator runs `classify → retrieve → query`, branches on intent, and
then either streams a chat reply token-by-token or runs the matching extractor.
It accumulates token usage, resolves note citations, and emits a single terminal
result. Detailed in [`orchestration.md`](./orchestration.md).

### Data (`app/models/`, `app/db/`)

SQLAlchemy 2 models with a `Base` + `TimestampMixin`. `app/db/session.py` owns
the engine/session factory and the `get_db_session` FastAPI dependency.
`app/db/types.py` provides a `VectorType` wrapper so note embeddings persist as
`pgvector` columns. Detailed in [`data-model.md`](./data-model.md).

### LLM and embeddings

- **Chat completions** go through DeepSeek using the OpenAI chat-completions
  format (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`). Completion length is
  capped (`LLM_MAX_TOKENS`, default 2048) so a degenerate JSON-mode run can't
  balloon into a multi-hundred-KB response. The shared client lives in
  `app/graph/nodes/_llm_client.py` and exposes blocking (`call_llm`) and
  streaming (`stream_llm`) calls plus JSON/reasoning helpers.
- **Embeddings** go through Gemini (`GEMINI_API_KEY`,
  `GEMINI_EMBEDDING_MODEL`), producing 768-dimensional vectors
  (`app/services/embeddings.py`).

## Robustness notes baked into the code

- **Reasoning / JSON-trailer leakage.** Some models append a trailing JSON object
  (or emit hidden "reasoning") after the prose. The streaming path withholds
  everything from the first top-level `{`, then drops it if it parses as JSON
  (honoring any `used_source_ids` it cites) or flushes it as text if it doesn't.
  `strip_reasoning` cleans residual reasoning markup. (See commit
  *"stop model reasoning and JSON trailers leaking into replies"*.)
- **Graceful degradation.** If the LLM is unavailable, extractors and chat fall
  back to a clean `(LLM unavailable) …` confirmation rather than crashing. If
  embeddings fail, notes are saved without a vector (still usable) and retrieval
  silently returns no context.
- **Bounded context.** Conversation history forwarded to the LLM is capped
  (`MAX_HISTORY_MESSAGES = 10`); retrieval is top-k (`TOP_K = 3`) above a
  similarity threshold; tool list/group results have hard caps.
