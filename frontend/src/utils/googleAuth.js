    const API_BASE = "http://localhost:8000";

    export async function handleGoogleCredential(credentialResponse, navigate) {
    try {
        const res = await fetch(`${API_BASE}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: credentialResponse.credential }),
        });
        const data = await res.json();

        if (!data.success) {
        alert(data.message);
        return;
        }

        if (data.status === "logged_in") {
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        navigate(data.user.role === "admin" ? "/admin" : "/upload");
        return;
        }

        if (data.status === "needs_profile") {
        navigate("/complete-profile", {
            state: { email: data.email, full_name: data.full_name, google_id: data.google_id },
        });
        }
    } catch (error) {
        console.error("Google sign-in failed:", error);
        alert("Could not reach the server. Please try again.");
    }
    }