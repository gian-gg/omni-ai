from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient, PyJWKClientError

from app.core.config import Settings, settings

SUPPORTED_SUPABASE_JWT_ALGORITHMS = ("RS256", "ES256", "EdDSA")
bearer_scheme = HTTPBearer(auto_error=False)


class AuthenticationError(Exception):
    """Raised when the request does not contain a valid Supabase access token."""


@dataclass(frozen=True, slots=True)
class VerifiedTokenClaims:
    subject: str
    issuer: str
    expires_at: int
    audience: tuple[str, ...]
    email: str | None
    role: str | None


def extract_bearer_token(authorization_header: str | None) -> str:
    if authorization_header is None:
        raise AuthenticationError("Missing Authorization header.")

    scheme, _, token = authorization_header.partition(" ")
    clean_token = token.strip()

    if scheme.lower() != "bearer" or not clean_token:
        raise AuthenticationError("Authorization header must use the Bearer scheme.")

    return clean_token


class SupabaseJwtVerifier:
    def __init__(
        self,
        app_settings: Settings,
        jwk_client: PyJWKClient | None = None,
    ) -> None:
        self._settings = app_settings
        self._jwk_client = jwk_client or PyJWKClient(
            app_settings.require_supabase_jwks_url()
        )

    def verify_token(self, token: str) -> VerifiedTokenClaims:
        try:
            signing_key = self._jwk_client.get_signing_key_from_jwt(token)
            decode_kwargs: dict[str, object] = {
                "jwt": token,
                "key": signing_key.key,
                "algorithms": list(SUPPORTED_SUPABASE_JWT_ALGORITHMS),
                "issuer": self._settings.require_supabase_issuer(),
                "options": {
                    "require": ["sub", "exp", "iss"],
                    "verify_aud": self._settings.supabase_audience is not None,
                },
            }
            if self._settings.supabase_audience is not None:
                decode_kwargs["audience"] = self._settings.supabase_audience

            payload = jwt.decode(**decode_kwargs)
        except (InvalidTokenError, PyJWKClientError) as error:
            raise AuthenticationError("Invalid Supabase access token.") from error

        subject = payload.get("sub")
        issuer = payload.get("iss")
        expires_at = payload.get("exp")
        if not isinstance(subject, str) or not subject:
            raise AuthenticationError("Supabase access token is missing a valid subject.")
        if not isinstance(issuer, str) or not issuer:
            raise AuthenticationError("Supabase access token is missing a valid issuer.")
        if not isinstance(expires_at, int):
            raise AuthenticationError("Supabase access token is missing a valid expiry.")

        audience_claim = payload.get("aud")
        if isinstance(audience_claim, str):
            audience = (audience_claim,)
        elif isinstance(audience_claim, list):
            audience = tuple(
                entry for entry in audience_claim if isinstance(entry, str)
            )
        else:
            audience = tuple()

        email = payload.get("email")
        role = payload.get("role")

        return VerifiedTokenClaims(
            subject=subject,
            issuer=issuer,
            expires_at=expires_at,
            audience=audience,
            email=email if isinstance(email, str) else None,
            role=role if isinstance(role, str) else None,
        )


@lru_cache(maxsize=1)
def get_supabase_jwt_verifier() -> SupabaseJwtVerifier:
    return SupabaseJwtVerifier(settings)


def get_current_token_claims(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
) -> VerifiedTokenClaims:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    authorization_header = f"{credentials.scheme} {credentials.credentials}"

    try:
        token = extract_bearer_token(authorization_header)
        return get_supabase_jwt_verifier().verify_token(token)
    except AuthenticationError as error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(error),
        ) from error
