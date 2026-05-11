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
