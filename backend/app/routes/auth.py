from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timedelta
import logging
import secrets
import requests as req_lib
from pydantic import BaseModel

from app.database import get_db
from app.models.auth import User
from app.models.otp import OTP
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.utils.security import hash_password, verify_password
from app.utils.jwt import create_access_token, get_current_user
from app.utils.otp import generate_otp
from app.utils.email import send_otp_email

router = APIRouter()


# ── Google OAuth ──────────────────────────────────────────────────────────────

class GoogleLoginRequest(BaseModel):
    token: str  # Google OAuth access_token (implicit flow)


@router.post("/google-login")
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    """
    Accept a Google access_token from the frontend (implicit flow),
    verify it via Google UserInfo endpoint, and return our own JWT.
    """
    r = req_lib.get(
        "https://www.googleapis.com/oauth2/v1/userinfo",
        params={"access_token": payload.token},
        timeout=10,
    )
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid Google token")

    info = r.json()
    email = info.get("email", "").lower()
    if not email:
        raise HTTPException(status_code=400, detail="Google account has no email")

    name = info.get("name") or email.split("@")[0]

    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(
            name=name,
            email=email,
            password_hash=hash_password(secrets.token_urlsafe(32)),
            email_verified=True,
            two_factor_enabled=True,  # 2FA on by default
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        logging.info("Google OAuth: new user created — %s", email)
    else:
        if not user.email_verified:
            user.email_verified = True
            db.commit()
        logging.info("Google OAuth: existing user logged in — %s", email)

    access_token = create_access_token({"sub": str(user.id), "email": user.email})
    is_completed = bool(getattr(user, "is_profile_completed", False))
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_profile_completed": is_completed,
        },
    }


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
            two_factor_enabled=True  # 2FA on by default
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

        # Send OTP via email
        try:
            send_otp_email(new_user.email, verification_code, purpose="email_verification")
        except Exception as email_err:
            logging.error(f"Could not send verification email to {new_user.email}: {email_err}")
            # Don't fail registration if email sending fails

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
    


    # OTP comparison uses plain text (OTP is a short-lived 6-digit code)


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
            # Store plain 6-digit OTP (VARCHAR(6) safe, short-lived)
            otp_entry = OTP(
                user_id=user.id,
                otp_code=otp_code,
                purpose="login_2fa",
                expires_at=datetime.utcnow() + timedelta(minutes=5),
                attempts=0,
                locked_until=None
            )
            db.add(otp_entry)
            db.commit()
            logging.info(f"2FA OTP for {user.email}: {otp_code}")

            # Send 2FA OTP via email
            try:
                send_otp_email(user.email, otp_code, purpose="login_2fa")
            except Exception as email_err:
                logging.error(f"Could not send 2FA email to {user.email}: {email_err}")

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

        # Verify plain OTP

        if otp_code != otp_entry.otp_code:
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
    current_user.two_factor_enabled = True
    db.commit()
    logging.info(f"2FA enabled for user: {current_user.email}")
    return {"success": True, "message": "2FA enabled"}


# ── Supabase-specific auth endpoints ─────────────────────────────────────────

@router.get("/me")
def get_me(
    current_user: User = Depends(get_current_user),
):
    """Return current user info — works with both own JWTs and Supabase JWTs."""
    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "two_factor_enabled": current_user.two_factor_enabled,
        "is_profile_completed": bool(getattr(current_user, "is_profile_completed", False)),
        "email_verified": current_user.email_verified,
    }


@router.post("/supabase-trigger-2fa")
def supabase_trigger_2fa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Called after a successful Supabase sign-in when user has 2FA enabled.
    Sends a 6-digit OTP email and returns otp_required flag.
    """
    if not current_user.two_factor_enabled:
        return {"otp_required": False}

    db.query(OTP).filter(
        OTP.user_id == current_user.id,
        OTP.purpose == "login_2fa",
    ).delete()
    db.commit()

    otp_code = generate_otp()
    otp_entry = OTP(
        user_id=current_user.id,
        otp_code=otp_code,
        purpose="login_2fa",
        expires_at=datetime.utcnow() + timedelta(minutes=5),
        attempts=0,
        locked_until=None,
    )
    db.add(otp_entry)
    db.commit()
    logging.info(f"Supabase 2FA OTP sent for {current_user.email}")

    try:
        send_otp_email(current_user.email, otp_code, purpose="login_2fa")
    except Exception as email_err:
        logging.error(f"Could not send Supabase 2FA email: {email_err}")

    return {"otp_required": True}


@router.post("/supabase-verify-2fa")
def supabase_verify_2fa(
    otp_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Verify the 2FA OTP for a Supabase-authenticated user.
    Returns user info on success (frontend keeps the Supabase JWT).
    """
    otp_entry = db.query(OTP).filter(
        OTP.user_id == current_user.id,
        OTP.purpose == "login_2fa",
    ).first()

    if not otp_entry:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    if otp_entry.locked_until and otp_entry.locked_until > datetime.utcnow():
        raise HTTPException(status_code=403, detail="Too many failed attempts. Try again later.")

    if otp_entry.expires_at < datetime.utcnow():
        db.delete(otp_entry)
        db.commit()
        raise HTTPException(status_code=400, detail="OTP expired")

    if otp_code != otp_entry.otp_code:
        otp_entry.attempts += 1
        if otp_entry.attempts >= otp_entry.max_attempts:
            otp_entry.locked_until = datetime.utcnow() + timedelta(minutes=10)
        db.commit()
        raise HTTPException(status_code=400, detail="Invalid OTP")

    db.delete(otp_entry)
    db.commit()
    logging.info(f"Supabase 2FA verified for {current_user.email}")

    return {
        "success": True,
        "user": {
            "id": current_user.id,
            "name": current_user.name,
            "email": current_user.email,
            "is_profile_completed": bool(getattr(current_user, "is_profile_completed", False)),
        },
    }


