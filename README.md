# Omni AI

Omni is an AI-first system that converts natural language input into structured data — transactions, todos, and notes — through a single chat-style entrypoint.

Users express intent in plain language; the backend classifies the intent, extracts a typed payload, optionally retrieves prior notes via vector search, and can call read-only tools over the user's own data to ground its reply.

This repository is a **monorepo** containing the mobile client and the backend API.

---

## Repository Structure

```txt
apps/
├── client/        # Expo + React Native mobile app
└── server/        # FastAPI + LangGraph backend

packages/          # Reserved for shared code (currently empty)
docs/              # Reserved for project-level documentation (currently empty)
```

Backend architecture and auth notes live under `apps/server/docs/`.

---

## What Omni Does Today

- **Intent-routed chat** — every prompt is classified into `finance`, `todo`, `note`, or `chat` and routed through the LangGraph orchestrator.
- **Structured extraction** — `finance`, `todo`, and `note` intents return a typed payload (amount, due date, tags, etc.) alongside a natural-language reply with explicit approve / cancel responses.
- **Notes RAG** — notes are embedded with Gemini embeddings and stored in PostgreSQL via `pgvector`; relevant notes are retrieved on demand to ground chat replies, with cited sources returned to the client.
- **Gated read-only tools** — the `chat` intent can query the authenticated user's transactions, todos, and notes through scoped tools. Tool calls are gated by intent so non-chat flows stay deterministic.
- **Versioned REST API** — full CRUD for transactions, todos, and notes lives under `/api/v1`, alongside auth and the chat orchestrator.

---

## Tech Stack

**Client (`apps/client`)**
- Expo SDK 54, React Native, TypeScript
- Expo Router, Expo Secure Store
- Bun as the package manager

**Server (`apps/server`)**
- FastAPI + Uvicorn
- LangGraph for the orchestration graph
- SQLAlchemy 2 + Alembic for app-owned tables
- PostgreSQL with `pgvector` for note embeddings
- Supabase Auth as the identity provider (JWT verified server-side)
- DeepSeek (OpenAI-format chat completions) for the LLM
- Gemini embeddings for RAG

---

## Getting Started

Each app has its own setup:

- **Server** — see `apps/server/docs/` for architecture and `apps/server/docs/auth.md` for auth flow and required environment variables.
- **Client** — see `apps/client/README.md`.
