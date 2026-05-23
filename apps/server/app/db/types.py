from __future__ import annotations

import json
from typing import Any

from pgvector.sqlalchemy import Vector
from sqlalchemy import Text
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator


class VectorType(TypeDecorator):
    """Vector column that uses pgvector on PostgreSQL and a JSON-encoded list on SQLite.

    Lets the same model run against Postgres (real ANN search) and SQLite (tests).
    """

    impl = Text
    cache_ok = True

    def __init__(self, dimensions: int) -> None:
        super().__init__()
        self.dimensions = dimensions

    def load_dialect_impl(self, dialect: Dialect):  # type: ignore[override]
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(self.dimensions))
        return dialect.type_descriptor(Text())

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return json.dumps(list(value))

    def process_result_value(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        if dialect.name == "postgresql":
            return value
        return json.loads(value)
