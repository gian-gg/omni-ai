# Development

This repo is a monorepo with two independently-run apps. There is no top-level
workspace tooling — set each app up on its own.

## Prerequisites

- **Server** — Python 3.12 (pinned `3.12.7` in `apps/server/.python-version`),
  [`uv`](https://docs.astral.sh/uv/), and access to a PostgreSQL database with
  the `pgvector` extension (Supabase provides both).
- **Client** — [Bun](https://bun.sh/), the Expo CLI (via `bunx expo`), and the
  Expo Go app or a dev build on a device/simulator.
- **Accounts/keys** — a Supabase project (Auth + Postgres), a DeepSeek API key,
  and a Gemini API key. See [`configuration.md`](./configuration.md).

---

## Server (`apps/server`)

```bash
cd apps/server

# 1. Install dependencies (uv reads pyproject.toml / uv.lock).
uv sync

# 2. Configure environment.
cp .env.example .env
#   then fill in DATABASE_URL, SUPABASE_*, LLM_API_KEY, GEMINI_API_KEY

# 3. Apply database migrations.
uv run alembic upgrade head

# 4. Run the API (FastAPI app is app.main:app).
uv run uvicorn app.main:app --reload
```

The API serves under `http://127.0.0.1:8000`, with OpenAPI docs at `/docs` and
`/redoc`. Health check: `GET /api/v1/health`.

> `requirements.txt` is also present (a pinned export) if you prefer
> `pip install -r requirements.txt` in a venv over `uv sync`.

### Tests

The backend has a `pytest` suite under `apps/server/tests/` covering auth,
config, the database layer, graph nodes (classify/retrieve/query), tools, the
LLM client's reasoning stripping, streaming conversations, suggestions, and each
resource's endpoints.

```bash
cd apps/server
uv run pytest
```

### Migrations

Alembic config is `apps/server/alembic.ini`; versions live in
`apps/server/alembic/versions/` (linear history, see
[`data-model.md`](./data-model.md)).

```bash
uv run alembic upgrade head            # apply all
uv run alembic revision -m "message"   # new migration
uv run alembic downgrade -1            # roll back one
```

Alembic reads `DATABASE_URL` from the environment.

### Lint / format

Ruff is configured (`.ruff_cache` present):

```bash
uv run ruff check .
uv run ruff format .
```

---

## Client (`apps/client`)

```bash
cd apps/client

# 1. Install dependencies.
bun install

# 2. Start the dev server.
bun start            # Expo dev server (QR / dev menu)
bun run ios          # open iOS simulator
bun run android      # open Android emulator
bun run web          # run in the browser

# Lint
bun run lint
```

The client points at the hosted backend by default
(`https://omni-api.giann.dev/api/v1`). To develop against a local server, update
`API_BASE` in `apps/client/src/api/client.ts`. A dev client (`expo-dev-client`)
and EAS build profiles (`eas.json`) are configured for device builds.

---

## Typical loop

1. Run the server (`uv run uvicorn app.main:app --reload`) against your Supabase
   DB.
2. Run the client (`bun start`) pointed at that server.
3. Sign up / log in (Supabase Auth), then chat — capture intents propose, you
   approve, and the structured data shows up under **Spaces**.
4. Add tests alongside backend changes; run `uv run pytest` before committing.

See [`architecture.md`](./architecture.md) and
[`orchestration.md`](./orchestration.md) for how a request flows once it reaches
the server.
