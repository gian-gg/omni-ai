from __future__ import annotations

import unittest

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.auth import VerifiedTokenClaims
from app.db.base import Base
from app.models.user import User
from app.services.user import upsert_user_from_claims


class UserServiceTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(self.engine)
        self.session = Session(bind=self.engine)

    def tearDown(self) -> None:
        self.session.close()
        self.engine.dispose()

    def test_upsert_user_creates_new_user(self) -> None:
        claims = VerifiedTokenClaims(
            subject="supabase-user-123",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email="first@example.com",
            role="authenticated",
        )

        user = upsert_user_from_claims(self.session, claims)

        self.assertEqual(user.supabase_user_id, "supabase-user-123")
        self.assertEqual(user.email, "first@example.com")

    def test_upsert_user_updates_email_without_duplicates(self) -> None:
        initial_claims = VerifiedTokenClaims(
            subject="supabase-user-123",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email="first@example.com",
            role="authenticated",
        )
        updated_claims = VerifiedTokenClaims(
            subject="supabase-user-123",
            issuer="https://demo-project.supabase.co/auth/v1",
            expires_at=1_900_000_000,
            audience=("authenticated",),
            email="second@example.com",
            role="authenticated",
        )

        created_user = upsert_user_from_claims(self.session, initial_claims)
        updated_user = upsert_user_from_claims(self.session, updated_claims)
        users = self.session.scalars(select(User)).all()

        self.assertEqual(created_user.id, updated_user.id)
        self.assertEqual(updated_user.email, "second@example.com")
        self.assertEqual(len(users), 1)
