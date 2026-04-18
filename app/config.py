from pydantic_settings import BaseSettings

# BaseSettings is a special Pydantic class that auto-reads from .env when you instantiate it
# = "" means if the key is missing from .env, it defaults to empty string instead of crashing

class Settings(BaseSettings):
    gemini_api_key: str = ""
    database_url: str = ""
    debug: bool = False
    secret_key: str = ""

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        extra = "ignore" # extra = "ignore" tells Pydantic to silently ignore any env variables it doesn't recognise. Cleaner than adding every possible field.

settings=Settings()