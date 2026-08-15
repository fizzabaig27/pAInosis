    import { useEffect, useState } from "react";
    import { useNavigate, useSearchParams, Link } from "react-router-dom";
    import "../styles/Login.css";

    const API_BASE = "http://localhost:8000";

    export default function VerifyEmail() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");

    const [status, setStatus] = useState("verifying"); // "verifying" | "success" | "error"
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!token) {
        setStatus("error");
        setMessage("Invalid or missing verification link.");
        return;
        }

        async function verify() {
        try {
            const res = await fetch(`${API_BASE}/auth/verify-email`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token }),
            });
            const data = await res.json();

            if (!data.success) {
            setStatus("error");
            setMessage(data.message);
            return;
            }

            if (data.needs_approval) {
            // Doctor/Radiologist — email verified, but still needs admin approval
            navigate("/pending", { state: { message: "Email verified. Your account is now awaiting admin approval." } });
            return;
            }

            if (data.token) {
            // Researcher — auto-login
            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            navigate("/upload");
            return;
            }

            // Fallback, shouldn't normally reach here
            setStatus("success");
            setMessage(data.message);
        } catch {
            setStatus("error");
            setMessage("Could not reach the server. Please try again.");
        }
        }

        verify();
    }, [token, navigate]);

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
            <h1 className="auth-title">
                {status === "verifying" && "Verifying your email…"}
                {status === "success" && "Verified"}
                {status === "error" && "Verification failed"}
            </h1>
            </div>

            <div className="auth-form">
            {status === "verifying" && <p style={{ color: "var(--slate)" }}>Please wait a moment.</p>}
            {status === "error" && (
                <>
                <div className="auth-error">{message}</div>
                <Link to="/signup" className="auth-switch" style={{ display: "block", textAlign: "center", marginTop: 20 }}>
                    Back to sign up
                </Link>
                </>
            )}
            {status === "success" && <p style={{ color: "var(--slate)" }}>{message}</p>}
            </div>
        </div>
        </div>
    );
    }