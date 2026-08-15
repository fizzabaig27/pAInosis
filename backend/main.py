
"""
main.py
Entry point for the Painosis FastAPI backend.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import scans
from routers import scans, auth as auth_router
from routers import scans, auth as auth_router, admin as admin_router, reports as reports_router
import os
os.makedirs("storage/scans", exist_ok=True)

# from routers import auth, admin, audit, diagnoses, reports  # enable as each is ready
app = FastAPI(
    title="Painosis API",
    description="Brain tumor detection and medical scan enhancement backend",
    version="1.0.0",
)
# ── CORS ────────────────────────────────────────────────────────
# Allows your React frontend (running on a different port) to call this API.
# Adjust the port below to match whatever your React dev server actually runs on.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default
        "http://localhost:3000",  # Create React App default
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────
app.include_router(scans.router)
app.include_router(auth_router.router)
app.include_router(admin_router.router)
app.include_router(reports_router.router)
# app.include_router(diagnoses.router)


@app.get("/")
async def root():
    return {"status": "ok", "message": "Painosis API is running"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}