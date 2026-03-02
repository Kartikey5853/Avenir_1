from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta
import logging

from app.database import get_db
from app.models.auth import User
from app.models.otp import OTP
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.utils.security import hash_password, verify_password
from app.utils.jwt import create_access_token, get_current_user
from app.utils.otp import generate_otp
from passlib.context import CryptContext

router = APIRouter()


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(payload: RegisterRequest, db: Session = Depends(get_db)):
    logging.info(f"Register attempt for email: {payload.email}")
    try:

        existing_user = db.query(User).filter(
            User.email == payload.email.lower()
        ).first()

        if existing_user:
            logging.warning(f"Registration failed: Email already registered: {payload.email}")
            raise HTTPException(
                status_code=400,
                detail="Email already registered"
            )

        new_user = User(
            name=payload.name.strip(),
            email=payload.email.lower(),
            password_hash=hash_password(payload.password),
            email_verified=False,
            two_factor_enabled=False
        )


        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        logging.info(f"User registered successfully: {new_user.email}")

        # Delete old verification OTP
        db.query(OTP).filter(
            OTP.user_id == new_user.id,
            OTP.purpose == "email_verification"
        ).delete()
        db.commit()

        verification_code = generate_otp()

        otp_entry = OTP(
            user_id=new_user.id,
            otp_code=verification_code,
            purpose="email_verification",
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            attempts=0,
            locked_until=None
        )

        db.add(otp_entry)
        db.commit()

        logging.info(
            f"Verification OTP for {new_user.email}: {verification_code}"
        )

        logging.info(f"Registration process completed for {new_user.email}")
        return {
            "success": True,
            "message": "Registration successful. Please verify your email before logging in."
        }

    except HTTPException as e:
        logging.warning(f"Registration HTTPException: {e.detail}")
        raise

    except IntegrityError:
        db.rollback()
        logging.error(f"Registration IntegrityError for {payload.email}")
        raise HTTPException(
            status_code=400,
            detail="Registration conflict"
        )

    except Exception as e:
        db.rollback()
        logging.error(f"Register error: {str(e)} for email: {payload.email}")
        raise HTTPException(
            status_code=500,
            detail="Registration failed"
        )
    

@router.post("/verify-email")
def verify_email(email: str, otp_code: str, db: Session = Depends(get_db)):
    logging.info(f"Email verification attempt for: {email}")
    try:

        user = db.query(User).filter(
            User.email == email.lower()
        ).first()


        if not user:
            logging.warning(f"Email verification failed: user not found for {email}")
            raise HTTPException(status_code=400, detail="Invalid request")


        if user.email_verified:
            logging.info(f"Email already verified for {email}")
            return {"success": True, "message": "Email already verified"}


        otp_entry = db.query(OTP).filter(
            OTP.user_id == user.id,
            OTP.purpose == "email_verification"
        ).first()


        if not otp_entry:
            logging.warning(f"Email verification failed: OTP not found for {email}")
            raise HTTPException(status_code=400, detail="Invalid or expired code")


        if otp_entry.locked_until and otp_entry.locked_until > datetime.utcnow():
            logging.warning(f"Email verification locked for {email}")
            raise HTTPException(
                status_code=403,
                detail="Too many failed attempts. Try again later."
            )


        if otp_entry.expires_at < datetime.utcnow():
            db.delete(otp_entry)
            db.commit()
            logging.warning(f"Email verification failed: OTP expired for {email}")
            raise HTTPException(status_code=400, detail="Code expired")


        if otp_entry.otp_code != otp_code:
            otp_entry.attempts += 1
            if otp_entry.attempts >= otp_entry.max_attempts:
                otp_entry.locked_until = datetime.utcnow() + timedelta(minutes=10)
            db.commit()
            logging.warning(f"Email verification failed: Invalid code for {email}")
            raise HTTPException(status_code=400, detail="Invalid code")


        user.email_verified = True
        db.delete(otp_entry)
        db.commit()
        logging.info(f"Email verified successfully for {email}")
        return {"success": True, "message": "Email verified successfully"}

    except HTTPException as e:
        logging.warning(f"Email verification HTTPException for {email}: {e.detail}")
        raise

    except Exception as e:
        db.rollback()
        logging.error(f"Verify email error: {str(e)} for {email}")
        raise HTTPException(
            status_code=500,
            detail="Verification failed"
        )
    


    # OTP hashing context
