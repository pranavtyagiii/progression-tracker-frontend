import React, { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, ApiError } from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadMe() {
    if (!getToken()) { setUser(null); setLoading(false); return; }
    try {
      const me = await api.me();
      setUser(me);
    } catch (e) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMe();
    // If any API call anywhere gets a 401 (token expired), drop back to the
    // login screen immediately rather than leaving stale data on screen.
    const onUnauthorized = () => setUser(null);
    window.addEventListener("pt:unauthorized", onUnauthorized);
    return () => window.removeEventListener("pt:unauthorized", onUnauthorized);
  }, []);

  async function login(email, password) {
    const { token, user } = await api.login(email, password);
    setToken(token);
    setUser(user);
  }

  async function register(data) {
    const { token, user } = await api.register(data);
    setToken(token);
    setUser(user);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, isAdmin: user?.role === "Admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
