# Configuration

## Server settings (`apps/server/app/core/config.py`)

Settings are loaded via `pydantic-settings` from environment variables and an
optional `.env` file (`apps/server/.env`; unknown keys are ignored). A template
lives at `apps/server/.env.example`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `APP_NAME` | `omni-api` | Service name (shown in `/health`). |
| `ENV` | `dev` | Environment label. |
| `LOG_LEVEL` | `INFO` | Logging level. |
| `DATABASE_URL` | — | **Required.** SQLAlchemy/Alembic DSN, e.g. `postgresql+psycopg://postgres:password@db.<ref>.supabase.co:5432/postgres`. |
| `SUPABASE_URL` | — | Supabase project URL. Issuer/JWKS are derived from it if unset. |
| `SUPABASE_PUBLISHABLE_KEY` | — | Supabase publishable key (`sb_publishable_…`). |
| `SUPABASE_ANON_KEY` | — | Legacy fallback if still on the old key format. |
| `SUPABASE_AUDIENCE` | — | Expected JWT audience (e.g. `authenticated`). Audience is verified only when set. |
| `SUPABASE_ISSUER` | derived | Override the JWT issuer; else `${SUPABASE_URL}/auth/v1`. |
| `SUPABASE_JWKS_URL` | derived | Override the JWKS URL; else `${issuer}/.well-known/jwks.json`. |
| `LLM_API_KEY` | — | **Required for live replies.** DeepSeek API key. |
| `LLM_BASE_URL` | `https://api.deepseek.com` | OpenAI-format chat-completions base URL. |
| `LLM_MODEL` | `deepseek-v4-flash` | Chat model id. |
| `LLM_MAX_TOKENS` | `2048` | Completion cap (guards against degenerate runaway responses). |
| `SYSTEM_PROMPT` | "You are a helpful, concise assistant." | Optional behavior override. |
| `GEMINI_API_KEY` | — | **Required for note embeddings / RAG.** |
| `GEMINI_EMBEDDING_MODEL` | `gemini-embedding-001` | Embedding model (768-dim output). |
| `GEMINI_BASE_URL` | `https://generativelanguage.googleapis.com` | Gemini API base URL. |

Helper accessors (`require_database_url`, `require_supabase_issuer`,
`require_supabase_jwks_url`, `require_supabase_url`, `require_supabase_api_key`)
raise clear errors when a needed value is missing, and derive issuer/JWKS from
`SUPABASE_URL` when not given explicitly.

### Behavior when keys are absent

- **No `LLM_API_KEY`** — the orchestrator returns graceful
  `(LLM unavailable) …` fallbacks instead of erroring.
- **No `GEMINI_API_KEY`** — notes save without an embedding (still usable);
  retrieval returns no context, and `POST /notes/search` returns `503`.

## Client config (`apps/client/app.json`)

- `scheme: "client"`, `newArchEnabled: true`, typed routes + React Compiler on.
- iOS/Android permissions for microphone + speech recognition (dictation).
- Android package `com.ccxavi.client`; EAS project id under `extra.eas`.
- **API base URL** is currently hardcoded in `apps/client/src/api/client.ts`
  (`https://omni-api.giann.dev/api/v1`). To point at a local server, change
  `API_BASE` there (or refactor it to read from `expo-constants` /
  `EXPO_PUBLIC_*` env). There is no client `.env` today.
