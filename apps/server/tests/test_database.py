from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from app.db.base import Base
from app.db.session import get_db_session
from app.models import User


class DatabaseModelTestCase(unittest.TestCase):
    def test_users_table_has_expected_columns(self) -> None:
        table = Base.metadata.tables["users"]

        self.assertIn("id", table.c)
        self.assertIn("supabase_user_id", table.c)
        self.assertIn("email", table.c)
        self.assertIn("created_at", table.c)
        self.assertIn("updated_at", table.c)

        self.assertTrue(table.c["supabase_user_id"].unique)

    def test_db_session_dependency_closes_sessions(self) -> None:
        session = Mock(spec=Session)

        class SessionFactoryStub:
            def __call__(self) -> Session:
                return session

        with patch(
            "app.db.session.get_session_factory",
            return_value=SessionFactoryStub(),
        ):
            dependency = get_db_session()
            yielded_session = next(dependency)
            self.assertIs(yielded_session, session)
            dependency.close()

        session.close.assert_called_once()


class AlembicMigrationTestCase(unittest.TestCase):
    def test_upgrade_creates_users_table(self) -> None:
        with tempfile.TemporaryDirectory() as temp_directory:
            database_path = Path(temp_directory) / "test.sqlite3"
            database_url = f"sqlite:///{database_path}"
            config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))

            with patch.dict(os.environ, {"DATABASE_URL": database_url}, clear=True):
                with patch("app.core.config.settings.database_url", database_url):
                    command.upgrade(config, "head")

            engine = create_engine(database_url)
            try:
                inspector = inspect(engine)

                self.assertIn("users", inspector.get_table_names())
            finally:
                engine.dispose()
