from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.services.supabase_auth import sign_in_with_password, sign_up_with_password
from app.v1.schemas import (
    AuthMeResponse,
    AuthPasswordRequest,
    AuthSessionResponse,
    AuthenticatedUserResponse,
)

router = APIRouter(prefix="/auth")


@router.post("/signup", response_model=AuthSessionResponse, summary="Sign up with email and password")
def sign_up(payload: AuthPasswordRequest) -> AuthSessionResponse:
    return sign_up_with_password(payload.email, payload.password)


@router.post("/login", response_model=AuthSessionResponse, summary="Log in with email and password")
def login(payload: AuthPasswordRequest) -> AuthSessionResponse:
    return sign_in_with_password(payload.email, payload.password)


@router.get("/me", response_model=AuthMeResponse, summary="Get the authenticated user")
def get_me(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
) -> AuthMeResponse:
    user = authenticated_user.user
    return AuthMeResponse(
        user=AuthenticatedUserResponse(
            id=user.id,
            supabase_user_id=user.supabase_user_id,
            email=user.email,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )
    )
