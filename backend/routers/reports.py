"""
routers/reports.py
Report generation and download. Metadata-only DB storage — PDF is
built fresh in memory on every download, never stored as a plaintext file.
"""

import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import io
import json

from modules.database import execute_query, execute_write
from modules import report_generator
from modules.inference import load_scan_image
from routers.auth import get_current_user_dependency

router = APIRouter(prefix="/reports", tags=["reports"])


class GenerateReportRequest(BaseModel):
    diagnosis_id: int


def _require_report_permission(user: dict):
    if user["role"] not in ("doctor", "radiologist"):
        raise HTTPException(status_code=403, detail="Only doctors and radiologists can generate reports.")


@router.post("/generate")
async def generate_report(
    payload: GenerateReportRequest,
    user: dict = Depends(get_current_user_dependency),
):
    _require_report_permission(user)

    diagnosis = execute_query(
        "SELECT * FROM diagnoses WHERE id = %s", (payload.diagnosis_id,), fetch_one=True
    )
    if not diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found.")

    report_uuid = str(uuid.uuid4())

    execute_write(
        "INSERT INTO reports (diagnosis_id, report_uuid, generated_by) VALUES (%s, %s, %s)",
        (payload.diagnosis_id, report_uuid, user["user_id"])
    )

    return {"success": True, "report_uuid": report_uuid}


@router.get("/{report_uuid}/download")
async def download_report(
    report_uuid: str,
    user: dict = Depends(get_current_user_dependency),
):
    report = execute_query(
        "SELECT * FROM reports WHERE report_uuid = %s", (report_uuid,), fetch_one=True
    )
    if not report:
        raise HTTPException(status_code=404, detail="Report not found.")

    diagnosis = execute_query(
        "SELECT * FROM diagnoses WHERE id = %s", (report["diagnosis_id"],), fetch_one=True
    )
    if not diagnosis:
        raise HTTPException(status_code=404, detail="Associated diagnosis not found.")

    generated_by = execute_query(
        "SELECT full_name, role, pmdc_license_number, username FROM users WHERE id = %s",
        (report["generated_by"],), fetch_one=True
    )

    scan_image, scan = load_scan_image(diagnosis["scan_id"])

    diagnosis_dict = {
        "predicted_class": diagnosis["predicted_class"],
        "confidence_score": float(diagnosis["confidence_score"]),
        "class_probabilities": json.loads(diagnosis["class_probabilities"])
            if isinstance(diagnosis["class_probabilities"], str) else diagnosis["class_probabilities"],
        "requires_human_review": bool(diagnosis["requires_human_review"]),
    }

    pdf_bytes = report_generator.build_report_pdf(
        report_uuid=report_uuid,
        diagnosis=diagnosis_dict,
        scan_image=scan_image,
        generated_by=generated_by,
        generated_at=report["generated_at"],
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=painosis_report_{report_uuid[:8]}.pdf"},
    )