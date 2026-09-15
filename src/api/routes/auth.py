# src/api/routes/auth.py

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from passlib.context import CryptContext

from datetime import datetime, timedelta
import secrets

from src.core.database import get_db
from src.core.auth import create_access_token
from src.core.security import hash_password

from src.models.users import User

from src.api.schemas.auth import (
    LoginRequest,
    LoginResponse,
    ForgotPasswordRequest,
    ResetPasswordRequest,
)

from src.api.services.email_service import (
    send_password_reset_email
)


router = APIRouter()


# =========================================================
# PASSWORD HASHING
# =========================================================

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


# =========================================================
# LOGIN
# =========================================================

@router.post(
    "/login",
    response_model=LoginResponse
)
async def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):

    # =====================================================
    # FIND USER
    # =====================================================

    user = (
        db.query(User)
        .filter(
            User.username == login_data.username
        )
        .first()
    )

    # =====================================================
    # USER NOT FOUND
    # =====================================================

    if user is None:

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # =====================================================
    # CHECK ACCOUNT STATUS
    # =====================================================

    if not user.is_active:

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated.",
        )

    # =====================================================
    # VERIFY PASSWORD
    # =====================================================

    if not pwd_context.verify(
        login_data.password,
        user.password
    ):

        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )

    # =====================================================
    # CREATE JWT TOKEN
    # =====================================================

    access_token = create_access_token({

        "sub": str(user.user_id),

        "username": user.username,

        "role": user.role,

        "user_id": user.user_id,

    })

    # =====================================================
    # RETURN LOGIN RESPONSE
    # =====================================================

    return LoginResponse(

        access_token=access_token,

        token_type="bearer",

        user_id=user.user_id,

        username=user.username,

        role=user.role,

    )


# =========================================================
# FORGOT PASSWORD
# =========================================================

@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):

    # =====================================================
    # FIND USER BY EMAIL
    # =====================================================

    user = (
        db.query(User)
        .filter(
            User.email_address == data.email_address
        )
        .first()
    )

    # =====================================================
    # SECURITY
    # =====================================================
    # Do not reveal whether the email exists.

    if user is None:

        return {
            "message": (
                "If the email address is registered, "
                "a password reset link has been sent."
            )
        }

    # =====================================================
    # GENERATE SECURE RESET TOKEN
    # =====================================================

    token = secrets.token_urlsafe(32)

    # =====================================================
    # SET TOKEN
    # =====================================================

    user.reset_token = token

    # =====================================================
    # TOKEN EXPIRES AFTER 30 MINUTES
    # =====================================================

    user.reset_token_expires = (
        datetime.utcnow()
        + timedelta(minutes=30)
    )

    # =====================================================
    # SAVE TOKEN
    # =====================================================

    db.commit()

    # =====================================================
    # CREATE FRONTEND RESET LINK
    # =====================================================

    reset_link = (
    "http://127.0.0.1:5500/frontend/"
    "reset-password.html"
    f"?token={token}"
)

    # =====================================================
    # SEND RESET EMAIL THROUGH BREVO
    # =====================================================

    try:

        await send_password_reset_email(
            recipient_email=user.email_address,
            reset_link=reset_link,
        )

    except Exception as e:

        # Roll back database transaction
        db.rollback()

        print(
            "PASSWORD RESET EMAIL ERROR:",
            str(e)
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to send password reset email.",
        )

    # =====================================================
    # RESPONSE
    # =====================================================

    return {
        "message": (
            "If the email address is registered, "
            "a password reset link has been sent."
        )
    }


# =========================================================
# RESET PASSWORD
# =========================================================

@router.post("/reset-password")
def reset_password(
    data: ResetPasswordRequest,
    db: Session = Depends(get_db)
):

    # =====================================================
    # FIND USER USING RESET TOKEN
    # =====================================================

    user = (
        db.query(User)
        .filter(
            User.reset_token == data.token
        )
        .first()
    )

    # =====================================================
    # INVALID TOKEN
    # =====================================================

    if user is None:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset link.",
        )

    # =====================================================
    # CHECK TOKEN EXPIRATION
    # =====================================================

    if (
        user.reset_token_expires is None
        or user.reset_token_expires < datetime.utcnow()
    ):

        # -------------------------------------------------
        # CLEAR EXPIRED TOKEN
        # -------------------------------------------------

        user.reset_token = None

        user.reset_token_expires = None

        db.commit()

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired password reset link.",
        )

    # =====================================================
    # CHECK PASSWORD LENGTH
    # =====================================================

    if len(data.new_password) < 8:

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters.",
        )

    # =====================================================
    # HASH NEW PASSWORD
    # =====================================================

    user.password = hash_password(
        data.new_password
    )

    # =====================================================
    # CLEAR RESET TOKEN
    # =====================================================

    user.reset_token = None

    user.reset_token_expires = None

    # =====================================================
    # SAVE NEW PASSWORD
    # =====================================================

    db.commit()

    # =====================================================
    # RESPONSE
    # =====================================================

    return {
        "message": "Password reset successfully."
    }