"""
routers/scans.py
API endpoints for scan upload, analysis, enhancement, and diagnosis.
All endpoints require a logged-in user.
"""

from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
import io
import base64

from modules import inference
from routers.auth import get_current_user_dependency

router = APIRouter(prefix="/scans", tags=["scans"])


class EnhanceOptions(BaseModel):
    scan_id: int
    auto_enhance: bool = False
    remove_noise: bool = False
    remove_blur: bool = False
    remove_artifacts: bool = False


class DiagnoseRequest(BaseModel):
    scan_id: int


@router.post("/analyze")
async def analyze_scan(
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user_dependency),
):
    """
    Uploads and saves a scan, runs Checker 1 + Checker 2.
    Returns scan_id — used by /enhance and /diagnose afterward.
    """
    file_bytes = await file.read()
    result = inference.process_upload(file_bytes, file.filename, user["user_id"])
    return JSONResponse(content=result)


import base64

@router.post("/enhance")
async def enhance_scan(
    options: EnhanceOptions,
    user: dict = Depends(get_current_user_dependency),
):
    try:
        result = inference.run_enhancement(
            options.scan_id,
            {
                "auto_enhance": options.auto_enhance,
                "remove_noise": options.remove_noise,
                "remove_blur": options.remove_blur,
                "remove_artifacts": options.remove_artifacts,
            },
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    img_buffer = io.BytesIO()
    result["enhanced_image"].save(img_buffer, format="PNG")
    img_base64 = base64.b64encode(img_buffer.getvalue()).decode("utf-8")

    return JSONResponse(content={
        "success": True,
        "applied_enhancements": result["applied_enhancements"],
        "image_base64": img_base64,
        "metrics": result["metrics"],
    })

@router.post("/diagnose")
async def diagnose_scan(
    payload: DiagnoseRequest,
    user: dict = Depends(get_current_user_dependency),
):
    try:
        result = inference.run_diagnosis(payload.scan_id, user["user_id"], user["role"])
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    if not result["success"]:
        return JSONResponse(content=result, status_code=400)

    return JSONResponse(content=result)