# Authentication

Omni uses **Supabase Auth** as the identity provider. The backend exposes its
own auth endpoints so the client talks to a single base URL, and verifies the
Supabase JWT server-side on every protected request.

> The canonical, request-by-request reference (exact bodies, refresh handling,
> error shapes, and the full environment-variable list) lives in
> [`apps/server/docs/auth.md`](../apps/server/docs/auth.md). This page
> summarizes the flow and points to the code.

## Flow

```txt
1. Client → backend auth endpoints (/api/v1/auth/{signup,login,refresh,google})
2. Backend proxies the request to Supabase Auth.
3. Supabase returns session tokens (access_token, refresh_token, expires_in).
4. Client stores the session securely (Expo Secure Store).
5. Client sends Authorization: Bearer <access_token> on protected routes.
6. Backend verifies the Supabase JWT and bootstraps the local users row.
```

## Backend auth endpoints (`app/v1/auth.py`)

| Endpoint | Purpose |
|----------|---------|
| `POST /api/v1/auth/signup` | Create a Supabase user (email + password). |
| `POST /api/v1/auth/login` | Log in; returns a Supabase session. |
| `GET /api/v1/auth/google` | `307` redirect into Supabase Google OAuth (optional `redirect_to`). |
| `POST /api/v1/auth/refresh` | Swap a `refresh_token` for a fresh session. |
| `GET /api/v1/auth/me` | The authenticated local user. |
| `PATCH /api/v1/auth/me` | Update `display_name` / `currency`. |

Signup/login/refresh proxy logic lives in `app/services/supabase_auth.py`.

> If Supabase email confirmation is enabled, signup may return a `user` object
> with **null** tokens; the user must confirm their email before login succeeds.

## Token verification (`app/core/auth.py`)

A `HTTPBearer` dependency feeds `SupabaseJwtVerifier`, which:

1. Fetches the signing key from the project's JWKS
   (`SUPABASE_JWKS_URL`, derived from `SUPABASE_URL` if not set).
2. Decodes the JWT, allowing `RS256`, `ES256`, or `EdDSA`.
3. Requires `sub`, `exp`, `iss`; verifies the issuer; verifies the audience
   only when `SUPABASE_AUDIENCE` is configured.
4. Returns `VerifiedTokenClaims` (subject, issuer, expiry, audience, email,
   role).

`get_current_authenticated_user` then calls `upsert_user_from_claims`
(`app/services/user.py`) to create-or-fetch the local `users` row keyed by
`supabase_user_id`, and yields an `AuthenticatedUser` (claims + local `User`).
Protected routes depend on this. Invalid or missing tokens raise `401`.

## Client-side token lifecycle (`apps/client/src/api/client.ts`)

- `access_token` and `refresh_token` are stored in **Expo Secure Store**.
- Every API request attaches `Authorization: Bearer <access_token>`.
- On a `401`, the client performs a **single** silent refresh via
  `POST /auth/refresh`, retries the original request once, and — if refresh
  fails — wipes both tokens so the app can redirect to the welcome/login screen.
- Concurrent refreshes are de-duplicated (one in-flight refresh promise).

## Required environment (server)

`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (or legacy `SUPABASE_ANON_KEY`), and
optionally `SUPABASE_AUDIENCE`, `SUPABASE_ISSUER`, `SUPABASE_JWKS_URL` (the last
two are derived from `SUPABASE_URL` when omitted). See
[`configuration.md`](./configuration.md).
