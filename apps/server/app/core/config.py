from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "omni-api"
    env: str = "dev"
    log_level: str = "INFO"
    database_url: str | None = None
    supabase_url: str | None = None
    supabase_publishable_key: str | None = None
    supabase_anon_key: str | None = None
    supabase_issuer: str | None = None
    supabase_jwks_url: str | None = None
    supabase_audience: str | None = None
    llm_api_key: str | None = None
    llm_base_url: str = "https://api.deepseek.com"
    system_prompt: str = "You are a helpful, concise assistant."
    llm_model: str = "deepseek-v4-flash"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    def require_database_url(self) -> str:
        if not self.database_url:
            raise ValueError("DATABASE_URL is not configured.")

        return self.database_url

    def require_supabase_issuer(self) -> str:
        if self.supabase_issuer:
            return self.supabase_issuer.rstrip("/")

        if not self.supabase_url:
            raise ValueError(
                "SUPABASE_ISSUER is not configured and SUPABASE_URL is unavailable for derivation."
            )

        return f"{self.supabase_url.rstrip('/')}/auth/v1"

    def require_supabase_jwks_url(self) -> str:
        if self.supabase_jwks_url:
            return self.supabase_jwks_url

        return f"{self.require_supabase_issuer()}/.well-known/jwks.json"

    def require_supabase_url(self) -> str:
        if not self.supabase_url:
            raise ValueError("SUPABASE_URL is not configured.")

        return self.supabase_url.rstrip("/")

    def require_supabase_api_key(self) -> str:
        if self.supabase_publishable_key:
            return self.supabase_publishable_key
        if self.supabase_anon_key:
            return self.supabase_anon_key

        raise ValueError(
            "Neither SUPABASE_PUBLISHABLE_KEY nor SUPABASE_ANON_KEY is configured."
        )


settings = Settings()
