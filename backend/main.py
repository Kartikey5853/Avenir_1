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

# Routers
from app.routes import auth  



Base.metadata.create_all(bind=engine)
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

# CORS middleware: allow all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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


app.include_router(auth.router, prefix="/api/users", tags=["Login"])
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