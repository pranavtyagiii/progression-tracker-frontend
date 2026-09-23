import { useState, useEffect } from "react";
import { ArrowLeft, Save } from "lucide-react";
import {
  NST_CAMPUS, CAMPUSES, batchesForCampus, SESSION_TYPES, IN_OUT, COHORTS, STUDY_PATTERNS,
  effortLevel, avgConfidence, overallRiskStatusFromConfidence, matrixCategory, scoreSessionQuality,
  useDraftAutosave, loadDraft, clearDraft, timeAgo,
} from "../shared";
import { CategoryPill, QualityPill, Field, inputCls } from "../ui";
import SessionAssistPanel from "./SessionAssistPanel";

function AddStudentForm({ settings, prefill, defaultCampus, onSave, onCancel }) {
  const DRAFT_KEY = "draft_student";
  const blank = {
    urn: "", name: "", campus: defaultCampus || NST_CAMPUS, batch: batchesForCampus(defaultCampus || NST_CAMPUS)[0], lab: "", email: "",
    date: new Date().toISOString().slice(0, 10), sessionType: SESSION_TYPES[0], inboundOutbound: IN_OUT[0], cohort: COHORTS[1],
    dsaConfidence: "", dsaMarks: "", maths3Confidence: "", maths3Marks: "", wapConfidence: "", wapMarks: "", dvaConfidence: "", dvaMarks: "",
    hours: "", studyPattern: STUDY_PATTERNS[0], selfOwnership: "", rootCause: "", subjectiveRead: "", actionPlan: "", nextFollowUpDate: "",
  };
  const isCompletingRoster = !!(prefill && prefill.urn);
  const isEdit = isCompletingRoster && prefill.hasSession;
  // Editing an existing session should keep its real date; only a fresh "conduct 1st
  // session" (roster-only, no date yet) defaults to today.
  const [form, setForm] = useState(() => {
    if (!prefill) return blank;
    const merged = { ...blank, ...prefill };
    if (!isEdit) merged.date = new Date().toISOString().slice(0, 10);
    return merged;
  });
  const [error, setError] = useState("");
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [resumeOffer, setResumeOffer] = useState(null);

  useEffect(() => {
    (async () => {
      // Skip draft-resume when arriving with a specific prefilled student -- that
      // intent should win over an unrelated leftover draft.
      if (isCompletingRoster) { setDraftLoaded(true); return; }
      const d = await loadDraft(DRAFT_KEY);
      if (d && d.data && (d.data.urn || d.data.name)) setResumeOffer(d);
      setDraftLoaded(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasContent = form.urn.trim() !== "" || form.name.trim() !== "";
  const savedAt = useDraftAutosave(DRAFT_KEY, form, draftLoaded && hasContent && !isEdit);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function resume() {
    setForm({ ...blank, ...resumeOffer.data });
    setResumeOffer(null);
  }
  function discardDraft() {
    clearDraft(DRAFT_KEY);
    setResumeOffer(null);
  }

  function submit(e) {
    e.preventDefault();
    if (!form.urn.trim() || !form.name.trim()) { setError("URN and Name are required."); return; }
    if (form.hours === "" || isNaN(Number(form.hours))) { setError("Enter Productive Weekly Hours as a number."); return; }
    setError("");
    clearDraft(DRAFT_KEY);
    onSave({ ...form, urn: form.urn.trim(), hours: Number(form.hours), hasSession: true });
  }

  const previewEffort = form.hours !== "" && !isNaN(Number(form.hours)) ? effortLevel(Number(form.hours), settings.hoursThreshold) : null;
  const previewAvgConf = avgConfidence(form);
  const previewRisk = overallRiskStatusFromConfidence(previewAvgConf, settings.avgConfidenceThreshold);
  const previewCategory = previewEffort ? matrixCategory(previewEffort, previewRisk) : null;
  const previewQuality = scoreSessionQuality(form.subjectiveRead, form.actionPlan, previewCategory);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {onCancel && (
            <button type="button" onClick={onCancel} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft size={14} /> Cancel
            </button>
          )}
          <h1 className="text-xl font-semibold text-slate-900">
            {isEdit ? `Edit 1st session -- ${prefill.name}` : isCompletingRoster ? `Conduct 1st session -- ${prefill.name}` : "Add student -- 1st session"}
          </h1>
        </div>
        {hasContent && !isEdit && (
          <span className="flex items-center gap-1 text-xs text-slate-400">
            <Save size={12} /> {savedAt ? `Saved ${timeAgo(savedAt)}` : "Saving…"}
          </span>
        )}
      </div>
      <p className="mb-5 text-sm text-slate-500">
        {isEdit
          ? "Update marks, confidence, or anything else from this student's baseline -- useful throughout the semester as new data comes in."
          : isCompletingRoster
          ? "Already in your roster from import -- filling this in completes their baseline."
          : "Same fields as the Sem 3 sheet. Run it live with the student -- everything autosaves as you go."}
      </p>

      {resumeOffer && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <span className="text-amber-800">
            You have an unfinished session for <strong>{resumeOffer.data.name || resumeOffer.data.urn}</strong> from {timeAgo(resumeOffer.savedAt)}.
          </span>
          <div className="flex shrink-0 gap-2">
            <button onClick={resume} className="rounded bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700">Resume</button>
            <button onClick={discardDraft} className="rounded border border-amber-300 px-2.5 py-1 text-xs text-amber-700 hover:bg-amber-100">Discard</button>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Identity</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="URN" hint={isCompletingRoster ? "Locked -- this identifies the student." : undefined}>
              <input className={inputCls + (isCompletingRoster ? " bg-slate-50 text-slate-500" : "")} value={form.urn} onChange={(e) => set("urn", e.target.value)} placeholder="E25B070709" disabled={isCompletingRoster} readOnly={isCompletingRoster} />
            </Field>
            <Field label="Name"><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Student name" /></Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Campus" hint={isCompletingRoster ? "Editable -- fix this if a student was assigned to the wrong campus." : undefined}>
              <select
                className={inputCls} value={form.campus}
                onChange={(e) => {
                  const nextCampus = e.target.value;
                  const validBatches = batchesForCampus(nextCampus);
                  setForm((f) => ({ ...f, campus: nextCampus, batch: validBatches.includes(f.batch) ? f.batch : validBatches[0] }));
                }}
              >
                {CAMPUSES.map((c) => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Batch" hint={form.campus !== NST_CAMPUS ? "Admission year" : undefined}>
              <select className={inputCls} value={form.batch} onChange={(e) => set("batch", e.target.value)}>
                {batchesForCampus(form.campus).map((b) => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Lab (optional)"><input className={inputCls} value={form.lab} onChange={(e) => set("lab", e.target.value)} /></Field>
          </div>
          <div className="mt-4">
            <Field label="Student Email (optional)" hint="Used only for the 'Email Action Plan' button -- opens your own email client, nothing is sent automatically.">
              <input type="email" className={inputCls} value={form.email || ""} onChange={(e) => set("email", e.target.value)} placeholder="student@example.com" />
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Session Context</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="1-on-1 Date"><input type="date" className={inputCls} value={form.date} onChange={(e) => set("date", e.target.value)} /></Field>
            <Field label="Session Type">
              <select className={inputCls} value={form.sessionType} onChange={(e) => set("sessionType", e.target.value)}>
                {SESSION_TYPES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Inbound/Outbound">
              <select className={inputCls} value={form.inboundOutbound} onChange={(e) => set("inboundOutbound", e.target.value)}>
                {IN_OUT.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Cohort">
              <select className={inputCls} value={form.cohort} onChange={(e) => set("cohort", e.target.value)}>
                {COHORTS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Academic Diagnostic -- Confidence % and Marks per subject</div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2 text-xs font-medium text-slate-400">
              <span>Subject</span><span>Confidence %</span><span>Marks</span><span>Risk (auto)</span>
            </div>
            {SUBJECTS.map((s) => {
              const conf = form[s.key + "Confidence"];
              const risk = subjectRiskLabel(conf);
              return (
                <div key={s.key} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                  <span className="text-sm font-medium text-slate-700">{s.label}</span>
                  <input type="number" min="0" max="100" className={inputCls} value={conf} onChange={(e) => set(s.key + "Confidence", e.target.value)} placeholder="%" />
                  <input type="number" min="0" max="100" className={inputCls} value={form[s.key + "Marks"]} onChange={(e) => set(s.key + "Marks", e.target.value)} placeholder="marks" />
                  <span className="w-32 text-xs">
                    {risk ? <span style={{ color: risk === "Critical Risk" ? "#DC2626" : risk === "Attention Required" ? "#EA580C" : risk === "Stable" ? "#CA8A04" : "#16A34A" }}>{risk}</span> : <span className="text-slate-300">—</span>}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Effort</div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Productive Weekly Hours (after class)"><input type="number" min="0" className={inputCls} value={form.hours} onChange={(e) => set("hours", e.target.value)} placeholder="e.g. 10" /></Field>
            <Field label="Study Pattern">
              <select className={inputCls} value={form.studyPattern} onChange={(e) => set("studyPattern", e.target.value)}>
                {STUDY_PATTERNS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </div>
        </div>

        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Qualitative Read</div>
          <Field label="Self Ownership Level">
            <select className={inputCls} value={form.selfOwnership} onChange={(e) => set("selfOwnership", e.target.value)}>
              <option value="">Select…</option>
              {OWNERSHIP_LEVELS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </Field>
          <div className="mt-4">
            <SessionAssistPanel
              mode="baseline" studentName={form.name}
              onApply={(d) => setForm((f) => ({ ...f, subjectiveRead: d.subjectiveRead || f.subjectiveRead, actionPlan: d.actionPlan || f.actionPlan }))}
            />
          </div>
          <div className="mt-4"><Field label="Root Cause of Academic Gap (optional)"><input className={inputCls} value={form.rootCause} onChange={(e) => set("rootCause", e.target.value)} placeholder="e.g. Conceptual Gaps, Practice Deficiency" /></Field></div>
          <div className="mt-4"><Field label="Subjective Read (optional)"><textarea className={inputCls} rows={3} value={form.subjectiveRead} onChange={(e) => set("subjectiveRead", e.target.value)} /></Field></div>
          <div className="mt-4"><Field label="Action Plan given by PI (optional)"><textarea className={inputCls} rows={2} value={form.actionPlan} onChange={(e) => set("actionPlan", e.target.value)} /></Field></div>
          <div className="mt-4"><Field label="Next Follow-Up Date (optional)"><input type="date" className={inputCls} value={form.nextFollowUpDate} onChange={(e) => set("nextFollowUpDate", e.target.value)} /></Field></div>
        </div>

        {previewCategory && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-500">Avg Confidence: <strong className="text-slate-700">{previewAvgConf !== null ? Math.round(previewAvgConf) + "%" : "—"}</strong></span>
              <span className="text-slate-500">Overall Risk: <strong className="text-slate-700">{previewRisk}</strong></span>
              <span className="text-slate-500">Places them in:</span>
              <CategoryPill category={previewCategory} />
              <span className="text-slate-500">Session quality:</span>
              <QualityPill quality={previewQuality.label} />
            </div>
            {previewQuality.reason && <div className="mt-1.5 text-xs text-slate-400">{previewQuality.reason}</div>}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800">Save student</button>
      </form>
    </div>
  );
}

// ============================================================
// ADD FOLLOW-UP
// ============================================================


export default AddStudentForm;
