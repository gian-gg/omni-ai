from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.db.session import get_db_session
from app.services import suggestions as service
from app.v1.schemas import SuggestionsResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/suggestions")


@router.get(
    "",
    response_model=SuggestionsResponse,
    summary="Get cached, data-grounded prompt suggestions for the user",
)
def get(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
    refresh: Annotated[bool, Query()] = False,
) -> SuggestionsResponse:
    try:
        result = service.get_suggestions(
            db_session, authenticated_user.user, force=refresh
        )
    except Exception as error:
        logger.exception("Failed to build suggestions.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to build suggestions.",
        ) from error

    return SuggestionsResponse(
        suggestions=result.suggestions,
        generated_at=result.generated_at,
        cached=result.cached,
    )
