from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.auth import AuthenticatedUser, get_current_authenticated_user
from app.db.session import get_db_session
from app.services import transactions as service
from app.v1.schemas import (
    FinanceData,
    TransactionListResponse,
    TransactionResponse,
    TransactionUpdateRequest,
)

router = APIRouter(prefix="/transactions")


_NOT_FOUND = HTTPException(
    status_code=status.HTTP_404_NOT_FOUND,
    detail="Transaction not found.",
)


@router.post(
    "",
    response_model=TransactionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a transaction",
)
def create(
    payload: FinanceData,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TransactionResponse:
    # Apply the user's default currency only when the client omitted one.
    currency_override = (
        authenticated_user.user.currency
        if "currency" not in payload.model_fields_set
        else None
    )
    transaction = service.create_transaction(
        db_session,
        authenticated_user.user.id,
        payload,
        currency_override=currency_override,
    )
    return TransactionResponse.model_validate(transaction)


@router.get(
    "",
    response_model=TransactionListResponse,
    summary="List transactions",
)
def list_(
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> TransactionListResponse:
    items, total = service.list_transactions(
        db_session, authenticated_user.user.id, limit, offset
    )
    return TransactionListResponse(
        items=[TransactionResponse.model_validate(i) for i in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{transaction_id}",
    response_model=TransactionResponse,
    summary="Get a transaction",
)
def get(
    transaction_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TransactionResponse:
    transaction = service.get_transaction(
        db_session, authenticated_user.user.id, transaction_id
    )
    if transaction is None:
        raise _NOT_FOUND
    return TransactionResponse.model_validate(transaction)


@router.patch(
    "/{transaction_id}",
    response_model=TransactionResponse,
    summary="Update a transaction",
)
def update(
    transaction_id: str,
    payload: TransactionUpdateRequest,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> TransactionResponse:
    transaction = service.update_transaction(
        db_session, authenticated_user.user.id, transaction_id, payload
    )
    if transaction is None:
        raise _NOT_FOUND
    return TransactionResponse.model_validate(transaction)


@router.delete(
    "/{transaction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a transaction",
)
def delete(
    transaction_id: str,
    authenticated_user: Annotated[
        AuthenticatedUser, Depends(get_current_authenticated_user)
    ],
    db_session: Annotated[Session, Depends(get_db_session)],
) -> Response:
    deleted = service.delete_transaction(
        db_session, authenticated_user.user.id, transaction_id
    )
    if not deleted:
        raise _NOT_FOUND
    return Response(status_code=status.HTTP_204_NO_CONTENT)
