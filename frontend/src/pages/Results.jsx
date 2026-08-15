    import { useState } from "react";
    import { useNavigate, useLocation } from "react-router-dom";
    import { getStoredUser, getToken, logout } from "../api/auth";
    import "../styles/Results.css";

    const API_BASE = "http://localhost:8000";

    const CLASS_DISPLAY = {
    glioma: "Glioma",
    meningioma: "Meningioma",
    notumor: "No Tumor Detected",
    pituitary: "Pituitary Tumor",
    };

    function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
    }

    export default function Results() {
    const navigate = useNavigate();
    const location = useLocation();
    const currentUser = getStoredUser();

    const diagnosisResponse = location.state?.diagnosis;
    const imageSrc = location.state?.imageSrc;
    const enhanceMetrics = location.state?.enhanceMetrics;

    const [reportUuid, setReportUuid] = useState(null);
    const [generating, setGenerating] = useState(false);
    const [downloading, setDownloading] = useState(false);
    const [reportError, setReportError] = useState("");

    const isResearcher = currentUser?.role === "researcher";
    const canGenerateReport = currentUser && (currentUser.role === "doctor" || currentUser.role === "radiologist");

    if (!diagnosisResponse) {
        return (
        <div className="results-page">
            <div className="wrap results-body">
            <div className="results-error">No diagnosis data found.</div>
            <button className="btn-primary" onClick={() => navigate("/upload")}>Go to Upload</button>
            </div>
        </div>
        );
    }

    if (!diagnosisResponse.success) {
        return (
        <div className="results-page">
            <div className="wrap results-body">
            <div className="results-error">{diagnosisResponse.message}</div>
            <button className="btn-primary" onClick={() => navigate("/upload")}>Go Back</button>
            </div>
        </div>
        );
    }

    const { predicted_class, confidence, all_probabilities, requires_human_review, validation_stats } = diagnosisResponse.diagnosis;
    const diagnosisId = diagnosisResponse.diagnosis_id;

    async function handleGenerateReport() {
        setGenerating(true);
        setReportError("");
        try {
        const res = await fetch(`${API_BASE}/reports/generate`, {
            method: "POST",
            headers: { ...authHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ diagnosis_id: diagnosisId }),
        });
        if (res.status === 401) { logout(); navigate("/login"); return; }
        const data = await res.json();
        if (!data.success) { setReportError(data.detail || data.message || "Could not generate report."); return; }
        setReportUuid(data.report_uuid);
        } catch {
        setReportError("Could not reach the server. Please try again.");
        } finally {
        setGenerating(false);
        }
    }

    async function handleDownload() {
        if (!reportUuid) return;
        setDownloading(true);
        try {
        const res = await fetch(`${API_BASE}/reports/${reportUuid}/download`, { headers: authHeaders() });
        if (res.status === 401) { logout(); navigate("/login"); return; }
        if (!res.ok) throw new Error("Download failed");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `painosis_report_${reportUuid.slice(0, 8)}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        } catch {
        setReportError("Could not download the report. Please try again.");
        } finally {
        setDownloading(false);
        }
    }

    return (
        <div className="results-page">
        <nav className="results-nav">
            <div className="wrap results-nav-inner">
            <div className="brand"><span className="brand-mark"></span>Painosis</div>
            <button className="btn-ghost" onClick={() => navigate("/upload")}>New Scan</button>
            </div>
        </nav>

        <div className="wrap results-body">
            <span className="eyebrow">{isResearcher ? "Model Output" : "Diagnosis"}</span>
            <h1 className="results-title">{isResearcher ? "Model Analysis" : "Scan Results"}</h1>

            {isResearcher && (
            <div className="research-disclaimer">
                Research output only. Not a clinical diagnosis. Must not be used to inform patient care decisions.
            </div>
            )}

            <div className="results-grid">
            {imageSrc && (
                <div className="results-image-card">
                <img src={imageSrc} alt="Analyzed scan" />
                </div>
            )}

            <div className="results-diagnosis-card">
                {isResearcher ? (
                <>
                    <span className="mono">Model's highest-probability class</span>
                    <h3 className="results-class-research">{CLASS_DISPLAY[predicted_class] || predicted_class}</h3>
                    <p className="results-confidence">Confidence: {confidence}%</p>
                </>
                ) : (
                <>
                    <span className="mono">Predicted class</span>
                    <h2 className="results-class">{CLASS_DISPLAY[predicted_class] || predicted_class}</h2>
                    <p className="results-confidence">Confidence: {confidence}%</p>
                    {requires_human_review && (
                    <div className="results-review-flag">⚠ Low confidence — human review recommended</div>
                    )}
                </>
                )}

                {Object.entries(all_probabilities).map(([cls, prob]) => (
                <div className="results-prob-row" key={cls}>
                    <div className="results-prob-label">
                    <span>{CLASS_DISPLAY[cls] || cls}</span>
                    <span className="mono">{prob}%</span>
                    </div>
                    <div className="results-prob-bar-bg">
                    <div
                        className={`results-prob-bar-fill ${cls === predicted_class ? "predicted" : ""}`}
                        style={{ width: `${prob}%` }}
                    />
                    </div>
                </div>
                ))}

                {isResearcher && validation_stats && (
                <div className="validation-panel">
                    <span className="eyebrow">Model Validation Performance — {CLASS_DISPLAY[predicted_class]}</span>
                    <div className="metrics-grid">
                    <div className="metric-item">
                        <span className="metric-label">Precision</span>
                        <span className="metric-value">{(validation_stats.precision * 100).toFixed(0)}%</span>
                    </div>
                    <div className="metric-item">
                        <span className="metric-label">Recall</span>
                        <span className="metric-value">{(validation_stats.recall * 100).toFixed(0)}%</span>
                    </div>
                    <div className="metric-item">
                        <span className="metric-label">F1 Score</span>
                        <span className="metric-value">{validation_stats.f1_score.toFixed(2)}</span>
                    </div>
                    </div>
                    <p className="validation-note">
                    Based on held-out test set evaluation. Reflects historical model accuracy for this predicted class, not a guarantee for this specific scan.
                    </p>
                </div>
                )}

                {isResearcher && enhanceMetrics && (
                <div className="validation-panel">
                    <span className="eyebrow">Enhancement Quality Metrics</span>
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
                        <span className="metric-label">Contrast Δ</span>
                        <span className="metric-value">{enhanceMetrics.contrast_change_pct > 0 ? "+" : ""}{enhanceMetrics.contrast_change_pct}%</span>
                    </div>
                    </div>
                </div>
                )}

                {reportError && <div className="results-review-flag" style={{ marginTop: 16 }}>{reportError}</div>}

                <div className="results-actions">
                {canGenerateReport && !reportUuid && (
                    <button className="btn-primary" onClick={handleGenerateReport} disabled={generating}>
                    {generating ? "Generating…" : "Generate Report"}
                    </button>
                )}
                {reportUuid && (
                    <button className="btn-primary" onClick={handleDownload} disabled={downloading}>
                    {downloading ? "Downloading…" : "Download Report"}
                    </button>
                )}
                <button className="btn-ghost" onClick={() => navigate("/upload")}>
                    Analyze Another Scan
                </button>
                </div>
            </div>
            </div>
        </div>
        </div>
    );
    }