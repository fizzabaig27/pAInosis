    import { useState } from "react";
    import { useNavigate, useLocation, Link } from "react-router-dom";
    import "../styles/Signup.css";

    const API_BASE = "http://localhost:8000";

    export default function CompleteProfile() {
    const navigate = useNavigate();
    const location = useLocation();
    const { email, full_name, google_id } = location.state || {};

    const [step, setStep] = useState("choose"); // "choose" | "medical-form"
    const [username, setUsername] = useState("");
    const [role, setRole] = useState("Doctor");
    const [licenseNumber, setLicenseNumber] = useState("");
    const [licenseFile, setLicenseFile] = useState(null);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    if (!email) {
        return (
        <div className="signup-page">
            <div className="signup-main">
            <p>Missing sign-up info. Please try again.</p>
            <Link to="/signup" className="auth-switch">Back to sign up</Link>
            </div>
        </div>
        );
    }

    async function submitProfile(finalRole) {
        setError("");
        if (!username) return setError("Please choose a username.");
        if ((finalRole === "doctor" || finalRole === "radiologist")) {
        if (!licenseNumber) return setError("Please enter your PMDC license number.");
        if (!licenseFile) return setError("Please upload your PMDC license.");
        }

        setLoading(true);
        try {
        const formData = new FormData();
        formData.append("email", email);
        formData.append("google_id", google_id);
        formData.append("username", username);
        formData.append("full_name", full_name);
        formData.append("role", finalRole);
        if (licenseNumber) formData.append("pmdc_license_number", licenseNumber);
        if (licenseFile) formData.append("pmdc_license_file", licenseFile);

        const res = await fetch(`${API_BASE}/auth/google/complete-profile`, {
            method: "POST",
            body: formData,
        });
        const data = await res.json();

        if (!data.success) {
            setError(data.message);
            setLoading(false);
            return;
        }

        if (data.needs_approval) {
            navigate("/pending", { state: { message: data.message } });
        } else {
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            navigate("/upload");
        }
        } catch {
        setError("Could not reach the server. Please try again.");
        setLoading(false);
        }
    }

    return (
        <div className="signup-page">
        <div className="signup-side">
            <Link to="/" className="auth-brand">
            <span className="brand-mark"></span>
            Painosis
            </Link>
            <span className="eyebrow signup-eyebrow">Almost there</span>
            <p className="signup-tagline">One last step — tell us a bit about your role.</p>
        </div>

        <div className="signup-main">
            <h1 className="auth-title">Complete your profile</h1>
            <p style={{ color: "var(--slate)", marginBottom: 20 }}>Signing up as {email}</p>

            {step === "choose" && (
            <div className="auth-form">
                <label className="field-label">Username <span className="required-mark">*</span></label>
                <input
                type="text"
                placeholder="Choose a username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="auth-input"
                />

                {error && <div className="auth-error">{error}</div>}

                <button
                type="button"
                className="auth-submit"
                disabled={loading}
                onClick={() => submitProfile("researcher")}
                >
                {loading ? "Creating account…" : "I am a Researcher"}
                </button>

                <button
                type="button"
                className="google-btn"
                onClick={() => { setError(""); setStep("medical-form"); }}
                >
                I am a Doctor or Radiologist
                </button>
            </div>
            )}

            {step === "medical-form" && (
            <div className="auth-form">
                <label className="field-label">Username <span className="required-mark">*</span></label>
                <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="auth-input"
                />

                <label className="field-label">Role <span className="required-mark">*</span></label>
                <select value={role} onChange={(e) => setRole(e.target.value)} className="auth-select">
                <option value="Doctor">Doctor</option>
                <option value="Radiologist">Radiologist</option>
                </select>

                <label className="field-label">PMDC License Number <span className="required-mark">*</span></label>
                <input
                type="text"
                placeholder="e.g. PMDC-12345"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                className="auth-input"
                />

                <div className="signup-file">
                <label className="signup-file-label">
                    PMDC License File (PDF, JPG, or PNG) <span className="required-mark">*</span>
                    <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setLicenseFile(e.target.files?.[0] || null)}
                    />
                </label>
                {licenseFile && <span className="signup-file-name">{licenseFile.name}</span>}
                </div>

                {error && <div className="auth-error">{error}</div>}

                <button
                type="button"
                className="auth-submit"
                disabled={loading}
                onClick={() => submitProfile(role.toLowerCase())}
                >
                {loading ? "Submitting…" : "Submit for verification"}
                </button>

                <button type="button" className="auth-switch" onClick={() => setStep("choose")}>
                Back
                </button>
            </div>
            )}
        </div>
        </div>
    );
    }