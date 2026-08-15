"""
modules/auth.py
Core auth business logic — password hashing, JWT tokens, and role permissions.
This module is framework-agnostic: it takes inputs and returns data/exceptions,
it does not touch any session state directly. routers/auth.py wires this into
actual FastAPI endpoints.
"""

import os
import bcrypt
import jwt
from datetime import datetime, timedelta
from modules.database import get_db_connection, execute_query, execute_write
from modules.audit import log_action, LOGIN_SUCCESS, LOGIN_FAILED, LOGOUT, SESSION_EXPIRED, ACCESS_DENIED
from dotenv import load_dotenv
import secrets
import dns.resolver

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_secret_change_this")
SESSION_TIMEOUT_MINUTES = 30


# ── Role permission map ────────────────────────────────────────
ROLE_PERMISSIONS = {
    "admin": {
        "pages": ["upload", "admin", "audit_log"],
        "can_generate_report":  False,
        "can_download_report":  False,
        "can_diagnose":         False,
        "can_enhance":          False,
        "can_view_history":     False,
        "can_manage_users":     True,
        "can_view_audit":       True,
        "can_approve_users":    True,
    },
    "doctor": {
        "pages": ["upload", "results", "history"],
        "can_generate_report":  True,
        "can_download_report":  True,
        "can_diagnose":         True,
        "can_enhance":          True,
        "can_view_history":     True,
        "can_manage_users":     False,
        "can_view_audit":       False,
        "can_approve_users":    False,
    },
    "radiologist": {
        "pages": ["upload", "results", "history"],
        "can_generate_report":  True,
        "can_download_report":  True,
        "can_diagnose":         True,
        "can_enhance":          True,
        "can_view_history":     True,
        "can_manage_users":     False,
        "can_view_audit":       False,
        "can_approve_users":    False,
    },
    "researcher": {
        "pages": ["upload", "results"],
        "can_generate_report":  False,
        "can_download_report":  False,
        "can_diagnose":         True,
        "can_enhance":          True,
        "can_view_history":     False,
        "can_manage_users":     False,
        "can_view_audit":       False,
        "can_approve_users":    False,
    },
}


# ── Password helpers ───────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


# ── JWT helpers ────────────────────────────────────────────────

def generate_token(user_id: int) -> str:
    payload = {
        "user_id": user_id,
        "iat": datetime.utcnow(),
        "exp": datetime.utcnow() + timedelta(minutes=SESSION_TIMEOUT_MINUTES),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

#_____________dns helper
def domain_has_mail_server(email: str) -> bool:
    print(f"DEBUG: Checking domain for {email}")
    try:
        domain = email.split("@")[1]
        answers = dns.resolver.resolve(domain, "MX", lifetime=5)
        print(f"DEBUG: Found {len(answers)} MX records for {domain}")
        return len(answers) > 0
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers, IndexError) as e:
        print(f"DEBUG: No mail server found — {type(e).__name__}")
        return False
    except Exception as e:
        print(f"DEBUG: Unexpected error — {type(e).__name__}: {e}")
        return True
# ── Registration ───────────────────────────────────────────────

def register_user(
    username: str,
    email: str,
    password: str,
    full_name: str,
    role: str,
    pmdc_license_number: str = None,
    pmdc_license_file_path: str = None,
) -> tuple[bool, str, str | None]:
    if not domain_has_mail_server(email):
        return False, "This email domain doesn't appear to accept mail. Please check for typos.", None

    existing = execute_query(
        "SELECT id FROM users WHERE username = %s OR email = %s",
        (username, email),
        fetch_one=True
    )
    if existing:
        return False, "Username or email already exists.", None

    password_hash = hash_password(password)
    is_approved = True if role == "researcher" else False

    verification_token = secrets.token_urlsafe(32)
    verification_expiry = datetime.utcnow() + timedelta(minutes=30)

    try:
        execute_write(
            """
            INSERT INTO users
                (username, email, password_hash, full_name, role,
                pmdc_license_number, pmdc_license_file_path, is_approved, is_active,
                email_verified, verification_token, verification_token_expiry)
            VALUES
                (%s, %s, %s, %s, %s, %s, %s, %s, TRUE, FALSE, %s, %s)
            """,
            (username, email, password_hash, full_name, role,
            pmdc_license_number, pmdc_license_file_path, is_approved,
            verification_token, verification_expiry)
        )

        log_action(
            user_id=None, username=username, role=role, action="REGISTER",
            detail=f"New {role} registered. Awaiting email verification."
        )

        return True, "Registration successful. Please check your email to verify your account.", verification_token

    except Exception as e:
        return False, f"Registration failed: {str(e)}", None

