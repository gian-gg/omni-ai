from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.user import User

if TYPE_CHECKING:
    from app.core.auth import VerifiedTokenClaims
    from app.v1.schemas import UserPreferencesUpdateRequest


def upsert_user_from_claims(
    db_session: Session,
    claims: VerifiedTokenClaims,
) -> User:
    existing_user = db_session.scalar(
        select(User).where(User.supabase_user_id == claims.subject)
    )
    if existing_user is None:
        user = User(
            supabase_user_id=claims.subject,
            email=claims.email,
        )
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    if existing_user.email != claims.email:
        db_session.execute(
            update(User)
            .where(User.id == existing_user.id)
            .values(email=claims.email)
        )
        db_session.commit()
        db_session.refresh(existing_user)

    return existing_user


def update_user_preferences(
    db_session: Session,
    user: User,
    payload: UserPreferencesUpdateRequest,
) -> User:
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(user, field, value)
    db_session.commit()
    db_session.refresh(user)
    return user
