    import { useState } from "react";
    import { Link } from "react-router-dom";
    import { isValidEmail } from "../utils/validation";
    import "../styles/Login.css";

    const API_BASE = "http://localhost:8000";

    export default function ForgotPassword() {
    const [email, setEmail] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();
        setError("");

        if (!isValidEmail(email)) {
        setError("Please enter a valid email address.");
        return;
        }

        setLoading(true);
        try {
        const res = await fetch(`${API_BASE}/auth/forgot-password`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });
        await res.json();
        setSubmitted(true);
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
            <h1 className="auth-title">Reset password</h1>
            <p className="auth-subtitle">We'll email you a link to reset your password.</p>
            </div>

            {submitted ? (
            <div className="auth-form">
                <p style={{ color: "var(--slate)" }}>
                If that email is registered, a reset link has been sent. Check your inbox (and spam folder).
                </p>
                <Link to="/login" className="auth-switch" style={{ display: "block", textAlign: "center", marginTop: 20 }}>
                Back to login
                </Link>
            </div>
            ) : (
            <form onSubmit={handleSubmit} className="auth-form">
                <input
                type="email"
                placeholder="Your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="auth-input"
                autoComplete="email"
                />

                {error && <div className="auth-error">{error}</div>}

                <button type="submit" className="auth-submit" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
                </button>
            </form>
            )}

            <Link to="/login" className="auth-switch">
            Back to login
            </Link>
        </div>
        </div>
    );
    }