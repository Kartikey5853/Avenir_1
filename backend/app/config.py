from pydantic_settings import BaseSettings



class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ENVIRONMENT: str = "development"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # Resend email API
    RESEND_API_KEY: str = ""
    RESEND_FROM:    str = "Avenir <onboarding@resend.dev>"

    CACHE_TTL_HOURS: int = 24

    # Map provider API keys (multi-provider location service)
    MAPBOX_TOKEN:   str = ""
    LOCATIONIQ_KEY: str = ""
    GEOAPIFY_KEY:   str = ""

    # Gemini AI
    GEMINI_API_KEY: str = ""

    # Supabase (for JWT verification)
    SUPABASE_JWT_SECRET: str = ""
    SUPABASE_URL:        str = ""
    SUPABASE_ANON_KEY:   str = ""

    class Config:
        env_file = ".env"

settings = Settings()
