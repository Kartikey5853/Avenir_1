

import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)

# Get database URL from environment variable, fallback to SQLite
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./app.db")

try:
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
        pool_pre_ping=True,  # helps with stale connections
    )
    logger.info(f"Database engine created for {DATABASE_URL}")
except SQLAlchemyError as e:
    logger.error(f"Error creating database engine: {e}")
    raise

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()

def get_db():
    """
    Dependency for routes. Yields a database session and ensures it is closed.
    Handles and logs any errors during session usage.
    """
    db = SessionLocal()
    try:
        yield db
    except SQLAlchemyError as e: # checking for a session error here 
        logger.error(f"Database session error: {e}")
        raise
    finally:
        db.close()