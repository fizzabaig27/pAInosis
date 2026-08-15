"""
modules/email_service.py
Sends transactional emails (password reset, etc.) via SMTP.
"""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USERNAME = os.getenv("SMTP_USERNAME")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """
    Sends an HTML email. Returns True on success, False on failure.
    Never raises — email failures should not crash the calling request.
    """
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = SMTP_USERNAME
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(SMTP_USERNAME, to_email, msg.as_string())

        return True
    except Exception as e:
        print(f"[EMAIL ERROR] Failed to send email to {to_email}: {e}")
        return False


def send_password_reset_email(to_email: str, username: str, reset_token: str) -> bool:
    reset_link = f"{FRONTEND_URL}/reset-password?token={reset_token}"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0b1a2b;">Reset your Painosis password</h2>
        <p>Hi {username},</p>
        <p>We received a request to reset your password. Click the button below to choose a new one:</p>
        <a href="{reset_link}"
            style="display: inline-block; background: #0b1a2b; color: white; padding: 12px 24px;
                border-radius: 8px; text-decoration: none; margin: 16px 0;">
            Reset Password
        </a>
        <p style="color: #5c6b7a; font-size: 13px;">
            This link expires in 30 minutes. If you didn't request this, you can safely ignore this email.
        </p>
    </div>
    """

    return send_email(to_email, "Reset your Painosis password", html_body)
def send_verification_email(to_email: str, username: str, verification_token: str) -> bool:
    verify_link = f"{FRONTEND_URL}/verify-email?token={verification_token}"

    html_body = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #0b1a2b;">Verify your Painosis account</h2>
        <p>Hi {username},</p>
        <p>Thanks for signing up. Click the button below to verify your email address:</p>
        <a href="{verify_link}"
            style="display: inline-block; background: #0b1a2b; color: white; padding: 12px 24px;
            border-radius: 8px; text-decoration: none; margin: 16px 0;">
            Verify Email
        </a>
        <p style="color: #5c6b7a; font-size: 13px;">
            This link expires in 30 minutes. If you didn't create this account, you can ignore this email.
        </p>
    </div>
    """

    return send_email(to_email, "Verify your Painosis account", html_body)