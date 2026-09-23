import { useState } from "react";
import { CATEGORY_META, CATEGORY_ORDER } from "../shared";
import { CategoryPill, Field, inputCls } from "../ui";

function SettingsView({ settings, onSave }) {
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);

  function submit(e) {
    e.preventDefault();
    onSave({ hoursThreshold: Number(form.hoursThreshold), pctThreshold: Number(form.pctThreshold) });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-semibold text-slate-900">Settings</h1>
      <p className="mb-5 text-sm text-slate-500">These two thresholds decide every student's 2×2 Matrix category. Change them and everyone's status recalculates immediately.</p>

      <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <Field label="Productive Weekly Hours threshold" hint="At or above this = High Effort.">
          <input type="number" min="0" className={inputCls} value={form.hoursThreshold} onChange={(e) => setForm((f) => ({ ...f, hoursThreshold: e.target.value }))} />
        </Field>
        <Field label="% Action Plan Completed threshold" hint="At or above this = No Risk / on track.">
          <input type="number" min="0" max="100" className={inputCls} value={form.pctThreshold} onChange={(e) => setForm((f) => ({ ...f, pctThreshold: e.target.value }))} />
        </Field>

        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          <div className="mb-2 font-medium text-slate-600">The 2×2 Matrix these two numbers produce:</div>
          <div className="grid grid-cols-2 gap-2">
            {CATEGORY_ORDER.map((c) => (
              <div key={c} className="flex items-center gap-1.5"><CategoryPill category={c} /><span>{CATEGORY_META[c].desc}</span></div>
            ))}
          </div>
        </div>

        <button type="submit" className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800">
          {saved ? "Saved ✓" : "Save settings"}
        </button>
      </form>
    </div>
  );
}

export default SettingsView;
