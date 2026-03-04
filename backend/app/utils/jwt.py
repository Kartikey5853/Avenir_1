import re
from app.config import settings
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.auth import User

if not settings.SECRET_KEY:
    raise ValueError("SECRET_KEY is not set in environment variables")

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="login")

_UUID_RE = re.compile(
    r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
    re.IGNORECASE,
)


def _decode_token(token: str):
    """Try our own SECRET_KEY first, then Supabase JWT secret."""
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
    except JWTError:
        pass
    if settings.SUPABASE_JWT_SECRET:
        try:
            return jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except JWTError:
            pass
    return None


def _user_from_payload(payload: dict, db: Session):
    """
    Resolve backend User from decoded JWT.
    - Own JWT:      sub = integer string  -> look up by id
    - Supabase JWT: sub = UUID string     -> look up/create by email
    """
    sub = str(payload.get("sub", ""))
    if not sub:
        return None

    if _UUID_RE.match(sub):
        email = (payload.get("email") or "").lower()
        if not email:
            return None
        user = db.query(User).filter(User.email == email).first()
        if not user:
            from app.utils.security import hash_password
            import secrets as _sec
            user = User(
                name=email.split("@")[0],
                email=email,
                password_hash=hash_password(_sec.token_urlsafe(32)),
                email_verified=True,
                two_factor_enabled=True,
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    try:
        return db.query(User).filter(User.id == int(sub)).first()
    except ValueError:
        return None


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def verify_token(token: str):
    return _decode_token(token)


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    payload = _decode_token(token)
    if payload is None:
        raise credentials_exception
    user = _user_from_payload(payload, db)
    if user is None:
        raise credentials_exception
    return user


def get_optional_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    if not token:
        return None
    payload = _decode_token(token)
    if payload is None:
        return None
    return _user_from_payload(payload, db)
