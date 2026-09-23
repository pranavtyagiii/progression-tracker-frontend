import { useState, useEffect } from "react";
import { ArrowLeft, ChevronRight, Save, Search } from "lucide-react";
import { effortLevel, useDraftAutosave, loadDraft, clearDraft, timeAgo } from "../shared";
import { CategoryPill, Field, inputCls } from "../ui";
import SessionAssistPanel from "./SessionAssistPanel";

function AddFollowUpForm({ students, studentStates, settings, onSave, onCancel, prefillUrn }) {
  const DRAFT_KEY = "draft_followup";
  const blankForm = { date: new Date().toISOString().slice(0, 10), hours: "", pctCompleted: "", notes: "", updatedActionPlan: "", nextDate: "" };
  const [urn, setUrn] = useState(prefillUrn && students[prefillUrn] ? prefillUrn : "");
  const [form, setForm] = useState(blankForm);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [resumeOffer, setResumeOffer] = useState(null);

  useEffect(() => {
    (async () => {
      // Arriving with a specific student in mind (from the Follow-Ups Due list) should win
      // over an unrelated leftover draft, same as AddStudentForm's prefill handling.
      if (prefillUrn && students[prefillUrn]) { setDraftLoaded(true); return; }
      const d = await loadDraft(DRAFT_KEY);
      if (d && d.data && d.data.urn && students[d.data.urn]) setResumeOffer(d);
      else if (d) clearDraft(DRAFT_KEY); // stale draft for a student that no longer exists
      setDraftLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matches = Object.values(students).filter(
    (s) => s.hasSession && query && (s.name.toLowerCase().includes(query.toLowerCase()) || s.urn.toLowerCase().includes(query.toLowerCase()))
  );
  const selected = urn ? students[urn] : null;
  const priorState = urn ? studentStates[urn] : null;

  const hasContent = !!urn && (form.hours !== "" || form.pctCompleted !== "" || form.notes.trim() !== "");
  const savedAt = useDraftAutosave(DRAFT_KEY, { urn, form }, draftLoaded && hasContent);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function resume() {
    setUrn(resumeOffer.data.urn);
    setForm({ ...blankForm, ...resumeOffer.data.form });
    setResumeOffer(null);
  }
  function discardDraft() {
    clearDraft(DRAFT_KEY);
    setResumeOffer(null);
  }

  function submit(e) {
    e.preventDefault();
    if (!urn) { setError("Select a student first."); return; }
    if (form.hours === "" || isNaN(Number(form.hours))) { setError("Enter Productive Weekly Hours as a number."); return; }
    if (form.pctCompleted === "" || isNaN(Number(form.pctCompleted))) { setError("Enter % of Action Plan Completed as a number."); return; }
    setError("");
    clearDraft(DRAFT_KEY);
    onSave({ urn, ...form, hours: Number(form.hours), pctCompleted: Number(form.pctCompleted) });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onCancel && (
            <button type="button" onClick={onCancel} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft size={14} /> Cancel
            </button>
          )}
          <h1 className="text-xl font-semibold text-slate-900">Log a follow-up</h1>
        </div>
        {hasContent && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Save size={12} /> {savedAt ? `Saved ${timeAgo(savedAt)}` : "Saving…"}
          </span>
        )}
      </div>
      <p className="mb-5 text-sm text-slate-500">
        Run this live with the student -- every field autosaves as you go, so an interrupted session never loses its notes.
      </p>

      {resumeOffer && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <span className="text-amber-800">
            You have an unfinished follow-up for <strong>{students[resumeOffer.data.urn]?.name || resumeOffer.data.urn}</strong> from {timeAgo(resumeOffer.savedAt)}.
          </span>
          <div className="flex shrink-0 gap-2">
            <button onClick={resume} className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700">Resume</button>
            <button onClick={discardDraft} className="rounded border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-100">Discard</button>
          </div>
        </div>
      )}

      {!selected ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <Field label="Find student by name or URN">
            <div className="relative">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input className={inputCls + " pl-8"} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Start typing…" autoFocus />
            </div>
          </Field>
          <div className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto">
            {matches.map((s) => (
              <button key={s.urn} onClick={() => { setUrn(s.urn); setQuery(""); }} className="flex w-full items-center justify-between py-2 text-left hover:bg-slate-50">
                <div>
                  <div className="text-sm font-medium text-slate-800">{s.name}</div>
                  <div className="text-xs text-slate-400">{s.urn} · {s.batch}</div>
                </div>
                <ChevronRight size={14} className="text-slate-300" />
              </button>
            ))}
            {query && matches.length === 0 && <p className="py-2 text-xs text-slate-400">No students match "{query}".</p>}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
            <div>
              <div className="text-sm font-semibold text-slate-800">{selected.name}</div>
              <div className="text-xs text-slate-500">
                {selected.urn} · {selected.batch} · Follow-up #{(priorState ? priorState.followUpCount : 0) + 1}
                {priorState && priorState.followUpCount > 0 && <> · last: {priorState.hours} hrs/wk, <CategoryPill category={priorState.category} /></>}
              </div>
            </div>
            <button type="button" onClick={() => { setUrn(""); clearDraft(DRAFT_KEY); }} className="text-xs text-slate-400 hover:text-slate-700">Change</button>
          </div>

          <Field label="Follow-Up Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Productive Weekly Hours"><input type="number" min="0" className={inputCls} value={form.hours} onChange={(e) => set("hours", e.target.value)} /></Field>
            <Field label="% of Action Plan Completed"><input type="number" min="0" max="100" className={inputCls} value={form.pctCompleted} onChange={(e) => set("pctCompleted", e.target.value)} /></Field>
          </div>
          {form.hours !== "" && form.pctCompleted !== "" && !isNaN(Number(form.hours)) && !isNaN(Number(form.pctCompleted)) && (
            (() => {
              const prevHours = priorState ? priorState.hours : selected.hours;
              const prevEffort = priorState ? priorState.effort : effortLevel(selected.hours, settings.hoursThreshold);
              const prevCategory = priorState ? priorState.category : matrixCategory(prevEffort, selected.riskStatus);
              const thisEffort = effortLevel(Number(form.hours), settings.hoursThreshold);
              const thisTaskFollowThrough = riskStatus(Number(form.pctCompleted), settings.pctThreshold);
              const thisCategory = matrixCategory(thisEffort, thisTaskFollowThrough);
              const shiftEffort = thisEffort === prevEffort ? "No Change" : (thisEffort === "High Effort" ? "Increased" : "Decreased");
              const pr = RISK_RANK[prevCategory], tr = RISK_RANK[thisCategory];
              const shiftRisk = tr > pr ? "Better than last session" : tr < pr ? "Needs Support" : "Same as last session";
              return (
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-slate-50 p-3 text-xs sm:grid-cols-3">
                  <div><span className="text-slate-400">Previous Session's Hours</span><div className="font-medium text-slate-700">{prevHours}</div></div>
                  <div><span className="text-slate-400">Effort Level -- Previous</span><div className="font-medium text-slate-700">{prevEffort}</div></div>
                  <div><span className="text-slate-400">Effort Level -- This Session</span><div className="font-medium text-slate-700">{thisEffort}</div></div>
                  <div><span className="text-slate-400">Shift in Effort</span><div className="font-medium text-slate-700">{shiftEffort}</div></div>
                  <div><span className="text-slate-400">Task Follow-Through</span><div className="font-medium text-slate-700">{thisTaskFollowThrough}</div></div>
                  <div><span className="text-slate-400">Previous Risk Category</span><div><CategoryPill category={prevCategory} /></div></div>
                  <div><span className="text-slate-400">Current Risk Category</span><div><CategoryPill category={thisCategory} /></div></div>
                  <div className="col-span-2 sm:col-span-1"><span className="text-slate-400">Shift in Risk</span><div className="font-medium text-slate-700">{shiftRisk}</div></div>
                </div>
              );
            })()
          )}
          <SessionAssistPanel
            mode="followup" studentName={selected.name}
            onApply={(d) => setForm((f) => ({ ...f, notes: d.notes || f.notes, updatedActionPlan: d.updatedActionPlan || f.updatedActionPlan }))}
          />
          <Field label="Updates on Tasks Given"><textarea className={inputCls} rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} /></Field>
          <Field label="Updated Action Plan (if changed)"><textarea className={inputCls} rows={2} value={form.updatedActionPlan} onChange={(e) => set("updatedActionPlan", e.target.value)} /></Field>
          <Field label="Next Follow-Up Date (optional)"><input type="date" className={inputCls} value={form.nextDate} onChange={(e) => set("nextDate", e.target.value)} /></Field>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800">Save follow-up</button>
        </form>
      )}
    </div>
  );
}

// ============================================================
// WEEKLY DASHBOARD -- mirrors your Batch KPI Dashboard script's
// week x batch table: session counts, quality breakdown, and
// follow-up summary. (Left out: the fuzzy "Subjective Read
// Insights" / "Summarised Action Plans" themed text summaries --
// happy to add those next if useful, kept this focused for now.)
// ============================================================
// ============================================================
// SUBJECTIVE READ INSIGHTS + SUMMARISED ACTION PLANS -- ported
// directly from your Batch KPI Dashboard script's _weekInsights and
// _getAPSummaryCategories. Same keyword themes, same "• Notes: X/Y
// sessions" / "• Plans: X/Y sessions" count-line convention.
// ============================================================


export default AddFollowUpForm;
