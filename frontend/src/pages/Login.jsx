import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../api/auth";
import "../styles/Login.css";
import { useLocation } from "react-router-dom";
import { GoogleLogin } from "@react-oauth/google";
import { handleGoogleCredential } from "../utils/googleAuth";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.message;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!username || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    const res = await login(username, password);
    setLoading(false);

    if (!res.success) {
      const msg = res.message || "Invalid username or password.";
      if (msg.toLowerCase().includes("pending") || msg.toLowerCase().includes("rejected")) {
        navigate("/pending", { state: { message: msg } });
      } else {
        setError(msg);
      }
      return;
    }

    const role = res.user.role;
    if (role === "admin") navigate("/admin");
    else navigate("/upload");
  }

  function handleGoogleLogin() {
    alert("Google sign-in coming soon — backend OAuth route not built yet.");
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
          <h1 className="auth-title">Log in</h1>
          <p className="auth-subtitle">Welcome back — pick up where you left off.</p>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="text"
            placeholder="Username or email"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="auth-input"
            autoComplete="username"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            autoComplete="current-password"
          />

          <Link to="/forgot-password" className="auth-forgot">
            Forgot username or password?
          </Link>

          {successMessage && <div className="auth-success">{successMessage}</div>}
          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={loading}>
            {loading ? "Logging in…" : "Log in"}
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

        <button className="auth-switch" onClick={() => navigate("/signup")}>
          New user? Create an account
        </button>
      </div>
    </div>
  );
}