#_________________ verify user
def verify_email_token(token: str) -> tuple[bool, str, dict | None]:
    """
    Validates a verification token and marks the account as verified.
    Returns (success, message, user_data). user_data includes role so the
    frontend knows where to route next; includes a login token if the role
    should be auto-logged-in (researcher).
    """
    user = execute_query(
        "SELECT id, username, full_name, role, verification_token_expiry FROM users WHERE verification_token = %s",
        (token,),
        fetch_one=True
    )

    if not user:
        return False, "Invalid or expired verification link.", None

    if user["verification_token_expiry"] < datetime.utcnow():
        return False, "This verification link has expired. Please sign up again or contact support.", None

    execute_write(
        "UPDATE users SET email_verified = TRUE, verification_token = NULL, verification_token_expiry = NULL WHERE id = %s",
        (user["id"],)
    )

    log_action(user["id"], user["username"], user["role"], "EMAIL_VERIFIED", "Email address verified")

    result = {
        "user_id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
    }

    if user["role"] == "researcher":
        login_token = generate_token(user["id"])
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET session_token = %s WHERE id = %s", (login_token, user["id"]))
        conn.commit()
        cursor.close()
        conn.close()
        result["auto_login_token"] = login_token

    return True, "Email verified successfully.", result

# ── Login ──────────────────────────────────────────────────────

def login(username: str, password: str, ip_address: str = "unknown") -> tuple[bool, str, dict | None]:
    """
    Authenticates a user.
    Returns (success, message, user_data) — user_data is None on failure,
    otherwise a dict with the JWT token and user info, ready to send to the frontend.
    """
    user = execute_query(
        """SELECT id, username, password_hash, full_name, role,
                is_approved, is_active, rejection_reason, email_verified
            FROM users WHERE username = %s""",
        (username,),
        fetch_one=True
    )

    if not user:
        log_action(None, username, "unknown", LOGIN_FAILED,
                f"Login attempt with unknown username: {username}", ip_address)
        return False, "Invalid username or password.", None

    if not verify_password(password, user["password_hash"]):
        log_action(user["id"], username, user["role"], LOGIN_FAILED,
                "Incorrect password", ip_address)
        return False, "Invalid username or password.", None

    if not user["email_verified"]:
        return False, "Please verify your email before logging in. Check your inbox.", None

    if not user["is_active"]:
        log_action(user["id"], username, user["role"], LOGIN_FAILED,
                "Login attempt on suspended account", ip_address)
        return False, "Your account has been suspended. Contact the admin.", None

    if user["role"] in ("doctor", "radiologist") and not user["is_approved"]:
        if user["rejection_reason"]:
            return False, f"Your registration was rejected. Reason: {user['rejection_reason']}", None
        return False, "Your PMDC license is pending admin verification. Please wait.", None

    # ── all checks passed — create session ──
    token = generate_token(user["id"])

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE users SET session_token = %s, last_login = %s WHERE id = %s",
        (token, datetime.utcnow(), user["id"])
    )
    conn.commit()
    cursor.close()
    conn.close()

    log_action(user["id"], username, user["role"], LOGIN_SUCCESS,
            "Logged in successfully", ip_address)

    user_data = {
        "token": token,
        "user_id": user["id"],
        "username": user["username"],
        "full_name": user["full_name"],
        "role": user["role"],
    }
    return True, "Login successful.", user_data
