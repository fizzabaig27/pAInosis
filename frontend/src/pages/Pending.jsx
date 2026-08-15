    import { useLocation, useNavigate, Link } from "react-router-dom";
    import "../styles/Login.css";
    import "../styles/Pending.css";

    function HourglassIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2h12" />
        <path d="M6 22h12" />
        <path d="M6 2c0 5 5 6 5 10s-5 5-5 10" />
        <path d="M18 2c0 5-5 6-5 10s5 5 5 10" />
        </svg>
    );
    }

    function RejectedIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9l-6 6" />
        <path d="M9 9l6 6" />
        </svg>
    );
    }

    function SuspendedIcon() {
    return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M5.5 5.5l13 13" />
        </svg>
    );
    }

    export default function Pending() {
    const location = useLocation();
    const navigate = useNavigate();
    const message = location.state?.message || "";

    const isRejected = message.toLowerCase().includes("rejected");
    const isSuspended = message.toLowerCase().includes("suspended");

    let Icon = HourglassIcon;
    let title = "Awaiting verification";
    let body = (
        <>
        Your PMDC license has been submitted and is currently under review by
        the admin. You&rsquo;ll be able to log in once your account is
        approved. This usually takes 1&ndash;2 business days.
        </>
    );

    if (isRejected) {
        Icon = RejectedIcon;
        title = "Registration rejected";
        body = (
        <>
            {message}
            <br /><br />
            Please contact the admin if you believe this is an error.
        </>
        );
    } else if (isSuspended) {
        Icon = SuspendedIcon;
        title = "Account suspended";
        body = <>{message}</>;
    }

    return (
        <div className="auth-page">
        <div className="auth-card pending-card">
            <div className={`grad-rule auth-card-rule ${isRejected || isSuspended ? "rule-alert" : ""}`} />

            <Link to="/" className="auth-brand pending-brand">
            <span className="brand-mark"></span>
            Painosis
            </Link>

            <div className={`pending-icon ${isRejected || isSuspended ? "pending-icon-alert" : ""}`}>
            <Icon />
            </div>

            <h1 className="auth-title pending-title">{title}</h1>
            <p className="pending-body">{body}</p>

            <button className="auth-submit" onClick={() => navigate("/login")}>
            ← Back to login
            </button>
        </div>
        </div>
    );
    }