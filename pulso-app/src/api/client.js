import { API_BASE_URL } from "../config";

let authToken = null;

export function setAuthToken(token) {
  authToken = token;
}

// Set by AuthProvider so the client can force a logout on a 401 from any call, not just the
// ones the auth screen itself makes (e.g. a session that expired mid-session).
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

async function request(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (authToken) headers.Authorization = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await res.json() : null;

  if (res.status === 401 && onUnauthorized) onUnauthorized();

  if (!res.ok) {
    throw new Error(body?.error || `Error ${res.status} al llamar ${path}`);
  }
  return body;
}

export const api = {
  get: (path) => request(path),
  post: (path, data) => request(path, { method: "POST", body: JSON.stringify(data) }),
  patch: (path, data) => request(path, { method: "PATCH", body: JSON.stringify(data) }),
  put: (path, data) => request(path, { method: "PUT", body: JSON.stringify(data) }),
  del: (path) => request(path, { method: "DELETE" }),
};
