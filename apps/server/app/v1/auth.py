from __future__ import annotations

from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.core.config import settings
from app.db.session import get_db_session
from app.services.supabase_auth import (
    refresh_session,
    sign_in_with_password,
    sign_up_with_password,
)
from app.services.user import update_user_preferences
from app.v1.schemas import (
    AuthMeResponse,
    AuthPasswordRequest,
    AuthRefreshRequest,
    AuthSessionResponse,
    AuthenticatedUserResponse,
    UserPreferencesUpdateRequest,
)

router = APIRouter(prefix="/auth")


@router.post("/signup", response_model=AuthSessionResponse, summary="Sign up with email and password")
def sign_up(payload: AuthPasswordRequest) -> AuthSessionResponse:
    return sign_up_with_password(payload.email, payload.password)


@router.post("/login", response_model=AuthSessionResponse, summary="Log in with email and password")
def login(payload: AuthPasswordRequest) -> AuthSessionResponse:
    return sign_in_with_password(payload.email, payload.password)


@router.get(
    "/google",
    summary="Start Google OAuth via Supabase",
    response_class=RedirectResponse,
    status_code=307,
)
def google_login(
    redirect_to: Annotated[
        str | None,
        Query(description="URL Supabase should redirect to after Google sign-in."),
    ] = None,
) -> RedirectResponse:
    query: dict[str, str] = {"provider": "google"}
    if redirect_to:
        query["redirect_to"] = redirect_to
    url = f"{settings.require_supabase_url()}/auth/v1/authorize?{urlencode(query)}"
    return RedirectResponse(url=url, status_code=307)


@router.post("/refresh", response_model=AuthSessionResponse, summary="Refresh an auth session")
def refresh(payload: AuthRefreshRequest) -> AuthSessionResponse:
    return refresh_session(payload.refresh_token)


@router.get("/me", response_model=AuthMeResponse, summary="Get the authenticated user")
def get_me(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
) -> AuthMeResponse:
    return AuthMeResponse(
        user=AuthenticatedUserResponse.model_validate(authenticated_user.user)
    )


@router.patch(
    "/me", response_model=AuthMeResponse, summary="Update the authenticated user's preferences"
)
def update_me(
    payload: UserPreferencesUpdateRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> AuthMeResponse:
    user = update_user_preferences(db_session, authenticated_user.user, payload)
    return AuthMeResponse(user=AuthenticatedUserResponse.model_validate(user))
