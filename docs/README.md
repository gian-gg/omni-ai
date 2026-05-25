# Omni AI — Project Documentation

Repo-level documentation for the **Omni AI** monorepo. These documents explain
what the system is, how the pieces fit together, and how to run and extend them.

Omni is an AI-first system that turns natural-language input into structured
data — **transactions, todos, and notes** — through a single chat-style
entrypoint. A user types or speaks intent in plain language; the backend
classifies that intent, extracts a typed payload, optionally retrieves prior
notes via vector search, can call read-only tools over the user's own data to
ground its reply, and streams the response back token-by-token.

---

## Contents

| Document | What it covers |
|----------|----------------|
| [`overview.md`](./overview.md) | What Omni does, the monorepo layout, and the end-to-end request flow. |
| [`architecture.md`](./architecture.md) | System architecture, component boundaries, and design principles. |
| [`orchestration.md`](./orchestration.md) | The LangGraph-style orchestrator: intents, nodes, RAG, tools, and streaming. |
| [`data-model.md`](./data-model.md) | Database tables, ORM models, and Alembic migrations. |
| [`api-reference.md`](./api-reference.md) | Every `/api/v1` endpoint, grouped by resource. |
| [`auth.md`](./auth.md) | Supabase-backed auth flow, JWT verification, and token lifecycle. |
| [`client.md`](./client.md) | The Expo / React Native mobile app: routing, screens, API client, styling. |
| [`configuration.md`](./configuration.md) | Environment variables and settings for the server and client. |
| [`development.md`](./development.md) | Local setup, running, testing, and migrations for both apps. |

> The backend also ships its own focused docs under
> [`apps/server/docs/`](../apps/server/docs/) (`architecture.md`, `auth.md`).
> The auth document there is the canonical, request-by-request reference; the
> repo-level [`auth.md`](./auth.md) summarizes it and links across.

---

## Quick map

```txt
omni-ai/
├── apps/
│   ├── client/     # Expo SDK 54 + React Native mobile app (TypeScript, Bun)
│   └── server/     # FastAPI + LangGraph backend (Python 3.12, uv)
├── packages/       # Reserved for shared code (currently empty)
└── docs/           # ← you are here
```

- **Server** — FastAPI exposes a versioned REST API under `/api/v1`. An
  orchestration graph (`app/graph`) classifies intent and produces replies via
  DeepSeek (OpenAI-format chat completions). Notes are embedded with Gemini and
  stored in PostgreSQL via `pgvector` for retrieval-augmented chat.
- **Client** — A mobile app with three tabs (Chat, Spaces, Profile). Spaces
  surfaces the structured data (transactions, todos, notes, analytics) the chat
  flow captures.
- **Identity** — Supabase Auth issues JWTs; the backend verifies them
  server-side and owns its own `users` table keyed to the Supabase user id.

Start with [`overview.md`](./overview.md) for the narrative, or jump straight to
[`development.md`](./development.md) to run things.
