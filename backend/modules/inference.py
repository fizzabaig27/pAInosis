"""
modules/inference.py
Orchestrates the full pipeline: upload -> save -> validate -> gate checks -> enhance/diagnose.
"""

import hashlib
import json
from PIL import Image
import io

from modules import ai_model, checker_models, brain_validator, dicom_handler, enhancement, encryption
from modules.database import execute_query, execute_write, get_db_connection

SCAN_STORAGE_DIR = "storage/scans"


def _sha256_of(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def process_upload(file_bytes: bytes, filename: str, user_id: int) -> dict:
    """
    Runs immediately when a file is uploaded. Validates, runs Checker 1/2,
    encrypts and saves the file, creates a scans row. Returns scan_id so
    later steps (enhance/diagnose) can reference this exact saved file.
    """
    is_valid_format, format_message, file_format = brain_validator.validate_file_format(filename)
    if not is_valid_format:
        return {"success": False, "stage": "format_validation", "message": format_message}

    dicom_metadata = None
    if file_format == "dicom":
        dicom_result = dicom_handler.read_dicom(file_bytes)
        image = dicom_result["image"]
        dicom_metadata = dicom_result["metadata"]
    else:
        image = dicom_handler.convert_to_pil(file_bytes, file_format)

    heuristic_valid, heuristic_message = brain_validator.validate_image_for_diagnosis(
        image, file_format, dicom_metadata
    )

    checker1_result = checker_models.check_is_medical(image)

    if not checker1_result["is_medical"]:
        return {
            "success": True, "stage": "checker1", "is_medical": False, "is_brain_mri": False,
            "enhance_available": False, "diagnose_available": False,
            "message": "This does not appear to be a medical image.",
            "checker1_result": checker1_result,
        }

    checker2_result = checker_models.check_is_brain_mri(image)
    is_brain_mri = checker2_result["is_brain_mri"]
    heuristic_flag = is_brain_mri and not heuristic_valid

    # ── Encrypt and save the file ──
    file_hash = _sha256_of(file_bytes)
    scan_uuid_path = f"{SCAN_STORAGE_DIR}/{file_hash}.enc"
    encryption.encrypt_file_to_disk(file_bytes, scan_uuid_path)

    dicom_modality = dicom_metadata.get("Modality") if dicom_metadata else None
    dicom_body_part = dicom_metadata.get("BodyPartExamined") if dicom_metadata else None

    scan_id = execute_write(
        """INSERT INTO scans
        (user_id, original_filename, file_format, encrypted_file_path, file_hash,
            dicom_modality, dicom_body_part)
        VALUES (%s, %s, %s, %s, %s, %s, %s)""",
        (user_id, filename, file_format, scan_uuid_path, file_hash, dicom_modality, dicom_body_part)
    )

    return {
        "success": True, "stage": "complete", "scan_id": scan_id,
        "is_medical": True, "is_brain_mri": is_brain_mri,
        "enhance_available": True, "diagnose_available": is_brain_mri,
        "message": "Brain MRI detected." if is_brain_mri else "Medical image detected (not brain MRI).",
        "checker1_result": checker1_result, "checker2_result": checker2_result,
        "heuristic_check": {"passed": heuristic_valid, "message": heuristic_message, "flagged_for_review": heuristic_flag},
        "dicom_metadata": dicom_metadata,
    }


def load_scan_image(scan_id: int) -> tuple[Image.Image, dict]:
    """Loads and decrypts a previously saved scan by its ID."""
    scan = execute_query("SELECT * FROM scans WHERE id = %s", (scan_id,), fetch_one=True)
    if not scan:
        raise ValueError("Scan not found.")

    decrypted_bytes = encryption.decrypt_file_from_disk(scan["encrypted_file_path"])

    if scan["file_format"] == "dicom":
        image = dicom_handler.read_dicom(decrypted_bytes)["image"]
    else:
        image = dicom_handler.convert_to_pil(decrypted_bytes, scan["file_format"])

    return image, scan


def run_enhancement(scan_id: int, options: dict) -> dict:
    image, scan = load_scan_image(scan_id)

    enhanced_image, applied = enhancement.apply_enhancements(
        image,
        remove_blur_flag=options.get("remove_blur", False),
        remove_noise_flag=options.get("remove_noise", False),
        remove_artifacts_flag=options.get("remove_artifacts", False),
        auto_enhance_flag=options.get("auto_enhance", False),
    )

    metrics = enhancement.compute_quality_metrics(image, enhanced_image)

    buf = io.BytesIO()
    enhanced_image.save(buf, format="PNG")
    enhanced_bytes = buf.getvalue()
    enhanced_path = f"{SCAN_STORAGE_DIR}/{scan['file_hash']}_enhanced.enc"
    encryption.encrypt_file_to_disk(enhanced_bytes, enhanced_path)

    applied_set = ",".join(applied) if applied else None
    execute_write(
        "UPDATE scans SET enhancement_applied = %s, enhanced_file_path = %s WHERE id = %s",
        (applied_set, enhanced_path, scan_id)
    )

    return {"success": True, "applied_enhancements": applied, "enhanced_image": enhanced_image, "metrics": metrics}


DAILY_RESEARCHER_LIMIT = 3

def run_diagnosis(scan_id: int, user_id: int, role: str) -> dict:
    if role == "researcher":
        count_result = execute_query(
            "SELECT COUNT(*) as cnt FROM diagnoses WHERE user_id = %s AND DATE(created_at) = CURDATE()",
            (user_id,), fetch_one=True
        )
        used = count_result["cnt"]
        if used >= DAILY_RESEARCHER_LIMIT:
            return {
                "success": False,
                "message": f"Daily limit reached ({DAILY_RESEARCHER_LIMIT} diagnoses per day for researcher accounts). Please try again tomorrow.",
            }

    image, scan = load_scan_image(scan_id)

    checker2_result = checker_models.check_is_brain_mri(image)
    if not checker2_result["is_brain_mri"]:
        return {"success": False, "message": "This image was not confirmed as a brain MRI. Diagnosis is only available for brain MRI scans."}

    diagnosis = ai_model.predict(image)

    diagnosis_id = execute_write(
        """INSERT INTO diagnoses
        (scan_id, user_id, predicted_class, confidence_score, class_probabilities,
        requires_human_review, model_name, model_version, inference_time_ms)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (scan_id, user_id, diagnosis["predicted_class"], diagnosis["confidence"],
        json.dumps(diagnosis["all_probabilities"]), diagnosis["requires_human_review"],
        "DenseNet121", "v1.0", diagnosis["inference_time_ms"])
    )

    result = {"success": True, "diagnosis": diagnosis, "diagnosis_id": diagnosis_id}

    if role == "researcher":
        result["remaining_today"] = DAILY_RESEARCHER_LIMIT - (used + 1)

    return result