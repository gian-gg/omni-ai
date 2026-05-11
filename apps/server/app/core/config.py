from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "omni-api"
    env: str = "dev"
    log_level: str = "INFO"
    llm_api_key: str | None = None
    llm_base_url: str = "https://api.deepseek.com"
    system_prompt: str = "You are a helpful, concise assistant."
    llm_model: str = "deepseek-v4-flash"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


settings = Settings()
