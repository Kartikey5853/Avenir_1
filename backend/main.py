
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging

#models
from .database import Base, engine
#from app.models.user import User
#from app.models.otp import OTP
#from app.models.profile import UserProfile
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

# Routers
#from app.routers import users  
#from app.routers import login  


Base.metadata.create_all(bind=engine)
# ----------------------------------
# Logging Configuration 
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

#app.include_router(users.router, prefix="/api/users", tags=["Users"])
#app.include_router(login.router, prefix="/api/users", tags=["Login"])
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