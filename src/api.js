// Every call to the backend goes through here. Replaces window.storage
// (the Claude-artifact-only API the old version used) with real HTTP
// requests to the Express API, carrying the logged-in user's token.

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";
const TOKEN_KEY = "pt_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401) {
    // Token missing/expired/invalid -- the caller (AuthContext) treats this
    // as "log out and show the login screen again", not a per-request error
    // the rest of the app needs to individually handle.
    setToken(null);
    window.dispatchEvent(new Event("pt:unauthorized"));
    throw new ApiError("Session expired -- please log in again.", 401);
  }

  if (res.status === 204) return null;

  let body;
  try { body = await res.json(); } catch (e) { body = null; }

  if (!res.ok) {
    throw new ApiError((body && body.error) || `Request failed (${res.status})`, res.status);
  }
  return body;
}

export const api = {
  login: (email, password) => request("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  me: () => request("/api/auth/me"),

  listUsers: () => request("/api/auth/users"),
  createUser: (data) => request("/api/auth/users", { method: "POST", body: JSON.stringify(data) }),
  updateUser: (id, patch) => request(`/api/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  listCampuses: () => request("/api/campuses"),
  createCampus: (data) => request("/api/campuses", { method: "POST", body: JSON.stringify(data) }),
  getSettings: (campusId) => request(`/api/campuses/${campusId}/settings`),
  updateSettings: (campusId, patch) => request(`/api/campuses/${campusId}/settings`, { method: "PATCH", body: JSON.stringify(patch) }),

  listStudents: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    return request(`/api/students${qs ? `?${qs}` : ""}`);
  },
  getStudent: (urn) => request(`/api/students/${encodeURIComponent(urn)}`),
  saveStudent: (urn, data, isEdit) => request(`/api/students/${encodeURIComponent(urn)}${isEdit ? "?isEdit=true" : ""}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteStudent: (urn) => request(`/api/students/${encodeURIComponent(urn)}`, { method: "DELETE" }),

  listFollowUps: (params = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")).toString();
    return request(`/api/followups${qs ? `?${qs}` : ""}`);
  },
  listFollowUpsForStudent: (urn) => request(`/api/followups/student/${encodeURIComponent(urn)}`),
  createFollowUp: (urn, data) => request(`/api/followups/student/${encodeURIComponent(urn)}`, { method: "POST", body: JSON.stringify(data) }),
  deleteFollowUp: (id) => request(`/api/followups/${id}`, { method: "DELETE" }),

  draftWithAI: (transcript, mode, studentName) => request("/api/ai/draft", { method: "POST", body: JSON.stringify({ transcript, mode, studentName }) }),
};

export { ApiError };
