from __future__ import annotations

from datetime import datetime
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import settings
from app.v1.schemas import AuthSessionResponse, SupabaseAuthUserResponse


def _build_auth_headers() -> dict[str, str]:
    api_key = settings.require_supabase_api_key()
    return {
        "apikey": api_key,
        "Content-Type": "application/json",
    }


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value:
        return None

    normalized_value = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized_value)
    except ValueError:
        return None


def _build_auth_response(payload: dict[str, Any]) -> AuthSessionResponse:
    user_payload = payload.get("user")
    user: SupabaseAuthUserResponse | None = None
    if isinstance(user_payload, dict):
        user_id = user_payload.get("id")
        if isinstance(user_id, str) and user_id:
            user = SupabaseAuthUserResponse(
                id=user_id,
                email=user_payload.get("email")
                if isinstance(user_payload.get("email"), str)
                else None,
                role=user_payload.get("role")
                if isinstance(user_payload.get("role"), str)
                else None,
                aud=user_payload.get("aud")
                if isinstance(user_payload.get("aud"), str)
                else None,
                created_at=_parse_datetime(user_payload.get("created_at")),
            )

    expires_in = payload.get("expires_in")
    return AuthSessionResponse(
        access_token=payload.get("access_token")
        if isinstance(payload.get("access_token"), str)
        else None,
        refresh_token=payload.get("refresh_token")
        if isinstance(payload.get("refresh_token"), str)
        else None,
        token_type=payload.get("token_type")
        if isinstance(payload.get("token_type"), str)
        else None,
        expires_in=expires_in if isinstance(expires_in, int) else None,
        user=user,
    )


def _raise_from_supabase_response(response: httpx.Response) -> None:
    try:
        payload = response.json()
    except ValueError:
        payload = {}

    detail = "Supabase authentication request failed."
    if isinstance(payload, dict):
        message = payload.get("msg")
        if isinstance(message, str) and message:
            detail = message
        else:
            message = payload.get("error_description")
            if isinstance(message, str) and message:
                detail = message
            else:
                message = payload.get("error")
                if isinstance(message, str) and message:
                    detail = message

    raise HTTPException(status_code=response.status_code, detail=detail)


def _post_to_supabase_auth(path: str, body: dict[str, str]) -> AuthSessionResponse:
    url = f"{settings.require_supabase_url()}{path}"

    try:
        with httpx.Client(timeout=30) as client:
            response = client.post(url, headers=_build_auth_headers(), json=body)
    except httpx.HTTPError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to reach Supabase Auth.",
        ) from error

    if response.is_error:
        _raise_from_supabase_response(response)

    try:
        payload = response.json()
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase Auth returned an invalid response.",
        ) from error

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Supabase Auth returned an invalid response.",
        )

    return _build_auth_response(payload)


def sign_up_with_password(email: str, password: str) -> AuthSessionResponse:
    return _post_to_supabase_auth(
        "/auth/v1/signup",
        {
            "email": email,
            "password": password,
        },
    )


def sign_in_with_password(email: str, password: str) -> AuthSessionResponse:
    return _post_to_supabase_auth(
        "/auth/v1/token?grant_type=password",
        {
            "email": email,
            "password": password,
        },
    )


def refresh_session(refresh_token: str) -> AuthSessionResponse:
    return _post_to_supabase_auth(
        "/auth/v1/token?grant_type=refresh_token",
        {
            "refresh_token": refresh_token,
        },
    )