@router.post("/disable-2fa")
def disable_2fa(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logging.info(f"Disable 2FA attempt for user: {current_user.email}")
    current_user.two_factor_enabled = False
    db.commit()
    logging.info(f"2FA disabled for user: {current_user.email}")
    return {"success": True, "message": "2FA disabled"}


@router.post("/resend-verification")
def resend_verification(
    email: str,
    db: Session = Depends(get_db)
):
    """Resend email verification OTP for a user who hasn't verified yet."""
    logging.info(f"Resend verification OTP request for: {email}")
    try:
        user = db.query(User).filter(User.email == email.lower()).first()
        if not user:
            # Don't reveal whether the user exists
            return {"success": True, "message": "If the account exists, a new code has been sent."}

        if user.email_verified:
            return {"success": True, "message": "Email is already verified."}

        # Delete old OTP
        db.query(OTP).filter(
            OTP.user_id == user.id,
            OTP.purpose == "email_verification"
        ).delete()
        db.commit()

        new_code = generate_otp()
        otp_entry = OTP(
            user_id=user.id,
            otp_code=new_code,
            purpose="email_verification",
            expires_at=datetime.utcnow() + timedelta(minutes=10),
            attempts=0,
            locked_until=None,
        )
        db.add(otp_entry)
        db.commit()

        try:
            send_otp_email(user.email, new_code, purpose="email_verification")
        except Exception as email_err:
            logging.error(f"Could not resend verification email to {user.email}: {email_err}")

        return {"success": True, "message": "If the account exists, a new code has been sent."}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"Resend verification error: {e}")
        raise HTTPException(status_code=500, detail="Could not resend code")


@router.post("/forgot-password")
def forgot_password(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Step 1 of OTP-based password reset.
    Accepts {"email": "..."}.
    Creates a password_reset OTP and emails it to the user.
    Always returns success to avoid revealing user existence.
    """
    email = payload.get("email", "").strip().lower()
    logging.info(f"Forgot password request for: {email}")
    try:
        user = db.query(User).filter(User.email == email).first()
        if user:
            # Delete old password_reset OTPs
            db.query(OTP).filter(
                OTP.user_id == user.id,
                OTP.purpose == "password_reset"
            ).delete()
            db.commit()

            reset_code = generate_otp()
            otp_entry = OTP(
                user_id=user.id,
                otp_code=reset_code,
                purpose="password_reset",
                expires_at=datetime.utcnow() + timedelta(minutes=10),
                attempts=0,
                locked_until=None,
            )
            db.add(otp_entry)
            db.commit()

            logging.info(f"Password reset OTP for {user.email}: {reset_code}")

            try:
                send_otp_email(user.email, reset_code, purpose="password_reset")
            except Exception as email_err:
                logging.error(f"Could not send password reset email to {user.email}: {email_err}")

        return {"success": True, "message": "If an account with that email exists, a reset code has been sent."}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"Forgot password error: {e}")
        raise HTTPException(status_code=500, detail="Could not process request")


@router.post("/reset-password-otp")
def reset_password_otp(
    payload: dict,
    db: Session = Depends(get_db)
):
    """
    Step 2 of OTP-based password reset.
    Accepts {"email": "...", "otp_code": "...", "new_password": "..."}.
    Verifies the OTP and updates the user's password.
    """
    email = payload.get("email", "").strip().lower()
    otp_code = payload.get("otp_code", "").strip()
    new_password = payload.get("new_password", "").strip()

    logging.info(f"Password reset OTP verify attempt for: {email}")
    try:
        if not email or not otp_code or not new_password:
            raise HTTPException(status_code=400, detail="email, otp_code, and new_password are required")

        if len(new_password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")

        user = db.query(User).filter(User.email == email).first()
        if not user:
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        otp_entry = db.query(OTP).filter(
            OTP.user_id == user.id,
            OTP.purpose == "password_reset"
        ).first()

        if not otp_entry:
            raise HTTPException(status_code=400, detail="Invalid or expired code")

        if otp_entry.locked_until and otp_entry.locked_until > datetime.utcnow():
            raise HTTPException(status_code=403, detail="Too many failed attempts. Try again later.")

        if otp_entry.expires_at < datetime.utcnow():
            db.delete(otp_entry)
            db.commit()
            raise HTTPException(status_code=400, detail="Code expired")

        if otp_entry.otp_code != otp_code:
            otp_entry.attempts += 1
            if otp_entry.attempts >= otp_entry.max_attempts:
                otp_entry.locked_until = datetime.utcnow() + timedelta(minutes=10)
            db.commit()
            raise HTTPException(status_code=400, detail="Invalid code")

        # ✅ Valid – update password and delete OTP
        user.password_hash = hash_password(new_password)
        db.delete(otp_entry)
        db.commit()

        logging.info(f"Password reset successful for {email}")
        return {"success": True, "message": "Password reset successfully. You can now log in."}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logging.error(f"Reset password OTP error: {e}")
        raise HTTPException(status_code=500, detail="Password reset failed")