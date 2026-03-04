from app.config import settings


from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.database import Base, engine
from app.models.auth import User
from app.models.otp import OTP
#from app.models.profile import UserProfile
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from app.routes import auth
from app.routes import area
from app.routes import infrastructure
from app.routes import profile
from app.routes import scoring
from app.routes import map_view
from app.routes import market



# ── Seed areas on startup ──────────────────────────────────────────────────────
def _seed_areas() -> None:
    from app.database import SessionLocal
    from app.seeds import seed_areas
    db = SessionLocal()
    try:
        seed_areas(db)
    finally:
        db.close()



# ── Runtime DB column migration (idempotent) ──────────────────────────────────
def _ensure_profile_columns() -> None:
    """Add new profile columns when upgrading existing databases."""
    from app.database import engine as _eng
    new_cols = [
        ("relies_on_public_transport", "BOOLEAN DEFAULT 0"),
        ("prefers_vibrant_lifestyle",  "BOOLEAN DEFAULT 0"),
        ("safety_priority",             "BOOLEAN DEFAULT 0"),
    ]
    with _eng.connect() as conn:
        for col, col_def in new_cols:
            try:
                conn.execute(__import__('sqlalchemy').text(
                    f"ALTER TABLE user_profiles ADD COLUMN {col} {col_def}"
                ))
                conn.commit()
            except Exception:
                pass  # column already exists


# ----------------------------------
# Centralized Logging Configuration (Production)
# ----------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)

# ----------------------------------
# App Initialization
# ----------------------------------
app = FastAPI(
    title="avenir API",
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None
)

@app.on_event("startup")
def startup_event():
    Base.metadata.create_all(bind=engine)
    _seed_areas()
    _ensure_profile_columns()


# CORS middleware: allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
## Example usage of settings:
# print(settings.DATABASE_URL)
# print(settings.SECRET_KEY)

# ----------------------------------
# Global Exception Handlers
# ----------------------------------

@app.exception_handler(IntegrityError)
async def integrity_exception_handler(request: Request, exc: IntegrityError):
    logging.warning(f"Database integrity error: {str(exc)}")
    return JSONResponse(
        status_code=400,
        content={
            "success": False,
            "error": "Database integrity error"
        }
    )

@app.exception_handler(SQLAlchemyError)
async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError):
    logging.error(f"Database error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Database operation failed"
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"Unhandled error: {str(exc)}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "error": "Internal server error"
        }
    )

# ----------------------------------
# Include Routers
# ----------------------------------


# Register all routers
app.include_router(auth.router, prefix="/api/users", tags=["Login"])
app.include_router(area.router, prefix="/api", tags=["Areas"])
app.include_router(infrastructure.router, prefix="/api", tags=["Infrastructure"])
app.include_router(profile.router, prefix="/api", tags=["Profile"])
app.include_router(scoring.router, prefix="/api", tags=["Scoring"])
app.include_router(map_view.router, prefix="/api", tags=["Map View"])
app.include_router(market.router, prefix="/api", tags=["Market"])
# ----------------------------------
# Health Check Route (Production Must)
# ----------------------------------

@app.get("/health", tags=["Health"])
async def health_check():
    logging.info("Health endpoint was called")
    return {
        
        "success": True,
        "message": "API is running"
    }
