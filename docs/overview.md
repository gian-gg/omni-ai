# Overview

## What Omni is

Omni converts everyday language into structured records. Instead of filling out
forms, the user just says what happened:

- *"I bought coffee for $4 at Starbucks"* → a proposed **expense** transaction.
- *"remind me to call mom tomorrow"* → a proposed **todo**.
- *"random thought: pour-over tastes better with a consistent grind"* → a
  **note**.
- *"how much did I spend on coffee this month?"* → a **chat** answer grounded in
  the user's own transactions.

Every message flows through one entrypoint. The backend decides whether the user
is *recording new data* (a capture intent) or *asking / chatting* (the chat
intent), and responds accordingly.

## The four intents

| Intent | Meaning | Result |
|--------|---------|--------|
| `finance` | User reports a transaction they just made or received. | Typed `FinanceData` payload + a confirm/approve/cancel reply. |
| `todo` | User adds a new task or reminder. | Typed `TodoData` payload + reply. |
| `note` | User captures a thought, idea, or journal entry. | Typed `NoteData` payload + reply. |
| `chat` | **Everything else** — questions, recall, lookups, greetings, advice. | A natural-language reply, optionally grounded in retrieved notes and read-only tool calls. |

A *question about* finance/todos/notes is always `chat`, never the matching
capture intent. The capture intents only fire when new data is being recorded.

## Capture is propose-then-confirm

Capture intents do **not** write to the database directly. The orchestrator
returns a proposal (`response`) plus `complete_response` and `cancelled_response`
strings and a typed `data` payload. The client shows the proposal; if the user
approves, the client calls the relevant CRUD endpoint
(`POST /transactions`, `/todos`, or `/notes`) with that payload. This keeps the
LLM out of the write path and makes every mutation explicit and user-approved.

## End-to-end request flow

```txt
User prompt
   │
   ▼
POST /api/v1/conversations           (or /conversations/{id}/messages)
   │   • persists the user message
   │   • opens a Server-Sent Events (SSE) stream
   ▼
Orchestrator (app/services/orchestrator.py)
   │
   ├─ classify   → finance | todo | note | chat
   ├─ retrieve   → top-k notes from pgvector (RAG)
   ├─ query      → read-only tools over the user's data (chat intent only)
   │
   ├─ if capture intent → extract typed payload (no token streaming)
   └─ if chat          → stream reply tokens, drop any trailing JSON trailer
   │
   ▼
SSE events: meta → delta… → message
   │
   ▼
Client renders the streamed reply; persists assistant turn server-side.
   On approval of a capture proposal → client POSTs to the CRUD endpoint.
```

See [`orchestration.md`](./orchestration.md) for the node-by-node detail and
[`api-reference.md`](./api-reference.md) for the SSE event contract.

## Monorepo layout

```txt
apps/
├── client/        # Expo + React Native mobile app
│   ├── app/       # expo-router file-based routes
│   └── src/       # api client, components, hooks, theme
└── server/        # FastAPI + LangGraph backend
    ├── app/       # core, db, graph, models, services, v1 (routes)
    ├── alembic/   # database migrations
    ├── tests/     # pytest suite
    └── docs/      # backend-specific architecture & auth docs

packages/          # Reserved for shared code (currently empty)
docs/              # Project-level documentation
```

## Tech stack at a glance

**Client (`apps/client`)**
- Expo SDK 54, React Native 0.81, React 19, TypeScript
- Expo Router (typed routes), Expo Secure Store, Expo Speech Recognition
- Bun as the package manager
- Custom theme (Syne / Manrope / IBM Plex Mono fonts); no UI kit

**Server (`apps/server`)**
- Python 3.12, FastAPI + Uvicorn
- LangGraph orchestration nodes (driven by a hand-rolled streaming runner)
- SQLAlchemy 2 + Alembic for app-owned tables
- PostgreSQL with `pgvector` for note embeddings
- Supabase Auth as the identity provider (JWT verified server-side)
- DeepSeek (OpenAI-format chat completions) for the LLM
- Gemini embeddings (768-dim) for RAG
- `uv` for dependency management
