import { getToken } from "./auth";

const API_BASE = "http://localhost:8000";

function authHeaders() {
    return { Authorization: `Bearer ${getToken()}` };
}

async function handleResponse(response) {
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.detail || data.message || "Request failed.");
    }
    return data;
}

export async function getPendingUsers() {
    const res = await fetch(`${API_BASE}/admin/pending-users`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function approveUser(userId) {
    const res = await fetch(`${API_BASE}/admin/approve-user/${userId}`, {
        method: "POST",
        headers: authHeaders(),
    });
    return handleResponse(res);
}

export async function rejectUser(userId, reason) {
    const res = await fetch(`${API_BASE}/admin/reject-user/${userId}?reason=${encodeURIComponent(reason)}`, {
        method: "POST",
        headers: authHeaders(),
    });
    return handleResponse(res);
}

export async function getAllUsers() {
    const res = await fetch(`${API_BASE}/admin/users`, { headers: authHeaders() });
    return handleResponse(res);
}

export async function suspendUser(userId) {
    const res = await fetch(`${API_BASE}/admin/suspend-user/${userId}`, {
        method: "POST",
        headers: authHeaders(),
    });
    return handleResponse(res);
}

export async function activateUser(userId) {
    const res = await fetch(`${API_BASE}/admin/activate-user/${userId}`, {
        method: "POST",
        headers: authHeaders(),
    });
    return handleResponse(res);
}

export async function deleteUser(userId) {
    const res = await fetch(`${API_BASE}/admin/users/${userId}`, {
        method: "DELETE",
        headers: authHeaders(),
    });
    return handleResponse(res);
}

export async function getAuditLogs(filters = {}) {
    const params = new URLSearchParams(filters);
    const res = await fetch(`${API_BASE}/admin/audit-logs?${params}`, { headers: authHeaders() });
    return handleResponse(res);
}