# ── Logout ─────────────────────────────────────────────────────

def logout(user_id: int, username: str, role: str) -> None:
    """Nulls the DB token so it can't be reused, logs the action."""
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("UPDATE users SET session_token = NULL WHERE id = %s", (user_id,))
    conn.commit()
    cursor.close()
    conn.close()

    log_action(user_id, username, role, LOGOUT, "User logged out")


# ── Session validation ─────────────────────────────────────────

def validate_session(token: str) -> tuple[bool, str, dict | None]:
    """
    Validates a JWT token against the database.
    Returns (valid, message, user_data). Called by routers on protected endpoints.
    """
    if not token:
        return False, "Not authenticated.", None

    payload = decode_token(token)
    if not payload:
        return False, "Your session has expired. Please log in again.", None

    user_id = payload["user_id"]

    db_user = execute_query(
        "SELECT id, username, full_name, role, session_token, is_active FROM users WHERE id = %s",
        (user_id,),
        fetch_one=True
    )

    if not db_user or db_user["session_token"] != token:
        return False, "Your session was ended. Please log in again.", None

    if not db_user["is_active"]:
        return False, "Your account has been suspended. Contact the admin.", None

    user_data = {
        "user_id": db_user["id"],
        "username": db_user["username"],
        "full_name": db_user["full_name"],
        "role": db_user["role"],
    }
    return True, "OK", user_data


def check_role(role: str, *allowed_roles: str) -> bool:
    """Returns True if role is in allowed_roles."""
    return role in allowed_roles


def has_permission(role: str, permission: str) -> bool:
    """Check a specific permission for a given role."""
    return ROLE_PERMISSIONS.get(role, {}).get(permission, False)


# ── password reseting  ─────────────────────────────────────────


def create_password_reset_token(email: str) -> tuple[bool, str, str | None]:
    """
    Generates a reset token for the given email if the account exists.
    Returns (success, message, token). Token is None if email not found —
    but we still return success=True to avoid leaking which emails are registered.
    """
    user = execute_query(
        "SELECT id, username FROM users WHERE email = %s",
        (email,),
        fetch_one=True
    )

    if not user:
        # Don't reveal whether this email exists — security best practice
        return True, "If that email is registered, a reset link has been sent.", None

    token = secrets.token_urlsafe(32)
    expiry = datetime.utcnow() + timedelta(minutes=30)

    execute_write(
        "UPDATE users SET reset_token = %s, reset_token_expiry = %s WHERE id = %s",
        (token, expiry, user["id"])
    )

    return True, "If that email is registered, a reset link has been sent.", token


def reset_password_with_token(token: str, new_password: str) -> tuple[bool, str]:
    """Validates a reset token and updates the password if valid."""
    if len(new_password) < 8:
        return False, "Password must be at least 8 characters."

    user = execute_query(
        "SELECT id, reset_token_expiry FROM users WHERE reset_token = %s",
        (token,),
        fetch_one=True
    )

    if not user:
        return False, "Invalid or expired reset link."

    if user["reset_token_expiry"] < datetime.utcnow():
        return False, "This reset link has expired. Please request a new one."

    new_hash = hash_password(new_password)
    execute_write(
        "UPDATE users SET password_hash = %s, reset_token = NULL, reset_token_expiry = NULL, session_token = NULL WHERE id = %s",
        (new_hash, user["id"])
    )

    return True, "Password reset successful. You can now log in with your new password."



from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")


def verify_google_token(credential: str) -> dict | None:
    """
    Verifies a Google ID token is genuine and returns the user's info from it.
    Returns None if the token is invalid/forged.
    """
    try:
        idinfo = id_token.verify_oauth2_token(
            credential, google_requests.Request(), GOOGLE_CLIENT_ID
        )
        return {
            "email": idinfo["email"],
            "email_verified": idinfo.get("email_verified", False),
            "name": idinfo.get("name", ""),
            "google_id": idinfo["sub"],
        }
    except ValueError:
        return None


