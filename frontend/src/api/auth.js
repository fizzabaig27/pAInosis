const API_BASE = "http://localhost:8000";

export async function login(username, password) {
  try {
    const response = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (data.success) {
      // Store the token and user info so the session survives a page refresh
      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
    }

    return data; // { success, message, token, user: { role, ... } }
  } catch (error) {
    console.error("Login request failed:", error);
    return { success: false, message: "Could not reach the server. Please try again." };
  }
}

export async function register({ fullName, username, email, password, role, licenseNumber, licenseFile }) {
  try {
    const formData = new FormData();
    formData.append("username", username);
    formData.append("email", email);
    formData.append("password", password);
    formData.append("full_name", fullName);
    formData.append("role", role.toLowerCase());

    if (licenseNumber) formData.append("pmdc_license_number", licenseNumber);
    if (licenseFile) formData.append("pmdc_license_file", licenseFile);

    const response = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      body: formData, // no Content-Type header — browser sets it automatically with the correct boundary
    });

    const data = await response.json();
    return { success: data.success, message: data.message };
  } catch (error) {
    console.error("Registration request failed:", error);
    return { success: false, message: "Could not reach the server. Please try again." };
  }
}

export function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
}

export function getStoredUser() {
  const userStr = localStorage.getItem("user");
  return userStr ? JSON.parse(userStr) : null;
}

export function getToken() {
  return localStorage.getItem("token");
}

export async function checkSession() {
  const token = getToken();
  if (!token) return null;

  try {
    const response = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      logout(); // token invalid/expired, clear it
      return null;
    }

    const data = await response.json();
    return data.user;
  } catch {
    return null;
  }
}