from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from jwt import InvalidTokenError

from app.core.auth import (
    AuthenticationError,
    SupabaseJwtVerifier,
    VerifiedTokenClaims,
    extract_bearer_token,
)
from app.core.config import Settings


class AuthHelpersTestCase(unittest.TestCase):
    def test_extract_bearer_token_returns_clean_token(self) -> None:
        token = extract_bearer_token("Bearer test-token")

        self.assertEqual(token, "test-token")

    def test_extract_bearer_token_rejects_missing_header(self) -> None:
        with self.assertRaisesRegex(AuthenticationError, "Missing Authorization header"):
            extract_bearer_token(None)


class SupabaseJwtVerifierTestCase(unittest.TestCase):
    def test_verify_token_returns_claims(self) -> None:
        app_settings = Settings(
            _env_file=None,
            supabase_url="https://demo-project.supabase.co",
            supabase_audience="authenticated",
        )
        jwk_client = Mock()
        jwk_client.get_signing_key_from_jwt.return_value = SimpleNamespace(key="public-key")

        with patch(
            "app.core.auth.jwt.decode",
            return_value={
                "sub": "user-123",
                "iss": "https://demo-project.supabase.co/auth/v1",
                "exp": 1_900_000_000,
                "aud": "authenticated",
                "email": "user@example.com",
                "role": "authenticated",
            },
        ) as decode_mock:
            verifier = SupabaseJwtVerifier(app_settings, jwk_client=jwk_client)
            claims = verifier.verify_token("token-value")

        self.assertEqual(
            claims,
            VerifiedTokenClaims(
                subject="user-123",
                issuer="https://demo-project.supabase.co/auth/v1",
                expires_at=1_900_000_000,
                audience=("authenticated",),
                email="user@example.com",
                role="authenticated",
            ),
        )
        decode_mock.assert_called_once()
        _, decode_kwargs = decode_mock.call_args
        self.assertEqual(decode_kwargs["issuer"], "https://demo-project.supabase.co/auth/v1")
        self.assertEqual(decode_kwargs["audience"], "authenticated")

    def test_verify_token_disables_audience_check_when_not_configured(self) -> None:
        app_settings = Settings(
            _env_file=None,
            supabase_url="https://demo-project.supabase.co",
        )
        jwk_client = Mock()
        jwk_client.get_signing_key_from_jwt.return_value = SimpleNamespace(key="public-key")

        with patch(
            "app.core.auth.jwt.decode",
            return_value={
                "sub": "user-123",
                "iss": "https://demo-project.supabase.co/auth/v1",
                "exp": 1_900_000_000,
            },
        ) as decode_mock:
            verifier = SupabaseJwtVerifier(app_settings, jwk_client=jwk_client)
            verifier.verify_token("token-value")

        _, decode_kwargs = decode_mock.call_args
        self.assertNotIn("audience", decode_kwargs)
        self.assertEqual(
            decode_kwargs["options"]["verify_aud"],
            False,
        )

    def test_verify_token_rejects_invalid_tokens(self) -> None:
        app_settings = Settings(
            _env_file=None,
            supabase_url="https://demo-project.supabase.co",
        )
        jwk_client = Mock()
        jwk_client.get_signing_key_from_jwt.return_value = SimpleNamespace(key="public-key")

        with patch(
            "app.core.auth.jwt.decode",
            side_effect=InvalidTokenError("bad token"),
        ):
            verifier = SupabaseJwtVerifier(app_settings, jwk_client=jwk_client)

            with self.assertRaisesRegex(
                AuthenticationError,
                "Invalid Supabase access token",
            ):
                verifier.verify_token("token-value")
