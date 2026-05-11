import os
import unittest
from unittest.mock import patch

from app.core.config import Settings


class SettingsDefaultsTestCase(unittest.TestCase):
    def test_settings_use_deepseek_defaults(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings(_env_file=None)

        self.assertEqual(settings.llm_base_url, "https://api.deepseek.com")
        self.assertEqual(settings.llm_model, "deepseek-v4-flash")

    def test_settings_derive_supabase_auth_urls_from_project_url(self) -> None:
        with patch.dict(
            os.environ,
            {
                "SUPABASE_URL": "https://demo-project.supabase.co",
            },
            clear=True,
        ):
            settings = Settings(_env_file=None)

        self.assertEqual(
            settings.require_supabase_issuer(),
            "https://demo-project.supabase.co/auth/v1",
        )
        self.assertEqual(
            settings.require_supabase_jwks_url(),
            "https://demo-project.supabase.co/auth/v1/.well-known/jwks.json",
        )

    def test_settings_require_database_url_when_db_is_used(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = Settings(_env_file=None)

        with self.assertRaisesRegex(ValueError, "DATABASE_URL is not configured"):
            settings.require_database_url()
