import { useState, useEffect, useCallback, useMemo } from "react";
    import { useNavigate } from "react-router-dom";
    import { getStoredUser, logout } from "../api/auth";
    import {
    getPendingUsers, approveUser, rejectUser,
    getAllUsers, suspendUser, activateUser, deleteUser,
    getAuditLogs,
    } from "../api/admin";
    import "../styles/Admin.css";

// TODO: point this at wherever your backend serves uploaded files from
// (the same host/port your api/admin.js calls hit, minus the /api path).
const API_BASE_URL = "http://localhost:5000";

    const NAV_ITEMS = [
    { key: "Dashboard", icon: "grid" },
    { key: "Pending Approvals", icon: "clock" },
    { key: "All Users", icon: "users" },
    { key: "Audit Log", icon: "list" },
    ];

    function Icon({ name }) {
    const common = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
    switch (name) {
        case "grid":
        return (<svg {...common}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="5" rx="1.5" /><rect x="13" y="11" width="8" height="10" rx="1.5" /><rect x="3" y="14" width="8" height="7" rx="1.5" /></svg>);
        case "clock":
        return (<svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>);
        case "users":
        return (<svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M2.5 20c0-3.6 2.9-6.2 6.5-6.2s6.5 2.6 6.5 6.2" /><circle cx="18" cy="8.5" r="2.6" /><path d="M15.8 13.9c2.9.4 4.7 2.7 4.7 6.1" /></svg>);
        case "list":
        return (<svg {...common}><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.3" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.3" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.3" fill="currentColor" stroke="none" /></svg>);
        case "arrow":
        return (<svg {...common} width="14" height="14"><path d="M5 12h14M13 6l6 6-6 6" /></svg>);
        default:
        return null;
    }
    }

    function initialsOf(name = "") {
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
    }

    export default function Admin() {
    const navigate = useNavigate();
    const [currentUser] = useState(() => getStoredUser());
    const [tab, setTab] = useState("Dashboard");
    const [pendingUsers, setPendingUsers] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [selectedUser, setSelectedUser] = useState(null);

    const loadPending = useCallback(async () => {
        setLoading(true); setError("");
        try { setPendingUsers((await getPendingUsers()).pending_users); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    const loadAllUsers = useCallback(async () => {
        setLoading(true); setError("");
        try { setAllUsers((await getAllUsers()).users); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    const loadLogs = useCallback(async () => {
        setLoading(true); setError("");
        try { setLogs((await getAuditLogs()).logs); }
        catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    const loadDashboard = useCallback(async () => {
        setLoading(true); setError("");
        try {
        const [pending, users, auditLogs] = await Promise.all([getPendingUsers(), getAllUsers(), getAuditLogs()]);
        setPendingUsers(pending.pending_users);
        setAllUsers(users.users);
        setLogs(auditLogs.logs);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => {
        if (!currentUser || currentUser.role !== "admin") { navigate("/login"); return; }
        if (tab === "Dashboard") loadDashboard();
        if (tab === "Pending Approvals") loadPending();
        if (tab === "All Users") loadAllUsers();
        if (tab === "Audit Log") loadLogs();
    }, [tab, currentUser, navigate, loadDashboard, loadPending, loadAllUsers, loadLogs]);

    async function handleApprove(id) {
        try { await approveUser(id); setSelectedUser(null); loadPending(); } catch (e) { alert(e.message); }
    }
    async function handleReject(id) {
        const reason = prompt("Reason for rejection:");
        if (!reason) return;
        try { await rejectUser(id, reason); setSelectedUser(null); loadPending(); } catch (e) { alert(e.message); }
    }
    async function handleSuspend(id) {
        if (!confirm("Suspend this account?")) return;
        try { await suspendUser(id); loadAllUsers(); } catch (e) { alert(e.message); }
    }
    async function handleActivate(id) {
        try { await activateUser(id); loadAllUsers(); } catch (e) { alert(e.message); }
    }
    async function handleDelete(id) {
        if (!confirm("Permanently delete this account? This cannot be undone.")) return;
        try { await deleteUser(id); loadAllUsers(); } catch (e) { alert(e.message); }
    }
    function handleLogout() { logout(); navigate("/login"); }

    function statusOf(u) {
        if (!u.is_active) return { label: "Suspended", cls: "suspended" };
        if (!u.is_approved && u.role !== "admin") return { label: "Pending", cls: "pending" };
        return { label: "Active", cls: "active" };
    }

    const stats = useMemo(() => {
        const total = allUsers.length;
        const active = allUsers.filter((u) => u.is_active && (u.is_approved || u.role === "admin")).length;
        const suspended = allUsers.filter((u) => !u.is_active).length;
        const byRole = allUsers.reduce((acc, u) => {
        acc[u.role] = (acc[u.role] || 0) + 1;
        return acc;
        }, {});
        return { total, active, suspended, pending: pendingUsers.length, byRole };
    }, [allUsers, pendingUsers]);

    return (
        <div className="admin-shell">
        <aside className="admin-sidebar">
            <div className="sidebar-brand">
            <span className="brand-mark"></span>
            <span>Painosis</span>
            </div>

            <nav className="sidebar-nav">
            <span className="sidebar-section-label">Overview</span>
            {NAV_ITEMS.map((item) => (
                <button
                key={item.key}
                className={`nav-item ${tab === item.key ? "active" : ""}`}
                onClick={() => setTab(item.key)}
                >
                <Icon name={item.icon} />
                <span>{item.key}</span>
                {item.key === "Pending Approvals" && stats.pending > 0 && (
                    <span className="nav-badge">{stats.pending}</span>
                )}
                </button>
            ))}
            </nav>

            <div className="sidebar-footer">
            <div className="sidebar-user">
                <span className="avatar">{initialsOf(currentUser?.full_name)}</span>
                <div className="sidebar-user-meta">
                <span className="sidebar-user-name">{currentUser?.full_name}</span>
                <span className="sidebar-user-role">{currentUser?.role}</span>
                </div>
            </div>
            <button className="btn-ghost sidebar-logout" onClick={handleLogout}>Logout</button>
            </div>
        </aside>

        <div className="admin-main">
            <header className="admin-topbar">
            <div>
                <span className="eyebrow">Admin</span>
                <h1 className="admin-title">{tab}</h1>
            </div>
            {tab !== "Dashboard" && (
                <button className="btn-ghost" onClick={() => setTab("Dashboard")}>
                <Icon name="grid" /> Back to Dashboard
                </button>
            )}
            </header>

            <main className="admin-content">
            {error && <div className="admin-error">{error}</div>}
            {loading && <p className="mono">Loading…</p>}

            {tab === "Dashboard" && !loading && (
                <div>
                <div className="stat-grid">
                    <div className="stat-card">
                    <span className="stat-label">Total Users</span>
                    <span className="stat-value">{stats.total}</span>
                    </div>
                    <div className="stat-card highlight">
                    <span className="stat-label">Pending Approvals</span>
                    <span className="stat-value">{stats.pending}</span>
                    </div>
                    <div className="stat-card">
                    <span className="stat-label">Active Accounts</span>
                    <span className="stat-value">{stats.active}</span>
                    </div>
                    <div className="stat-card">
                    <span className="stat-label">Suspended</span>
                    <span className="stat-value">{stats.suspended}</span>
                    </div>
                </div>

                {Object.keys(stats.byRole).length > 0 && (
                    <div className="role-breakdown">
                    {Object.entries(stats.byRole).map(([role, count]) => (
                        <div key={role} className="role-chip">
                        <span className="tag">{role}</span>
                        <span className="mono">{count}</span>
                        </div>
                    ))}
                    </div>
                )}

                <div className="dashboard-grid">
                    <div className="panel">
                    <div className="panel-head">
                        <h2>Pending Approvals</h2>
                        <button className="link-btn" onClick={() => setTab("Pending Approvals")}>
                        View all <Icon name="arrow" />
                        </button>
                    </div>
                    {pendingUsers.length === 0 && <p className="admin-empty">No pending approvals.</p>}
                    {pendingUsers.slice(0, 4).map((u) => (
                        <button key={u.id} className="panel-row panel-row-clickable" onClick={() => setSelectedUser(u)}>
                        <div>
                            <p className="panel-row-title">{u.full_name} <span className="mono" style={{ color: "var(--slate)" }}>@{u.username}</span></p>
                            <p className="sub">{u.role} · {u.email}</p>
                        </div>
                        <Icon name="arrow" />
                        </button>
                    ))}
                    </div>

                    <div className="panel">
                    <div className="panel-head">
                        <h2>Recent Activity</h2>
                        <button className="link-btn" onClick={() => setTab("Audit Log")}>
                        View all <Icon name="arrow" />
                        </button>
                    </div>
                    {logs.length === 0 && <p className="admin-empty">No activity yet.</p>}
                    {logs.slice(0, 5).map((log) => (
                        <div key={log.id} className="panel-row">
                        <div>
                            <p className="panel-row-title mono" style={{ fontSize: 13 }}>{log.action}</p>
                            <p className="sub">{log.username_snapshot} ({log.role_snapshot}) · {log.detail}</p>
                        </div>
                        <span className="mono" style={{ fontSize: 12, color: "var(--slate)", whiteSpace: "nowrap" }}>
                            {new Date(log.timestamp + "Z").toLocaleString()}
                        </span>
                        </div>
                    ))}
                    </div>
                </div>
                </div>
            )}

            {tab === "Pending Approvals" && !loading && (
                <div>
                {pendingUsers.length === 0 && <p className="admin-empty">No pending approvals.</p>}
                {pendingUsers.map((u) => (
                    <div key={u.id} className="admin-card admin-card-clickable" onClick={() => setSelectedUser(u)}>
                    <span className="tag">{u.role}</span>
                    <h3>{u.full_name} — @{u.username}</h3>
                    <p className="sub">{u.email}</p>
                    <div className="admin-card-actions">
                        <button className="btn-primary" onClick={(e) => { e.stopPropagation(); handleApprove(u.id); }}>Approve</button>
                        <button className="btn-primary danger" onClick={(e) => { e.stopPropagation(); handleReject(u.id); }}>Reject</button>
                        <span className="link-btn" style={{ marginLeft: "auto" }}>View details <Icon name="arrow" /></span>
                    </div>
                    </div>
                ))}
                </div>
            )}

            {tab === "All Users" && !loading && (
                <table className="admin-table">
                <thead>
                    <tr><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr>
                </thead>
                <tbody>
                    {allUsers.map((u) => {
                    const status = statusOf(u);
                    return (
                        <tr key={u.id}>
                        <td>{u.full_name} <span className="mono" style={{ color: "var(--slate)" }}>@{u.username}</span></td>
                        <td>{u.role}</td>
                        <td><span className={`status-pill ${status.cls}`}>{status.label}</span></td>
                        <td>
                            {u.role !== "admin" && (
                            <>
                                {u.is_active ? (
                                <button className="btn-ghost" style={{ marginRight: 8 }} onClick={() => handleSuspend(u.id)}>Suspend</button>
                                ) : (
                                <button className="btn-ghost" style={{ marginRight: 8 }} onClick={() => handleActivate(u.id)}>Reactivate</button>
                                )}
                                <button className="btn-ghost" onClick={() => handleDelete(u.id)}>Delete</button>
                            </>
                            )}
                        </td>
                        </tr>
                    );
                    })}
                </tbody>
                </table>
            )}

            {tab === "Audit Log" && !loading && (
                <table className="admin-table">
                <thead>
                    <tr><th>Time</th><th>User</th><th>Action</th><th>Detail</th></tr>
                </thead>
                <tbody>
                    {logs.map((log) => (
                    <tr key={log.id}>
                        <td className="mono" style={{ fontSize: 12 }}>{new Date(log.timestamp + "Z").toLocaleString()}</td>
                        <td>{log.username_snapshot} <span className="mono" style={{ color: "var(--slate)" }}>({log.role_snapshot})</span></td>
                        <td className="mono" style={{ fontSize: 12 }}>{log.action}</td>
                        <td className="sub">{log.detail}</td>
                    </tr>
                    ))}
                </tbody>
                </table>
            )}
            </main>
        </div>

        {selectedUser && (
            <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-head">
                <span className="tag">{selectedUser.role}</span>
                <button className="modal-close" onClick={() => setSelectedUser(null)} aria-label="Close">×</button>
                </div>
                <h2 className="modal-title">{selectedUser.full_name}</h2>
                <p className="sub" style={{ marginBottom: 18 }}>@{selectedUser.username}</p>

                <dl className="modal-details">
                <div className="modal-detail-row">
                    <dt>Email</dt>
                    <dd>{selectedUser.email}</dd>
                </div>
                <div className="modal-detail-row">
                    <dt>Role</dt>
                    <dd style={{ textTransform: "capitalize" }}>{selectedUser.role}</dd>
                </div>
                <div className="modal-detail-row">
                    <dt>PMDC License Number</dt>
                    <dd>{selectedUser.pmdc_license_number || "Not provided"}</dd>
                </div>
                <div className="modal-detail-row">
                    <dt>PMDC License Document</dt>
                    <dd>
                    {selectedUser.pmdc_license_file_path ? (
                        <a
                        href={`${API_BASE_URL}/${selectedUser.pmdc_license_file_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        >
                        <img
                            src={`${API_BASE_URL}/${selectedUser.pmdc_license_file_path}`}
                            alt="PMDC License"
                            style={{
                            maxWidth: "100%",
                            maxHeight: 220,
                            borderRadius: 8,
                            border: "1px solid var(--slate)",
                            display: "block",
                            marginTop: 6,
                            cursor: "zoom-in",
                            }}
                            onError={(e) => {
                            e.currentTarget.style.display = "none";
                            e.currentTarget.nextSibling.style.display = "inline";
                            }}
                        />
                        <span style={{ display: "none" }}>
                            Can't preview this file — click to open
                        </span>
                        </a>
                    ) : (
                        "Not provided"
                    )}
                    </dd>
                </div>
                {selectedUser.phone && (
                    <div className="modal-detail-row">
                    <dt>Phone</dt>
                    <dd>{selectedUser.phone}</dd>
                    </div>
                )}
                {selectedUser.created_at && (
                    <div className="modal-detail-row">
                    <dt>Applied</dt>
                    <dd>{new Date(selectedUser.created_at + "Z").toLocaleString()}</dd>
                    </div>
                )}
                </dl>

                <div className="modal-actions">
                <button className="btn-primary danger" onClick={() => handleReject(selectedUser.id)}>Reject</button>
                <button className="btn-primary" onClick={() => handleApprove(selectedUser.id)}>Approve</button>
                </div>
            </div>
            </div>
        )}
        </div>
    );
    }