    import { useRef, useState } from "react";
    import { useNavigate } from "react-router-dom";
    import { getToken, getStoredUser, logout } from "../api/auth";
    
    import "../styles/Upload.css";

    const API_BASE = "http://localhost:8000";

    const METHODS = [
    { id: "auto_enhance", label: "CLAHE (Recommended)" },
    { id: "remove_noise", label: "Denoise" },
    { id: "remove_blur", label: "Sharpen" },
    { id: "overall", label: "Overall Enhancement" },
    ];

    function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
    }

    export default function Upload() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    const [imageSrc, setImageSrc] = useState(null);
    const [enhancedImageSrc, setEnhancedImageSrc] = useState(null);
    const [uploadedFile, setUploadedFile] = useState(null);
    const [scanId, setScanId] = useState(null);
    const [fileName, setFileName] = useState("");
    const [method, setMethod] = useState("auto_enhance");
    const [applied, setApplied] = useState(false);
    const [toast, setToast] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const [loading, setLoading] = useState(false);

    const [analyzing, setAnalyzing] = useState(false);
    const [analysisResult, setAnalysisResult] = useState(null);
    const [analysisError, setAnalysisError] = useState(null);

    const sliderRef = useRef(null);
    const [sliderPos, setSliderPos] = useState(50);
    const dragging = useRef(false);
    const [enhanceMetrics, setEnhanceMetrics] = useState(null);
    const currentUser = getStoredUser();
    async function handleFile(file) {
        if (!file) return;
        setFileName(file.name);
        setUploadedFile(file);

        const reader = new FileReader();
        reader.onload = (e) => {
        setImageSrc(e.target.result);
        setApplied(false);
        setEnhancedImageSrc(null);
        };
        reader.readAsDataURL(file);

        setAnalyzing(true);
        setAnalysisError(null);
        setAnalysisResult(null);
        setScanId(null);

        try {
        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`${API_BASE}/scans/analyze`, {
            method: "POST",
            headers: authHeaders(),
            body: formData,
        });

        if (response.status === 401) {
            logout();
            navigate("/login");
            return;
        }

        const result = await response.json();
        setAnalysisResult(result);
        if (result.scan_id) setScanId(result.scan_id);
        } catch (error) {
        console.error("Analysis failed:", error);
        setAnalysisError("Could not analyze this file. Please try again.");
        } finally {
        setAnalyzing(false);
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        setDragActive(false);
        handleFile(e.dataTransfer.files?.[0]);
    }


    async function applyEnhancement() {
        if (!scanId) return;
        setLoading(true);

        const flags = {
        scan_id: scanId,
        auto_enhance: method === "auto_enhance" || method === "overall",
        remove_noise: method === "remove_noise" || method === "overall",
        remove_blur: method === "remove_blur" || method === "overall",
        remove_artifacts: method === "overall",
        };

        try {
        const response = await fetch(`${API_BASE}/scans/enhance`, {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify(flags),
        });

        if (response.status === 401) {
            logout();
            navigate("/login");
            return;
        }
        if (!response.ok) throw new Error("Enhancement request failed");

        const data = await response.json();
        setEnhancedImageSrc(`data:image/png;base64,${data.image_base64}`);
        setEnhanceMetrics(data.metrics);
        setApplied(true);
        setToast(true);
        setTimeout(() => setToast(false), 2500);
        } catch (error) {
        console.error("Enhancement failed:", error);
        } finally {
        setLoading(false);
        }
    }

    async function runDiagnosis() {
        if (!scanId) return;

        try {
        const response = await fetch(`${API_BASE}/scans/diagnose`, {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ scan_id: scanId }),
        });

        if (response.status === 401) {
            logout();
            navigate("/login");
            return;
        }

        const result = await response.json();
        navigate("/results", { state: { diagnosis: result, scanId, imageSrc: applied ? enhancedImageSrc : imageSrc, enhanceMetrics } });
        } catch (error) {
        console.error("Diagnosis failed:", error);
        }
    }

    function reset() {
        setImageSrc(null);
        setEnhancedImageSrc(null);
        setUploadedFile(null);
        setScanId(null);
        setFileName("");
        setApplied(false);
        setSliderPos(50);
        setAnalysisResult(null);
        setAnalysisError(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }

    function startDrag() { dragging.current = true; }
    function onDrag(e) {
        if (!dragging.current || !sliderRef.current) return;
        const rect = sliderRef.current.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        let pct = ((clientX - rect.left) / rect.width) * 100;
        pct = Math.max(0, Math.min(100, pct));
        setSliderPos(pct);
    }
    function endDrag() { dragging.current = false; }

    return (
        <div className="upload-page" onMouseMove={onDrag} onMouseUp={endDrag} onTouchMove={onDrag} onTouchEnd={endDrag}>
        <nav className="upload-nav">
            <div className="upload-nav-inner">
            <div className="brand"><span className="brand-mark"></span>Painosis</div>
            <button className="btn-ghost" onClick={() => { logout(); navigate("/login"); }}>Logout</button>
            </div>
        </nav>

        <div className="upload-body">
            {toast && (
            <div className="upload-toast">
                <span className="upload-toast-check">✓</span>
                Enhancement applied
            </div>
            )}

            {!imageSrc ? (
            <div
                className={`dropzone ${dragActive ? "dropzone-active" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
            >
                <p className="dropzone-title">Drag and drop a scan here</p>
                <p className="dropzone-sub mono">Supported formats: DICOM, PNG, JPG</p>
                <p className="dropzone-or">or</p>
                <button className="btn-primary" onClick={() => fileInputRef.current.click()}>Import a file</button>
                <input
                ref={fileInputRef}
                type="file"
                accept=".dcm,.dicom,.png,.jpg,.jpeg"
                hidden
                onChange={(e) => handleFile(e.target.files?.[0])}
                />
            </div>
            ) : (
            <>
                <div className="compare-stage" ref={sliderRef}>
                <span className="compare-label compare-label-left mono">Enhanced</span>
                <span className="compare-label compare-label-right mono">Original</span>
                <img src={imageSrc} alt="Original scan" className="compare-img" />
                <div className="compare-img-overlay" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
                    <img src={applied && enhancedImageSrc ? enhancedImageSrc : imageSrc} alt="Enhanced scan" className="compare-img" />
                </div>
                <div className="compare-handle" style={{ left: `${sliderPos}%` }} onMouseDown={startDrag} onTouchStart={startDrag}>
                    <span>‹</span><span>›</span>
                </div>
                <button className="reset-btn" onClick={reset}>↺ Reset</button>
                <p className="compare-hint mono">drag to compare</p>
                </div>

                {analyzing && <p className="mono" style={{ textAlign: "center" }}>Analyzing scan...</p>}
                {analysisError && <p className="mono" style={{ textAlign: "center", color: "red" }}>{analysisError}</p>}
                {analysisResult && !analysisResult.is_medical && (
                <p className="mono" style={{ textAlign: "center", color: "orange" }}>This does not appear to be a medical image.</p>
                )}
                {analysisResult && analysisResult.is_medical && !analysisResult.is_brain_mri && (
                <p className="mono" style={{ textAlign: "center", color: "orange" }}>Medical image detected, but not a brain MRI — diagnosis unavailable.</p>
                )}

                <div className="upload-actions">
                <div className="method-panel">
                    <span className="eyebrow method-eyebrow">Enhancement method</span>
                    {METHODS.map((m) => (
                    <label key={m.id} className="method-option">
                        <input type="radio" name="method" checked={method === m.id} onChange={() => setMethod(m.id)} />
                        {m.label}
                    </label>
                    ))}
                    <button className="btn-ghost method-apply" onClick={applyEnhancement} disabled={loading || !analysisResult?.enhance_available}>
                    {loading ? "Enhancing..." : "Apply enhancement"}
                    </button>
                </div>

                {currentUser?.role === "researcher" && enhanceMetrics && (
                <div className="metrics-panel">
                    <span className="eyebrow">Image Quality Metrics</span>
                    <div className="metrics-grid">
                    <div className="metric-item">
                        <span className="metric-label">PSNR</span>
                        <span className="metric-value">{enhanceMetrics.psnr} dB</span>
                    </div>
                    <div className="metric-item">
                        <span className="metric-label">SSIM</span>
                        <span className="metric-value">{enhanceMetrics.ssim}</span>
                    </div>
                    <div className="metric-item">
                        <span className="metric-label">Contrast Change</span>
                        <span className="metric-value">{enhanceMetrics.contrast_change_pct > 0 ? "+" : ""}{enhanceMetrics.contrast_change_pct}%</span>
                    </div>
                    </div>
                </div>
                )}

                <button className="btn-primary diagnose-btn" onClick={runDiagnosis} disabled={!analysisResult?.diagnose_available}>
                    Run diagnosis →
                </button>
                </div>
            </>
            )}
        </div>
        </div>
    );
    }