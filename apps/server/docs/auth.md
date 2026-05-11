# Auth Guide

This document explains how authentication works in the Omni backend,
which endpoints the client should use, how to store session data, and
how to handle token expiry.

## Overview

Omni uses **Supabase Auth** as the identity provider.

The backend exposes its own auth endpoints so the client can talk to a
single server base URL instead of calling Supabase endpoints directly.

Current auth flow:

1. The client calls the Omni backend auth endpoints.
2. The backend proxies signup, login, and refresh requests to Supabase Auth.
3. Supabase returns session tokens.
4. The client stores the session securely.
5. The client sends `Authorization: Bearer <access_token>` to protected
   Omni API routes.
6. The backend verifies the Supabase JWT and bootstraps the local app
   `users` row when needed.

## Endpoints

Base prefix: `/api/v1/auth`

### `POST /api/v1/auth/signup`

Creates a Supabase Auth user using email and password.

Request body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response shape:

```json
{
  "access_token": "string-or-null",
  "refresh_token": "string-or-null",
  "token_type": "bearer-or-null",
  "expires_in": 3600,
  "user": {
    "id": "supabase-user-id",
    "email": "user@example.com",
    "role": "authenticated",
    "aud": "authenticated",
    "created_at": "2026-05-12T00:00:00+00:00"
  }
}
```

Important:

- If Supabase email confirmation is enabled, signup may return a `user`
  object but `access_token`, `refresh_token`, `token_type`, and
  `expires_in` may be `null`.
- In that case the user must confirm their email before login succeeds.

### `POST /api/v1/auth/login`

Logs in using email and password and returns a Supabase session.

Request body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

Response shape:

```json
{
  "access_token": "access-token",
  "refresh_token": "refresh-token",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "supabase-user-id",
    "email": "user@example.com",
    "role": "authenticated",
    "aud": "authenticated",
    "created_at": "2026-05-12T00:00:00+00:00"
  }
}
```

This is the main endpoint the client should use to obtain a session.

### `POST /api/v1/auth/refresh`

Refreshes an auth session using the stored refresh token.

Request body:

```json
{
  "refresh_token": "refresh-token"
}
```

Response shape:

```json
{
  "access_token": "new-access-token",
  "refresh_token": "new-refresh-token",
  "token_type": "bearer",
  "expires_in": 3600,
  "user": {
    "id": "supabase-user-id",
    "email": "user@example.com",
    "role": "authenticated",
    "aud": "authenticated",
    "created_at": "2026-05-12T00:00:00+00:00"
  }
}
```

Important:

- Supabase refresh tokens are single-use.
- When refresh succeeds, replace the stored session with the full new
  response, especially the new `refresh_token`.

### `GET /api/v1/auth/me`

Returns the authenticated app user.

Headers:

```text
Authorization: Bearer <access_token>
```

Response shape:

```json
{
  "user": {
    "id": "local-app-user-id",
    "supabase_user_id": "supabase-user-id",
    "email": "user@example.com",
    "created_at": "2026-05-12T00:00:00+00:00",
    "updated_at": "2026-05-12T00:00:00+00:00"
  }
}
```

Behavior:

- Verifies the Supabase JWT.
- Creates the local app `users` row if it does not exist.
- Updates safe fields such as email when claims change.

## Protected Routes

These routes require a valid Supabase access token:

- `POST /api/v1/chat`
- `POST /api/v1/agent`
- `GET /api/v1/auth/me`

Header format:

```text
Authorization: Bearer <access_token>
```

If the token is missing or invalid, the backend returns `401`.

## Session Storage

The client should store the **whole session**, not just the access token.

Minimum fields to store:

- `access_token`
- `refresh_token`
- `token_type`
- `expires_in`
- `user`

Recommended additional field:

- `expires_at`

Example stored session:

```json
{
  "access_token": "access-token",
  "refresh_token": "refresh-token",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1746990000000,
  "user": {
    "id": "supabase-user-id",
    "email": "user@example.com",
    "role": "authenticated",
    "aud": "authenticated",
    "created_at": "2026-05-12T00:00:00+00:00"
  }
}
```

How to compute `expires_at`:

```ts
const expiresAt = Date.now() + expiresIn * 1000
```

### Expo Recommendation

Use secure device storage for session data.

Recommended:

- `expo-secure-store`

Do not use plain `AsyncStorage` for tokens if you can avoid it.

## Token Expiry and Refresh

The `access_token` expires. This is normal.

The client should use the `refresh_token` to obtain a new access token.

Current backend status:

- `signup` is implemented
- `login` is implemented
- `refresh` is implemented
- `me` is implemented

Recommended refresh behavior:

1. Store the whole session securely.
2. Compute and store `expires_at`.
3. Refresh proactively before expiry or reactively after a `401`.
4. Replace the stored session with the full refresh response.

## Logout

A backend logout endpoint is not required for the current architecture.

Current logout behavior should be client-side:

1. Delete the stored session.
2. Clear any in-memory auth state.
3. Stop sending the bearer token.

This is a **local logout**, not token revocation.

Implications:

- It is good enough for current app usage and normal mobile auth flows.
- It does not revoke already-issued tokens immediately.

## Postman Flow

### Signup

Request:

- Method: `POST`
- URL: `http://127.0.0.1:8000/api/v1/auth/signup`
- Header: `Content-Type: application/json`

Body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Login

Request:

- Method: `POST`
- URL: `http://127.0.0.1:8000/api/v1/auth/login`
- Header: `Content-Type: application/json`

Body:

```json
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Refresh

Request:

- Method: `POST`
- URL: `http://127.0.0.1:8000/api/v1/auth/refresh`
- Header: `Content-Type: application/json`

Body:

```json
{
  "refresh_token": "refresh-token"
}
```

### Me

Request:

- Method: `GET`
- URL: `http://127.0.0.1:8000/api/v1/auth/me`
- Header: `Authorization: Bearer <access_token>`

### Protected Chat

Request:

- Method: `POST`
- URL: `http://127.0.0.1:8000/api/v1/chat`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <access_token>`

Body:

```json
{
  "prompt": "Create a short grocery list"
}
```

## Common Issues

### Signup returns `null` tokens

Usually means Supabase email confirmation is enabled.

Fix:

- Confirm the email through the Supabase email link.
- Then call `POST /api/v1/auth/login`.

### `401 Authentication required.`

Cause:

- Missing `Authorization` header.

Fix:

- Send `Authorization: Bearer <access_token>`.

### `401 Invalid Supabase access token.`

Cause:

- Expired token
- Wrong token
- Token issued by a different Supabase project

Fix:

- Refresh the session using `POST /api/v1/auth/refresh`
- If refresh fails, log in again

### `500` on `/auth/me`

If the traceback points to SQLAlchemy or psycopg, the issue is usually
with `DATABASE_URL`.

Common cause:

- Unescaped special characters in the Postgres password

If the password contains `@`, `:`, `/`, `?`, or `#`, URL-encode it
inside `DATABASE_URL`.

## Environment Variables

Required for the current auth flow:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
  or `SUPABASE_ANON_KEY`
- `SUPABASE_AUDIENCE`
- `DATABASE_URL`

Optional:

- `SUPABASE_ISSUER`
- `SUPABASE_JWKS_URL`

If `SUPABASE_ISSUER` and `SUPABASE_JWKS_URL` are omitted, they are
derived from `SUPABASE_URL`.
