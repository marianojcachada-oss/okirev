import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api, setAuthToken, setUnauthorizedHandler } from "../api/client";

const AuthContext = createContext(null);

const STORAGE_KEY = "oklrev_session_token";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const applySession = useCallback((sessionUser) => {
    setUser(sessionUser);
    setAuthToken(sessionUser?.token || null);
    if (sessionUser?.token) {
      localStorage.setItem(STORAGE_KEY, sessionUser.token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => applySession(null));
  }, [applySession]);

  useEffect(() => {
    async function init() {
      // If the tracker opened us with ?token=..., that takes priority over any stored session.
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token");
      const token = urlToken || localStorage.getItem(STORAGE_KEY);

      if (urlToken) {
        // Clean the token out of the visible URL once we've read it.
        params.delete("token");
        const clean = window.location.pathname + (params.toString() ? `?${params}` : "");
        window.history.replaceState({}, "", clean);
      }

      if (!token) {
        setLoading(false);
        return;
      }

      setAuthToken(token);
      try {
        const me = await api.get("/auth/me");
        applySession(me);
      } catch {
        applySession(null);
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [applySession]);

  async function login(username, password) {
    const result = await api.post("/auth/login", { username, password });
    applySession(result);
    return result;
  }

  async function logout() {
    try {
      await api.post("/auth/logout", {});
    } catch {
      // ignore — we're logging out locally regardless
    }
    applySession(null);
  }

  function hasPermission(pageId) {
    if (!user) return false;
    if (!user.role) return false; // logged in but no role assigned yet = no pages visible
    return user.role.permissions.includes(pageId) || user.role.permissions.includes(`${pageId}:own`);
  }

  function isOwnScoped(pageId) {
    return !!user?.role?.permissions.includes(`${pageId}:own`);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission, isOwnScoped }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
