    import { useState } from "react";
    import { useNavigate, Link } from "react-router-dom";
    import { register } from "../api/auth";
    import { isValidEmail } from "../utils/validation";
    import "../styles/Signup.css";
    import { Eye, EyeOff } from "lucide-react";
    import { GoogleLogin } from "@react-oauth/google";
    import { handleGoogleCredential } from "../utils/googleAuth";

    export default function Signup() {
    const navigate = useNavigate();

    const [fullName, setFullName] = useState("");
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [role, setRole] = useState("Select Role");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [licenseNumber, setLicenseNumber] = useState("");
    const [licenseFile, setLicenseFile] = useState(null);
    const [agree, setAgree] = useState(false);
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const needsLicense = role === "Doctor" || role === "Radiologist";

    const passwordChecks = {
        length: password.length >= 8,
        number: /\d/.test(password),
        special: /[^A-Za-z0-9]/.test(password),
        uppercase: /[A-Z]/.test(password),
    };
    const passwordIsStrong = Object.values(passwordChecks).every(Boolean);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        if (role === "Select Role") return setError("Please select a role.");
        if (!fullName || !username || !email || !password || !confirm)
        return setError("Please fill in all fields.");
        if (!isValidEmail(email)) return setError("Please enter a valid email address.");
        if (password !== confirm) return setError("Passwords do not match.");
        if (!passwordIsStrong) return setError("Password does not meet all requirements.");
        if (needsLicense && !licenseNumber)
        return setError("Please enter your PMDC license number.");
        if (needsLicense && !licenseFile)
        return setError("Please upload your PMDC license to continue.");
        if (!agree) return setError("You must agree to the terms to continue.");

        setLoading(true);
        const res = await register({
        fullName, username, email, password, role,
        licenseNumber, licenseFile,
        });
        setLoading(false);

        if (!res.success) {
        setError(res.message);
        return;
        }

        navigate("/login", { state: { message: "Registration successful! Please check your email to verify your account before logging in." } });
    }

    function handleGoogleSignup() {
        alert("Google sign-up coming soon — backend OAuth route not built yet.");
    }

    return (
        <div className="signup-page">
        <div className="signup-side">
            <Link to="/" className="auth-brand">
            <span className="brand-mark"></span>
            Painosis
            </Link>
            <span className="eyebrow signup-eyebrow">For the people who read the scans</span>
            <p className="signup-tagline">
            Enhance any scan. Diagnose brain MRIs with a Grad-CAM heatmap
            showing exactly where the model looked.
            </p>
            <div className="signup-trust">
            <span className="mono">94.38% test accuracy</span>
            <span className="mono">PMDC-verified accounts only</span>
            </div>
        </div>

        <div className="signup-main">
            <h1 className="auth-title">Sign up</h1>

            <form onSubmit={handleSubmit} className="auth-form">
            <label className="field-label">
                Full name <span className="required-mark">*</span>
            </label>
            <input
                type="text"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="auth-input"
            />

            <label className="field-label">
                Username <span className="required-mark">*</span>
            </label>
            <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="auth-input"
            />

            <label className="field-label">
                Email <span className="required-mark">*</span>
            </label>
            <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
            />

            <label className="field-label">
                Role <span className="required-mark">*</span>
            </label>
            <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="auth-select"
            >
                <option>Select Role</option>
                <option>Doctor</option>
                <option>Radiologist</option>
                <option>Researcher</option>
            </select>

            <label className="field-label">
                Password <span className="required-mark">*</span>
            </label>
            <div className="password-field">
            <input
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
            />
            <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
            >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            </div>

            {password.length > 0 && (
                <div className="password-checklist">
                <span className={passwordChecks.length ? "check-pass" : "check-fail"}>
                    {passwordChecks.length ? "✓" : "○"} At least 8 characters
                </span>
                <span className={passwordChecks.uppercase ? "check-pass" : "check-fail"}>
                    {passwordChecks.uppercase ? "✓" : "○"} One capital letter
                </span>
                <span className={passwordChecks.number ? "check-pass" : "check-fail"}>
                    {passwordChecks.number ? "✓" : "○"} One number
                </span>
                <span className={passwordChecks.special ? "check-pass" : "check-fail"}>
                    {passwordChecks.special ? "✓" : "○"} One special character
                </span>
                </div>
            )}

            <label className="field-label">
            Confirm password <span className="required-mark">*</span>
            </label>
            <div className="password-field">
            <input
                type={showConfirm ? "text" : "password"}
                placeholder="Confirm password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="auth-input"
            />
            <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
            >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
            </div>

            {needsLicense && (
                <>
                <label className="field-label">
                    PMDC License Number <span className="required-mark">*</span>
                </label>
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
                </>
            )}

            <label className="signup-agree">
                <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                />
                I agree that this system is for diagnostic support only
            </label>

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? "Creating account…" : "Sign up"}
            </button>

            <div className="auth-divider">
                <span>or continue with</span>
            </div>

            <div className="google-btn-wrapper">
            <GoogleLogin
                onSuccess={(credentialResponse) => handleGoogleCredential(credentialResponse, navigate)}
                onError={() => alert("Google sign-in failed. Please try again.")}
                width="100%"
            />
            </div>
            </form>

            <button className="auth-switch" onClick={() => navigate("/login")}>
            Already have an account? Log in here.
            </button>
        </div>
        </div>
    );
    }