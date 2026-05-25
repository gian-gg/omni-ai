from __future__ import annotations

import unittest
from datetime import datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.auth import AuthenticationError, VerifiedTokenClaims
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.models.user import User
from app.v1.schemas import AuthSessionResponse, SupabaseAuthUserResponse


class AuthEndpointsTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_directory = TemporaryDirectory()
        self.database_url = f"sqlite:///{Path(self.temp_directory.name) / 'auth.sqlite3'}"
        self.engine = create_engine(self.database_url)
        Base.metadata.create_all(self.engine)
        self.session = Session(bind=self.engine)

        def override_db_session():
            try:
                yield self.session
            finally:
                self.session.rollback()

        app.dependency_overrides[get_db_session] = override_db_session
        self.client = TestClient(app)

    def tearDown(self) -> None:
        app.dependency_overrides.clear()
        self.session.close()
        self.engine.dispose()
        self.temp_directory.cleanup()

    def test_me_returns_401_without_auth(self) -> None:
        response = self.client.get("/api/v1/auth/me")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Authentication required."})

    def test_me_returns_401_with_invalid_token(self) -> None:
        with patch(
            "app.core.auth.get_supabase_jwt_verifier",
        ) as verifier_factory:
            verifier_factory.return_value.verify_token.side_effect = AuthenticationError(
                "Invalid Supabase access token."
            )
            response = self.client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer invalid-token"},
            )

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json(), {"detail": "Invalid Supabase access token."})

    def test_signup_proxies_supabase_auth_response(self) -> None:
        signup_response = AuthSessionResponse(
            access_token="access-token",
            refresh_token="refresh-token",
            token_type="bearer",
            expires_in=3600,
            user=SupabaseAuthUserResponse(
                id="supabase-user-123",
                email="user@example.com",
                role="authenticated",
                aud="authenticated",
                created_at=datetime.fromisoformat("2026-05-12T00:00:00+00:00"),
            ),
        )

        with patch("app.v1.auth.sign_up_with_password", return_value=signup_response) as sign_up_mock:
            response = self.client.post(
                "/api/v1/auth/signup",
                json={"email": "user@example.com", "password": "password123"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["access_token"], "access-token")
        sign_up_mock.assert_called_once_with("user@example.com", "password123")

    def test_login_proxies_supabase_auth_response(self) -> None:
        login_response = AuthSessionResponse(
            access_token="access-token",
            refresh_token="refresh-token",
            token_type="bearer",
            expires_in=3600,
            user=SupabaseAuthUserResponse(
                id="supabase-user-123",
                email="user@example.com",
                role="authenticated",
                aud="authenticated",
                created_at=datetime.fromisoformat("2026-05-12T00:00:00+00:00"),
            ),
        )

        with patch("app.v1.auth.sign_in_with_password", return_value=login_response) as sign_in_mock:
            response = self.client.post(
                "/api/v1/auth/login",
                json={"email": "user@example.com", "password": "password123"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["refresh_token"], "refresh-token")
        sign_in_mock.assert_called_once_with("user@example.com", "password123")

    def test_refresh_proxies_supabase_auth_response(self) -> None:
        refresh_response = AuthSessionResponse(
            access_token="new-access-token",
            refresh_token="new-refresh-token",
            token_type="bearer",
            expires_in=3600,
            user=SupabaseAuthUserResponse(
                id="supabase-user-123",
                email="user@example.com",
                role="authenticated",
                aud="authenticated",
                created_at=datetime.fromisoformat("2026-05-12T00:00:00+00:00"),
            ),
        )

        with patch("app.v1.auth.refresh_session", return_value=refresh_response) as refresh_mock:
            response = self.client.post(
                "/api/v1/auth/refresh",
                json={"refresh_token": "old-refresh-token"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["access_token"], "new-access-token")
        refresh_mock.assert_called_once_with("old-refresh-token")

    def test_me_bootstraps_and_returns_local_user(self) -> None:
        claims = VerifiedTokenClaims(
            subject="supabase-user-123",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email="user@example.com",
            role="authenticated",
        )

        with patch(
            "app.core.auth.get_supabase_jwt_verifier",
        ) as verifier_factory:
            verifier_factory.return_value.verify_token.return_value = claims

            response = self.client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
            )

        self.assertEqual(response.status_code, 200)
        response_payload = response.json()
        self.assertEqual(response_payload["user"]["supabase_user_id"], "supabase-user-123")
        self.assertEqual(response_payload["user"]["email"], "user@example.com")

        users = self.session.query(User).all()
        self.assertEqual(len(users), 1)
        self.assertEqual(users[0].supabase_user_id, "supabase-user-123")

    def test_me_reuses_existing_user_without_duplicates(self) -> None:
        claims = VerifiedTokenClaims(
            subject="supabase-user-123",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email="updated@example.com",
            role="authenticated",
        )
        existing_user = User(
            supabase_user_id="supabase-user-123",
            email="initial@example.com",
        )
        self.session.add(existing_user)
        self.session.commit()

        with patch(
            "app.core.auth.get_supabase_jwt_verifier",
        ) as verifier_factory:
            verifier_factory.return_value.verify_token.return_value = claims

            first_response = self.client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
            )
            second_response = self.client.get(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
            )

        self.assertEqual(first_response.status_code, 200)
        self.assertEqual(second_response.status_code, 200)
        users = self.session.query(User).all()
        self.assertEqual(len(users), 1)
        self.assertEqual(users[0].email, "updated@example.com")

    def _claims(self) -> VerifiedTokenClaims:
        return VerifiedTokenClaims(
            subject="supabase-user-123",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email="user@example.com",
            role="authenticated",
        )

    def test_patch_me_updates_preferences(self) -> None:
        with patch("app.core.auth.get_supabase_jwt_verifier") as verifier_factory:
            verifier_factory.return_value.verify_token.return_value = self._claims()
            response = self.client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"display_name": "  Gian  ", "currency": "php"},
            )

        self.assertEqual(response.status_code, 200)
        user = response.json()["user"]
        self.assertEqual(user["display_name"], "Gian")
        self.assertEqual(user["currency"], "PHP")  # normalized to upper

    def test_patch_me_rejects_invalid_currency(self) -> None:
        with patch("app.core.auth.get_supabase_jwt_verifier") as verifier_factory:
            verifier_factory.return_value.verify_token.return_value = self._claims()
            response = self.client.patch(
                "/api/v1/auth/me",
                headers={"Authorization": "Bearer valid-token"},
                json={"currency": "dollars"},
            )

        self.assertEqual(response.status_code, 422)
