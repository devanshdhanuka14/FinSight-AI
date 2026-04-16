from pydantic_settings import BaseSettings

# BaseSettings is a special Pydantic class that auto-reads from .env when you instantiate it
# = "" means if the key is missing from .env, it defaults to empty string instead of crashing

class Settings(BaseSettings):
    gemini_api_key: str = ""
    database_url: str=""

    class Config:
        env_file=".env"

settings=Settings()