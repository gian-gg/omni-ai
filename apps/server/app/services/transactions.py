from __future__ import annotations

from datetime import date as _date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.transaction import Transaction
from app.v1.schemas import FinanceData, TransactionUpdateRequest


def create_transaction(
    db_session: Session,
    user_id: str,
    payload: FinanceData,
) -> Transaction:
    transaction = Transaction(
        user_id=user_id,
        type=payload.type,
        amount=payload.amount,
        category=payload.category,
        description=payload.description,
        date=payload.date or _date.today(),
    )
    db_session.add(transaction)
    db_session.commit()
    db_session.refresh(transaction)
    return transaction


def list_transactions(
    db_session: Session,
    user_id: str,
    limit: int,
    offset: int,
) -> tuple[list[Transaction], int]:
    total = db_session.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.user_id == user_id)
    )
    items = list(
        db_session.scalars(
            select(Transaction)
            .where(Transaction.user_id == user_id)
            .order_by(Transaction.date.desc(), Transaction.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
    )
    return items, int(total or 0)


def get_transaction(
    db_session: Session,
    user_id: str,
    transaction_id: str,
) -> Transaction | None:
    return db_session.scalar(
        select(Transaction).where(
            Transaction.id == transaction_id,
            Transaction.user_id == user_id,
        )
    )


def update_transaction(
    db_session: Session,
    user_id: str,
    transaction_id: str,
    payload: TransactionUpdateRequest,
) -> Transaction | None:
    transaction = get_transaction(db_session, user_id, transaction_id)
    if transaction is None:
        return None

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(transaction, field, value)

    db_session.commit()
    db_session.refresh(transaction)
    return transaction


def delete_transaction(
    db_session: Session,
    user_id: str,
    transaction_id: str,
) -> bool:
    transaction = get_transaction(db_session, user_id, transaction_id)
    if transaction is None:
        return False

    db_session.delete(transaction)
    db_session.commit()
    return True
