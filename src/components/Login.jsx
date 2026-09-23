import React, { useState } from "react";
import { useAuth } from "../AuthContext";

export default function Login({ onSwitchToRegister }) {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
    } catch (e) {
      setError(e.message || "Couldn't log in -- check your email and password.");
    }
    setSubmitting(false);
  }

  return (
    <div className="flex h-full min-h-[600px] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <img src="/logo.png" alt="Newton School of Technology" className="mb-4 h-12 w-auto" />
        <h1 className="text-lg font-semibold text-slate-900">Progression Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">Log in to your account.</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input
              type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="you@nst.edu"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
            <input
              type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={submitting}
            className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {submitting ? "Logging in…" : "Log in"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-snug text-slate-400">
          No account yet?{" "}
          <button type="button" onClick={onSwitchToRegister} className="font-medium text-blue-700 hover:underline">
            Register here
          </button>
          .
        </p>
      </div>
    </div>
  );
}
