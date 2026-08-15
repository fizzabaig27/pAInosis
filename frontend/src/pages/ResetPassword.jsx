    import { useState } from "react";
    import { useNavigate, useSearchParams, Link } from "react-router-dom";
    import "../styles/Login.css";

    const API_BASE = "http://localhost:8000";

    export default function ResetPassword() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");

    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        if (!token) {
        setError("Invalid or missing reset link.");
        return;
        }
        if (password.length < 8) {
        setError("Password must be at least 8 characters.");
        return;
        }
        if (password !== confirmPassword) {
        setError("Passwords do not match.");
        return;
        }

        setLoading(true);
        try {
        const res = await fetch(`${API_BASE}/auth/reset-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, new_password: password }),
        });
        const data = await res.json();

        if (data.success) {
            setSuccess(true);
            setTimeout(() => navigate("/login"), 2500);
        } else {
            setError(data.message);
        }
        } catch {
        setError("Could not reach the server. Please try again.");
        } finally {
        setLoading(false);
        }
    }

    return (
        <div className="auth-page">
        <div className="auth-card">
            <div className="grad-rule auth-card-rule" />
            <div className="auth-header">
            <Link to="/" className="auth-brand">
                <span className="brand-mark"></span>
                Painosis
            </Link>
            <span className="eyebrow auth-eyebrow">Access</span>
            <h1 className="auth-title">Set new password</h1>
            </div>

            {success ? (
            <p style={{ color: "var(--slate)" }}>Password reset successful. Redirecting to login…</p>
            ) : (
            <form onSubmit={handleSubmit} className="auth-form">
                <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="auth-input"
                />
                <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="auth-input"
                />

                {error && <div className="auth-error">{error}</div>}

                <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? "Resetting…" : "Reset password"}
                </button>
            </form>
            )}
        </div>
        </div>
    );
    }