otp_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/login")
def login_user(payload: LoginRequest, db: Session = Depends(get_db)):
    logging.info(f"Login attempt for email: {payload.email}")
    try:

        user = db.query(User).filter(
            User.email == payload.email.lower()
        ).first()


        if not user or not verify_password(payload.password, user.password_hash):
            logging.warning(f"Login failed: Invalid credentials for {payload.email}")
            raise HTTPException(status_code=400, detail="Invalid credentials")

        # 🔴 ENFORCE EMAIL VERIFICATION

        if not user.email_verified:
            logging.warning(f"Login failed: Email not verified for {payload.email}")
            raise HTTPException(
                status_code=403,
                detail="Please verify your email before logging in."
            )

        # If 2FA enabled → send OTP

        if user.two_factor_enabled:
            # Delete previous login OTP
            db.query(OTP).filter(
                OTP.user_id == user.id,
                OTP.purpose == "login_2fa"
            ).delete()
            db.commit()
            otp_code = generate_otp()
            # 🔐 Hash OTP before storing
            hashed_otp = otp_context.hash(otp_code)
            otp_entry = OTP(
                user_id=user.id,
                otp_code=hashed_otp,
                purpose="login_2fa",
                expires_at=datetime.utcnow() + timedelta(minutes=5),
                attempts=0,
                locked_until=None
            )
            db.add(otp_entry)
            db.commit()
            logging.info(f"2FA OTP for {user.email}: {otp_code}")
            return {
                "success": True,
                "message": "OTP required for login",
                "otp_required": True
            }

        # If 2FA disabled → issue JWT

        access_token = create_access_token({"sub": str(user.id)})
        logging.info(f"Login successful for {payload.email}")
        return TokenResponse(
            access_token=access_token,
            user=user
        )

    except HTTPException as e:
        logging.warning(f"Login HTTPException for {payload.email}: {e.detail}")
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"Login error: {str(e)} for {payload.email}")
        raise HTTPException(status_code=500, detail="Login failed")
    

@router.post("/verify-login-otp")
def verify_login_otp(email: str, otp_code: str, db: Session = Depends(get_db)):
    logging.info(f"Login OTP verification attempt for: {email}")
    try:

        user = db.query(User).filter(
            User.email == email.lower()
        ).first()


        if not user:
            logging.warning(f"Login OTP verification failed: user not found for {email}")
            raise HTTPException(status_code=400, detail="Invalid OTP")


        otp_entry = db.query(OTP).filter(
            OTP.user_id == user.id,
            OTP.purpose == "login_2fa"
        ).first()


        if not otp_entry:
            logging.warning(f"Login OTP verification failed: OTP not found for {email}")
            raise HTTPException(status_code=400, detail="Invalid OTP")

        # 🔐 Lock check

        if otp_entry.locked_until and otp_entry.locked_until > datetime.utcnow():
            logging.warning(f"Login OTP verification locked for {email}")
            raise HTTPException(
                status_code=403,
                detail="Too many failed attempts. Try again later."
            )

        # 🔐 Expiry check

        if otp_entry.expires_at < datetime.utcnow():
            db.delete(otp_entry)
            db.commit()
            logging.warning(f"Login OTP verification failed: OTP expired for {email}")
            raise HTTPException(status_code=400, detail="OTP expired")

        # 🔐 Verify hashed OTP

        if not otp_context.verify(otp_code, otp_entry.otp_code):
            otp_entry.attempts += 1
            if otp_entry.attempts >= otp_entry.max_attempts:
                otp_entry.locked_until = datetime.utcnow() + timedelta(minutes=10)
            db.commit()
            logging.warning(f"Login OTP verification failed: Invalid OTP for {email}")
            raise HTTPException(status_code=400, detail="Invalid OTP")

        # ✅ Success

        db.delete(otp_entry)
        db.commit()
        access_token = create_access_token({"sub": str(user.id)})
        logging.info(f"Login OTP verified and access token issued for {email}")
        return TokenResponse(
            access_token=access_token,
            user=user
        )

    except HTTPException as e:
        logging.warning(f"Login OTP verification HTTPException for {email}: {e.detail}")
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"OTP verification error: {str(e)} for {email}")
        raise HTTPException(status_code=500, detail="OTP verification failed")
    
@router.post("/enable-2fa")
def enable_2fa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logging.info(f"Enable 2FA attempt for user: {current_user.email}")
    if not current_user.email_verified:
        logging.warning(f"Enable 2FA failed: email not verified for {current_user.email}")
        raise HTTPException(status_code=400, detail="Verify email first")
    current_user.two_factor_enabled = True
    db.commit()
    logging.info(f"2FA enabled for user: {current_user.email}")
    return {"success": True, "message": "2FA enabled"}