def login_or_signal_google(google_info: dict) -> tuple[str, dict]:
    """
    Given verified Google info, checks if an account exists.
    Returns (status, data) where status is one of:
      - "logged_in": existing account, data has full login user_data
      - "needs_profile": new user, data has email/name/google_id to prefill the profile form
    """
    existing = execute_query(
        "SELECT id, username, full_name, role, is_approved, is_active, rejection_reason, email_verified "
        "FROM users WHERE email = %s",
        (google_info["email"],),
        fetch_one=True
    )

    if existing:
        # Link the google_id if not already linked, mark email verified (Google already confirmed it)
        execute_write(
            "UPDATE users SET google_id = %s, email_verified = TRUE WHERE id = %s",
            (google_info["google_id"], existing["id"])
        )

        if not existing["is_active"]:
            return "error", {"message": "Your account has been suspended. Contact the admin."}

        if existing["role"] in ("doctor", "radiologist") and not existing["is_approved"]:
            if existing["rejection_reason"]:
                return "error", {"message": f"Your registration was rejected. Reason: {existing['rejection_reason']}"}
            return "error", {"message": "Your PMDC license is pending admin verification. Please wait."}

        token = generate_token(existing["id"])
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE users SET session_token = %s, last_login = %s WHERE id = %s",
            (token, datetime.utcnow(), existing["id"])
        )
        conn.commit()
        cursor.close()
        conn.close()

        log_action(existing["id"], existing["username"], existing["role"], LOGIN_SUCCESS, "Logged in via Google")

        return "logged_in", {
            "token": token,
            "user_id": existing["id"],
            "username": existing["username"],
            "full_name": existing["full_name"],
            "role": existing["role"],
        }

    # No existing account — new signup, needs role/profile info
    return "needs_profile", {
        "email": google_info["email"],
        "full_name": google_info["name"],
        "google_id": google_info["google_id"],
    }


def complete_google_signup(
    email: str, google_id: str, username: str, full_name: str, role: str,
    pmdc_license_number: str = None, pmdc_license_file_path: str = None,
) -> tuple[bool, str, dict | None]:
    """Creates an account for a new Google user after they've picked a role (and PMDC info if needed)."""
    existing = execute_query(
        "SELECT id FROM users WHERE username = %s OR email = %s",
        (username, email),
        fetch_one=True
    )
    if existing:
        return False, "Username already taken, or this email is already registered.", None

    is_approved = True if role == "researcher" else False

    try:
        execute_write(
            """
            INSERT INTO users
                (username, email, password_hash, full_name, role, google_id,
                 pmdc_license_number, pmdc_license_file_path, is_approved, is_active, email_verified)
            VALUES
                (%s, %s, NULL, %s, %s, %s, %s, %s, %s, TRUE, TRUE)
            """,
            (username, email, full_name, role, google_id,
             pmdc_license_number, pmdc_license_file_path, is_approved)
        )

        log_action(user_id=None, username=username, role=role, action="REGISTER",
                   detail=f"New {role} registered via Google.")

        if role in ("doctor", "radiologist"):
            return True, "Profile created. Your PMDC license is pending admin verification.", {"needs_approval": True}

        # Researcher — log them in immediately
        new_user = execute_query("SELECT id FROM users WHERE username = %s", (username,), fetch_one=True)
        token = generate_token(new_user["id"])
        execute_write("UPDATE users SET session_token = %s WHERE id = %s", (token, new_user["id"]))

        return True, "Account created.", {
            "needs_approval": False,
            "token": token,
            "user": {"user_id": new_user["id"], "username": username, "full_name": full_name, "role": role},
        }

    except Exception as e:
        return False, f"Registration failed: {str(e)}", None