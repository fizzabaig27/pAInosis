"""
routers/auth.py
FastAPI endpoints for login, registration, logout, session checking, and Google OAuth.
"""

from fastapi import APIRouter, HTTPException, Header, Request, Form, File, UploadFile
from pydantic import BaseModel, EmailStr
from typing import Optional
from modules import auth, email_service
from modules.database import execute_query
import os
import uuid


router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request/response schemas ────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str
    full_name: str
    role: str
    pmdc_license_number: Optional[str] = None
    pmdc_license_file_path: Optional[str] = None


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


class VerifyEmailRequest(BaseModel):
    token: str


class GoogleAuthRequest(BaseModel):
    credential: str


UPLOAD_DIR = "uploads/pmdc_licenses"
os.makedirs(UPLOAD_DIR, exist_ok=True)


# ── Endpoints ────────────────────────────────────────────────────

@router.post("/login")
async def login_endpoint(payload: LoginRequest, request: Request):
    client_ip = request.client.host if request.client else "unknown"

    success, message, user_data = auth.login(
        payload.username, payload.password, ip_address=client_ip
    )

    if not success:
        return {"success": False, "message": message}

    return {
        "success": True,
        "message": message,
        "token": user_data["token"],
        "user": {
            "user_id": user_data["user_id"],
            "username": user_data["username"],
            "full_name": user_data["full_name"],
            "role": user_data["role"],
        },
    }


@router.post("/register")
async def register_endpoint(
    username: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    full_name: str = Form(...),
    role: str = Form(...),
    pmdc_license_number: Optional[str] = Form(None),
    pmdc_license_file: Optional[UploadFile] = File(None),
):
    license_file_path = None

    if pmdc_license_file:
        ext = os.path.splitext(pmdc_license_file.filename)[1]
        safe_filename = f"{uuid.uuid4()}{ext}"
        license_file_path = os.path.join(UPLOAD_DIR, safe_filename)

        contents = await pmdc_license_file.read()
        with open(license_file_path, "wb") as f:
            f.write(contents)

    success, message, verification_token = auth.register_user(
        username=username,
        email=email,
        password=password,
        full_name=full_name,
        role=role,
        pmdc_license_number=pmdc_license_number,
        pmdc_license_file_path=license_file_path,
    )

    if success and verification_token:
        email_service.send_verification_email(email, username, verification_token)

    return {"success": success, "message": message}


@router.post("/logout")
async def logout_endpoint(authorization: Optional[str] = Header(None)):
    token = _extract_token(authorization)
    valid, message, user_data = auth.validate_session(token)

    if valid:
        auth.logout(user_data["user_id"], user_data["username"], user_data["role"])

    return {"success": True, "message": "Logged out."}


@router.get("/me")
async def get_current_user_endpoint(authorization: Optional[str] = Header(None)):
    """
    Called on page load / app startup to check if the stored token is still valid.
    Lets the frontend restore a logged-in session after a page refresh.
    """
    token = _extract_token(authorization)
    valid, message, user_data = auth.validate_session(token)

    if not valid:
        raise HTTPException(status_code=401, detail=message)

    return {"success": True, "user": user_data}


@router.post("/forgot-password")
async def forgot_password_endpoint(payload: ForgotPasswordRequest):
    success, message, token = auth.create_password_reset_token(payload.email)

    if token:
        user = execute_query(
            "SELECT username FROM users WHERE email = %s", (payload.email,), fetch_one=True
        )
        email_service.send_password_reset_email(payload.email, user["username"], token)

    return {"success": success, "message": message}


@router.post("/reset-password")
async def reset_password_endpoint(payload: ResetPasswordRequest):
    success, message = auth.reset_password_with_token(payload.token, payload.new_password)
    return {"success": success, "message": message}


@router.post("/verify-email")
async def verify_email_endpoint(payload: VerifyEmailRequest):
    success, message, user_data = auth.verify_email_token(payload.token)

    if not success:
        return {"success": False, "message": message}

    response = {
        "success": True,
        "message": message,
        "role": user_data["role"],
        "needs_approval": user_data["role"] in ("doctor", "radiologist"),
    }

    # Researchers get auto-logged-in immediately
    if "auto_login_token" in user_data:
        response["token"] = user_data["auto_login_token"]
        response["user"] = {
            "user_id": user_data["user_id"],
            "username": user_data["username"],
            "full_name": user_data["full_name"],
            "role": user_data["role"],
        }

    return response


@router.post("/google")
async def google_auth_endpoint(payload: GoogleAuthRequest):
    google_info = auth.verify_google_token(payload.credential)

    if not google_info:
        raise HTTPException(status_code=401, detail="Invalid Google token.")

    if not google_info["email_verified"]:
        raise HTTPException(status_code=401, detail="Google account email is not verified.")

    status, data = auth.login_or_signal_google(google_info)

    if status == "error":
        return {"success": False, "message": data["message"]}

    if status == "logged_in":
        return {
            "success": True,
            "status": "logged_in",
            "token": data["token"],
            "user": {
                "user_id": data["user_id"],
                "username": data["username"],
                "full_name": data["full_name"],
                "role": data["role"],
            },
        }

    # status == "needs_profile"
    return {
        "success": True,
        "status": "needs_profile",
        "email": data["email"],
        "full_name": data["full_name"],
        "google_id": data["google_id"],
    }


@router.post("/google/complete-profile")
async def complete_google_profile_endpoint(
    email: str = Form(...),
    google_id: str = Form(...),
    username: str = Form(...),
    full_name: str = Form(...),
    role: str = Form(...),
    pmdc_license_number: Optional[str] = Form(None),
    pmdc_license_file: Optional[UploadFile] = File(None),
):
    if role not in ("doctor", "radiologist", "researcher"):
        raise HTTPException(status_code=400, detail="Invalid role.")

    license_file_path = None
    if pmdc_license_file:
        ext = os.path.splitext(pmdc_license_file.filename)[1]
        safe_filename = f"{uuid.uuid4()}{ext}"
        license_file_path = os.path.join(UPLOAD_DIR, safe_filename)
        contents = await pmdc_license_file.read()
        with open(license_file_path, "wb") as f:
            f.write(contents)

    success, message, result = auth.complete_google_signup(
        email=email,
        google_id=google_id,
        username=username,
        full_name=full_name,
        role=role,
        pmdc_license_number=pmdc_license_number,
        pmdc_license_file_path=license_file_path,
    )

    if not success:
        return {"success": False, "message": message}

    return {"success": True, "message": message, **result}


# ── Helper ─────────────────────────────────────────────────────

def _extract_token(authorization: Optional[str]) -> Optional[str]:
    """Extracts the raw token from an 'Authorization: Bearer <token>' header."""
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.replace("Bearer ", "", 1)


def get_current_user_dependency(authorization: Optional[str] = Header(None)) -> dict:
    """
    Reusable FastAPI dependency for protecting other routers' endpoints.
    """
    token = _extract_token(authorization)
    valid, message, user_data = auth.validate_session(token)
    if not valid:
        raise HTTPException(status_code=401, detail=message)
    return user_data