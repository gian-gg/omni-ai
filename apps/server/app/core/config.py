from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "omni-api"
    env: str = "dev"
    log_level: str = "INFO"
    llm_api_key: str | None = None
    llm_base_url: str = "https://openrouter.ai/api/v1"
    system_prompt: str = "You are a helpful, concise assistant."
    llm_model: str = "openai/gpt-4o-mini"
    llm_site_url: str | None = None
    llm_app_title: str | None = None

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
