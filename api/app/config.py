from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    supabase_url: str
    supabase_publishable_key: str
    supabase_secret_key: str
    gemini_api_key: str

    fast_models: str = "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash"
    smart_models: str = "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash"
    embed_model: str = "gemini-embedding-2"
    llm_rpm: int = 10
    embed_rpm: int = 50

    workers: int = 2
    web_origin: str = "http://localhost:3000"
    bucket: str = "sources"
    max_upload_mb: int = 40


settings = Settings()
