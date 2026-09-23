import React, { useState } from "react";
import { useAuth } from "../AuthContext";
import { NST_CAMPUS, CAMPUSES, batchesForCampus } from "../shared";

export default function Register({ onSwitchToLogin }) {
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [campusName, setCampusName] = useState("");
  const [batchName, setBatchName] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const availableBatches = campusName ? batchesForCampus(campusName) : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      // New accounts always come in as PI -- there's no role field on this
      // form, and the server ignores one even if you send it.
      await register({
        name: name.trim(),
        email: email.trim(),
        password,
        campusName: campusName || null,
        batchName: batchName || null,
      });
    } catch (e) {
      setError(e.message || "Couldn't create your account.");
    }
    setSubmitting(false);
  }

  return (
    <div className="flex h-full min-h-[600px] items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <img src="/logo.png" alt="Newton School of Technology" className="mb-4 h-12 w-auto" />
        <h1 className="text-lg font-semibold text-slate-900">Progression Tracker</h1>
        <p className="mt-1 text-sm text-slate-500">Create your PI account.</p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Name</label>
            <input
              required autoFocus value={name} onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Email</label>
            <input
              type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="you@nst.edu"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Password</label>
            <input
              type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-400">At least 8 characters.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Campus (optional)</label>
              <select
                value={campusName}
                onChange={(e) => { setCampusName(e.target.value); setBatchName(""); }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">-- Not scoped --</option>
                {CAMPUSES.map((c) => <option key={c} value={c}>{c === NST_CAMPUS ? "Newton School of Technology" : c}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Batch (optional)</label>
              <select
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                disabled={!campusName}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none disabled:bg-slate-50"
              >
                <option value="">-- All batches --</option>
                {availableBatches.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit" disabled={submitting}
            className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50"
          >
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-snug text-slate-400">
          Already have an account?{" "}
          <button type="button" onClick={onSwitchToLogin} className="font-medium text-blue-700 hover:underline">
            Log in
          </button>
          .
        </p>
      </div>
    </div>
  );
}
