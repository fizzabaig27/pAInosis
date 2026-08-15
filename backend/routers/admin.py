"""
routers/admin.py
Admin-only endpoints: user approval, user management, audit log viewing.
Every endpoint here requires role == "admin", enforced via require_admin().
"""

from fastapi import APIRouter, HTTPException, Depends, Header, Query
from typing import Optional
from datetime import datetime

from modules.database import execute_query, execute_write
from modules.audit import (
    log_action, get_all_logs,
    USER_APPROVED, USER_REJECTED, USER_SUSPENDED, USER_ACTIVATED, USER_DELETED
)
from routers.auth import get_current_user_dependency

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(user: dict = Depends(get_current_user_dependency)) -> dict:
    """Reusable dependency — blocks any non-admin from every route in this file."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required.")
    return user


# ── Pending approvals ────────────────────────────────────────────

@router.get("/pending-users")
async def get_pending_users(admin: dict = Depends(require_admin)):
    """Doctors/radiologists awaiting approval (not yet approved, not yet rejected)."""
    users = execute_query(
        """SELECT id, username, email, full_name, role,
                  pmdc_license_number, pmdc_license_file_path, created_at
           FROM users
           WHERE role IN ('doctor', 'radiologist')
             AND is_approved = FALSE
             AND rejection_reason IS NULL
           ORDER BY created_at ASC""",
        fetch_all=True
    )
    return {"success": True, "pending_users": users}


@router.post("/approve-user/{user_id}")
async def approve_user(user_id: int, admin: dict = Depends(require_admin)):
    user = execute_query("SELECT username, role FROM users WHERE id = %s", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    execute_write(
        """UPDATE users SET is_approved = TRUE, approved_by = %s, approved_at = %s
           WHERE id = %s""",
        (admin["user_id"], datetime.utcnow(), user_id)
    )

    log_action(admin["user_id"], admin["username"], admin["role"], USER_APPROVED,
               f"Approved {user['role']} account: {user['username']}")

    return {"success": True, "message": f"{user['username']} approved."}


@router.post("/reject-user/{user_id}")
async def reject_user(user_id: int, reason: str, admin: dict = Depends(require_admin)):
    user = execute_query("SELECT username, role FROM users WHERE id = %s", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    execute_write(
        """UPDATE users SET rejection_reason = %s, approved_by = %s, approved_at = %s
           WHERE id = %s""",
        (reason, admin["user_id"], datetime.utcnow(), user_id)
    )

    log_action(admin["user_id"], admin["username"], admin["role"], USER_REJECTED,
               f"Rejected {user['role']} account: {user['username']}. Reason: {reason}")

    return {"success": True, "message": f"{user['username']} rejected."}


# ── User management ──────────────────────────────────────────────

@router.get("/users")
async def get_all_users(admin: dict = Depends(require_admin)):
    users = execute_query(
        """SELECT id, username, email, full_name, role, is_approved,
                  is_active, rejection_reason, last_login, created_at
           FROM users
           ORDER BY created_at DESC""",
        fetch_all=True
    )
    return {"success": True, "users": users}


@router.post("/suspend-user/{user_id}")
async def suspend_user(user_id: int, admin: dict = Depends(require_admin)):
    user = execute_query("SELECT username, role FROM users WHERE id = %s", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # also null their session token so an active session is killed immediately
    execute_write(
        "UPDATE users SET is_active = FALSE, session_token = NULL WHERE id = %s",
        (user_id,)
    )

    log_action(admin["user_id"], admin["username"], admin["role"], USER_SUSPENDED,
               f"Suspended account: {user['username']}")

    return {"success": True, "message": f"{user['username']} suspended."}


@router.post("/activate-user/{user_id}")
async def activate_user(user_id: int, admin: dict = Depends(require_admin)):
    user = execute_query("SELECT username, role FROM users WHERE id = %s", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    execute_write("UPDATE users SET is_active = TRUE WHERE id = %s", (user_id,))

    log_action(admin["user_id"], admin["username"], admin["role"], USER_ACTIVATED,
               f"Reactivated account: {user['username']}")

    return {"success": True, "message": f"{user['username']} reactivated."}


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    user = execute_query("SELECT username, role FROM users WHERE id = %s", (user_id,), fetch_one=True)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user["role"] == "admin":
        raise HTTPException(status_code=400, detail="Cannot delete an admin account.")

    # log BEFORE deleting, since audit_logs.user_id will be SET NULL on delete
    log_action(admin["user_id"], admin["username"], admin["role"], USER_DELETED,
               f"Deleted account: {user['username']} (role: {user['role']})")

    execute_write("DELETE FROM users WHERE id = %s", (user_id,))

    return {"success": True, "message": f"{user['username']} deleted."}


# ── Audit log ─────────────────────────────────────────────────────

@router.get("/audit-logs")
async def get_audit_logs(
    admin: dict = Depends(require_admin),
    action: Optional[str] = Query(None),
    username: Optional[str] = Query(None),
    role: Optional[str] = Query(None),
    limit: int = Query(500, le=2000),
):
    logs = get_all_logs(filter_action=action, filter_username=username, filter_role=role, limit=limit)
    return {"success": True, "logs": logs}