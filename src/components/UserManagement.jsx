import { useEffect, useState } from "react";
import { UserCog, X } from "lucide-react";
import { api } from "../api";
import { NST_CAMPUS, CAMPUSES, batchesForCampus } from "../shared";
import { Field, inputCls } from "../ui";

export default function UserManagement() {
  const [users, setUsers] = useState(null);
  const [campuses, setCampuses] = useState([]);
  const [error, setError] = useState("");

  const blank = { name: "", email: "", password: "", role: "PI", campusName: "", batchName: "" };
  const [form, setForm] = useState(blank);
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const [u, c] = await Promise.all([api.listUsers(), api.listCampuses()]);
      setUsers(u);
      setCampuses(c);
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, []);

  async function createUser(e) {
    e.preventDefault();
    setError("");
    setCreating(true);
    try {
      const campus = campuses.find((c) => c.name === form.campusName);
      await api.createUser({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
        campusId: campus ? campus.id : null,
        batchName: form.batchName || null,
      });
      setForm(blank);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setCreating(false);
  }

  async function updateUser(id, patch) {
    setError("");
    try {
      await api.updateUser(id, patch);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  const availableBatches = form.campusName ? batchesForCampus(form.campusName) : [];

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold text-slate-900">
        <UserCog size={20} /> Team
      </h1>
      <p className="mb-5 text-sm text-slate-500">
        Add your PIs here. Each person logs in with their own email and password -- there's no self-signup, and no
        "pick your name" shortcut anymore. Scoping someone to a campus and batch means their view (and their write
        access, enforced by the server, not just hidden in the interface) is limited to just that batch.
      </p>

      <form onSubmit={createUser} className="mb-6 space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required /></Field>
          <Field label="Email"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} required /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Temporary password" hint="At least 8 characters -- share this with them directly, not over an unsecured channel.">
            <input type="text" className={inputCls} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} required minLength={8} />
          </Field>
          <Field label="Role">
            <select className={inputCls} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              <option>PI</option>
              <option>Admin</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Scope to campus (optional)" hint="Leave blank for unrestricted access.">
            <select className={inputCls} value={form.campusName} onChange={(e) => setForm((f) => ({ ...f, campusName: e.target.value, batchName: "" }))}>
              <option value="">-- Not scoped --</option>
              {CAMPUSES.map((c) => <option key={c} value={c}>{c === NST_CAMPUS ? "Newton School of Technology" : c}</option>)}
            </select>
          </Field>
          <Field label="Scope to batch (optional)">
            <select className={inputCls} value={form.batchName} onChange={(e) => setForm((f) => ({ ...f, batchName: e.target.value }))} disabled={!form.campusName}>
              <option value="">-- All batches at this campus --</option>
              {availableBatches.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={creating} className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50">
          {creating ? "Creating…" : "Create login"}
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Email</th>
              <th className="px-4 py-2.5 font-medium">Role</th>
              <th className="px-4 py-2.5 font-medium">Scope</th>
              <th className="px-4 py-2.5 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {users === null && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>}
            {users && users.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No one added yet.</td></tr>}
            {users && users.map((u) => (
              <tr key={u.id} className={`border-b border-slate-100 last:border-0 ${!u.is_active ? "opacity-40" : ""}`}>
                <td className="px-4 py-2.5 font-medium text-slate-800">{u.name}</td>
                <td className="px-4 py-2.5 text-slate-500">{u.email}</td>
                <td className="px-4 py-2.5">
                  <select className="rounded-lg border border-slate-300 px-2 py-1 text-xs" value={u.role} onChange={(e) => updateUser(u.id, { role: e.target.value })}>
                    <option>PI</option>
                    <option>Admin</option>
                  </select>
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-500">
                  {u.campus_name ? `${u.campus_name === NST_CAMPUS ? "NST" : u.campus_name}${u.batch_name ? " · " + u.batch_name : ""}` : "Unrestricted"}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => updateUser(u.id, { isActive: !u.is_active })}
                    title={u.is_active ? "Deactivate" : "Reactivate"}
                    className="rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                  >
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
