import { useState, useRef } from "react";
import Papa from "papaparse";
import { Download, Upload, RotateCcw } from "lucide-react";
import { NST_CAMPUS, CAMPUSES, batchesForCampus, SESSION_TYPES, IN_OUT, COHORTS, STUDY_PATTERNS, OWNERSHIP_LEVELS, riskStatus } from "../shared";
import { StatCard, inputCls } from "../ui";

const IMPORT_TEMPLATE_HEADERS = [
  "URN", "Name", "Campus", "Batch", "Lab", "Email", "1-on-1 Date", "Session Type", "Inbound/Outbound", "Cohort",
  "DSA Confidence", "DSA Marks", "Maths 3 Confidence %", "Maths 3 Marks", "WAP ConfIdence %", "WAP Marks",
  "DVA Confidence %", "DVA Marks", "Productive Weekly Hours (after class)", "Study Pattern",
  "Self Ownership Level", "Root Cause of Academic Gap", "Subjective Read ()", "Action Plan given by PI", "Follow-Up Date",
];
const HEADER_ALIASES = {
  urn: ["urn"],
  name: ["name"],
  campus: ["campus"],
  batch: ["batch"],
  lab: ["lab"],
  email: ["email", "studentemail"],
  date: ["date", "1on1date", "1stsessiondate"],
  sessionType: ["sessiontype"],
  inboundOutbound: ["inboundoutbound"],
  cohort: ["cohort"],
  dsaConfidence: ["dsaconfidence"],
  dsaMarks: ["dsamarks"],
  maths3Confidence: ["maths3confidence"],
  maths3Marks: ["maths3marks"],
  wapConfidence: ["wapconfidence"],
  wapMarks: ["wapmarks"],
  dvaConfidence: ["dvaconfidence"],
  dvaMarks: ["dvamarks"],
  hours: ["hours", "productiveweeklyhoursafterclass", "productiveweeklyhours"],
  studyPattern: ["studypattern"],
  selfOwnership: ["selfownership", "selfownershiplevel"],
  rootCause: ["rootcause", "rootcauseofacademicgap"],
  subjectiveRead: ["subjectiveread"],
  actionPlan: ["actionplan", "actionplangivenbypi", "initialactionplan"],
  nextFollowUpDate: ["followupdate", "nextfollowupdate"],
};
// Columns the real sheet has that are AUTO-DERIVED in this tool -- recognized so they
// don't get mistaken for unmapped/unknown columns, but their values are never imported.
const AUTO_DERIVED_HEADER_NAMES = ["dsarisk", "maths3risk", "wa prisk", "wapisk", "wapisk", "dvarisk",
  "effortcategory", "avgacademicconfidence", "overallriskstatus", "2x2matrixeffortvsperformance"];
function normHeader(h) { return String(h || "").toLowerCase().replace(/[^a-z0-9]/g, ""); }

function downloadCsvTemplate() {
  const example = [
    "E25B070800", "Aarav Mehta", NST_CAMPUS, "Ramanujan", "Infinity", "aarav.mehta@example.com", "2026-08-12", "One-on-One", "Outbound", "Middle Cohort",
    "70", "68", "60", "62", "75", "70", "", "", "10", "Random/Ad-hoc",
    "Cooperative (Responds when guided)", "Practice Deficiency, Time Management", "Motivated but unstructured.",
    "Build a daily 1-hr practice block.", "",
  ];
  const csv = IMPORT_TEMPLATE_HEADERS.join(",") + "\n" + example.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "sem3_student_import_template.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ============================================================
// IMPORT DATA -- merged entry point. Pick the campus and whether
// you're uploading 1st sessions or follow-ups, then the right
// upload flow (student roster or follow-up log) appears below.
// ============================================================
function ImportDataView({ students, onImportStudents, onImportFollowUps, defaultCampus }) {
  const [importCampus, setImportCampus] = useState(defaultCampus || NST_CAMPUS);
  const [importType, setImportType] = useState("students"); // "students" | "followups"

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import Data</h1>
        <p className="text-sm text-slate-500">Choose the campus and what you're uploading, then bring in the CSV below.</p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">Campus</div>
          <select value={importCampus} onChange={(e) => setImportCampus(e.target.value)} className={inputCls}>
            {CAMPUSES.map((c) => <option key={c} value={c}>{c === NST_CAMPUS ? "Newton School of Technology" : c}</option>)}
          </select>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium text-slate-700">What are you uploading?</div>
          <div className="flex rounded-lg border border-slate-300 p-0.5">
            <button
              onClick={() => setImportType("students")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${importType === "students" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              1st Sessions
            </button>
            <button
              onClick={() => setImportType("followups")}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${importType === "followups" ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}
            >
              Follow-Ups
            </button>
          </div>
        </div>
        <div className="ml-auto text-xs text-slate-400">
          Importing <strong className="text-slate-600">{importType === "students" ? "1st Sessions" : "Follow-Ups"}</strong> for{" "}
          <strong className="text-slate-600">{importCampus === NST_CAMPUS ? "Newton School of Technology" : importCampus}</strong>
        </div>
      </div>

      {importType === "students" ? (
        <ImportStudentsView students={students} onImport={onImportStudents} importCampus={importCampus} />
      ) : (
        <ImportFollowUpsView students={students} onImport={onImportFollowUps} importCampus={importCampus} />
      )}
    </div>
  );
}

function ImportStudentsView({ students, onImport, importCampus }) {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState(null); // parsed + validated rows, or null before parsing
  const [dupeMode, setDupeMode] = useState("skip"); // "skip" | "overwrite"
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRawText(String(ev.target.result || ""));
    reader.readAsText(file);
  }

  function parse() {
    if (!rawText.trim()) return;
    const result = Papa.parse(rawText.trim(), { header: true, skipEmptyLines: true });
    const fieldMap = {}; // csv header index -> our field name
    (result.meta.fields || []).forEach((h) => {
      const n = normHeader(h);
      Object.keys(HEADER_ALIASES).forEach((field) => {
        if (HEADER_ALIASES[field].includes(n)) fieldMap[h] = field;
      });
    });

    const existingUrns = new Set(Object.keys(students).map((u) => u.toUpperCase()));
    const seenInFile = new Set();

    const parsed = (result.data || []).map((raw, i) => {
      const rec = {};
      Object.keys(raw).forEach((h) => { if (fieldMap[h]) rec[fieldMap[h]] = String(raw[h] || "").trim(); });
      const errors = [];

      const urn = (rec.urn || "").trim();
      if (!urn) errors.push("Missing URN");
      const name = (rec.name || "").trim();
      if (!name) errors.push("Missing Name");

      let campus = (rec.campus || "").trim();
      const campusMatch = CAMPUSES.find((c) => c.toLowerCase() === campus.toLowerCase());
      if (!campus) campus = importCampus || NST_CAMPUS; // no Campus column -- use whatever campus was picked before uploading
      else if (!campusMatch) errors.push(`Unknown campus "${campus}" (expected: ${CAMPUSES.join(", ")})`);
      else campus = campusMatch;

      let batch = (rec.batch || "").trim();
      const validBatchesForRow = batchesForCampus(campus);
      const batchMatch = validBatchesForRow.find((b) => b.toLowerCase() === batch.toLowerCase());
      if (!batch) errors.push("Missing Batch");
      else if (!batchMatch) errors.push(`Unknown batch "${batch}" for ${campus} (expected: ${validBatchesForRow.join(", ")})`);
      else batch = batchMatch;

      // Hours is optional at import time -- a roster-only row (marks but no session
      // yet) legitimately has no hours. Default to 0 so it's still importable; the
      // student just shows as "Awaiting 1st session" until a real session is logged.
      const hasHours = rec.hours !== undefined && rec.hours !== "";
      if (hasHours && isNaN(Number(rec.hours))) errors.push("Hours must be a number if provided");

      const sessionType = SESSION_TYPES.find((s) => s.toLowerCase() === (rec.sessionType || "").toLowerCase()) || SESSION_TYPES[0];
      const inboundOutbound = IN_OUT.find((s) => s.toLowerCase() === (rec.inboundOutbound || "").toLowerCase()) || IN_OUT[0];
      const cohort = COHORTS.find((s) => s.toLowerCase() === (rec.cohort || "").toLowerCase()) || COHORTS[1];
      const studyPattern = STUDY_PATTERNS.find((s) => s.toLowerCase() === (rec.studyPattern || "").toLowerCase()) || STUDY_PATTERNS[0];
      const selfOwnership = OWNERSHIP_LEVELS.find((s) => s.toLowerCase() === (rec.selfOwnership || "").toLowerCase()) || "";

      const date = rec.date && !isNaN(new Date(rec.date).getTime()) ? rec.date : "";

      const isDuplicateInFile = urn && seenInFile.has(urn.toUpperCase());
      if (urn) seenInFile.add(urn.toUpperCase());
      if (isDuplicateInFile) errors.push("Duplicate URN within this file");

      const isDuplicateExisting = urn && existingUrns.has(urn.toUpperCase());

      // A row counts as "has had their 1st session" only if a date was given --
      // matches your Sem 3 sheet, where marks-only rows have no 1-on-1 Date yet.
      const hasSession = !!date;

      return {
        __row: i + 2, // +2 = header row + 1-index
        urn, name, campus, batch, lab: rec.lab || "", email: rec.email || "",
        date, sessionType, inboundOutbound, cohort,
        dsaConfidence: rec.dsaConfidence || "", dsaMarks: rec.dsaMarks || "",
        maths3Confidence: rec.maths3Confidence || "", maths3Marks: rec.maths3Marks || "",
        wapConfidence: rec.wapConfidence || "", wapMarks: rec.wapMarks || "",
        dvaConfidence: rec.dvaConfidence || "", dvaMarks: rec.dvaMarks || "",
        hours: hasHours ? rec.hours : "0", studyPattern, selfOwnership,
        rootCause: rec.rootCause || "", subjectiveRead: rec.subjectiveRead || "", actionPlan: rec.actionPlan || "",
        nextFollowUpDate: rec.nextFollowUpDate || "",
        hasSession,
        __errors: errors, __isDuplicateExisting: isDuplicateExisting,
      };
    });
    setRows(parsed);
  }

  const validRows = rows ? rows.filter((r) => r.__errors.length === 0) : [];
  const importableRows = validRows.filter((r) => dupeMode === "overwrite" || !r.__isDuplicateExisting);
  const skippedDupeCount = validRows.length - importableRows.length;
  const errorCount = rows ? rows.length - validRows.length : 0;

  function doImport() {
    const toImport = importableRows.map((r) => ({
      urn: r.urn, name: r.name, campus: r.campus, batch: r.batch, lab: r.lab, email: r.email, date: r.date,
      sessionType: r.sessionType, inboundOutbound: r.inboundOutbound, cohort: r.cohort,
      dsaConfidence: r.dsaConfidence, dsaMarks: r.dsaMarks,
      maths3Confidence: r.maths3Confidence, maths3Marks: r.maths3Marks,
      wapConfidence: r.wapConfidence, wapMarks: r.wapMarks,
      dvaConfidence: r.dvaConfidence, dvaMarks: r.dvaMarks,
      hours: Number(r.hours), studyPattern: r.studyPattern,
      selfOwnership: r.selfOwnership, rootCause: r.rootCause,
      subjectiveRead: r.subjectiveRead, actionPlan: r.actionPlan,
      nextFollowUpDate: r.nextFollowUpDate, hasSession: r.hasSession,
    }));
    onImport(toImport, dupeMode);
    setRows(null); setRawText("");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import students</h1>
        <p className="text-sm text-slate-500">Bring in your whole roster at once instead of adding students one by one.</p>
      </div>

      {!rows && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={downloadCsvTemplate} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Download size={14} /> Download CSV template
            </button>
            <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Upload size={14} /> Upload a .csv file
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            <span className="text-xs text-slate-400">Or paste CSV data below (from Excel or Google Sheets works too)</span>
          </div>

          <textarea
            className={inputCls + " font-mono text-xs"} rows={8}
            value={rawText} onChange={(e) => setRawText(e.target.value)}
            placeholder={"urn,name,batch,lab,date,hours,riskStatus,selfOwnership,subjectiveRead,actionPlan\nE25B070800,Aarav Mehta,Ramanujan,Infinity,2026-08-12,10,No Risk,...,...,..."}
          />
          <p className="text-xs text-slate-400">
            Required columns: <strong>urn, name, batch, hours</strong>. Everything else is optional. Column order and header
            capitalization don't matter -- only the names need to roughly match.
          </p>

          <button onClick={parse} disabled={!rawText.trim()} className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">
            Preview import
          </button>
        </div>
      )}

      {rows && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <StatCard label="Ready to import" value={importableRows.length} accent="#16A34A" />
            <StatCard label="Skipped (duplicate)" value={skippedDupeCount} accent="#CA8A04" />
            <StatCard label="Errors" value={errorCount} accent="#DC2626" />
          </div>

          {validRows.some((r) => r.__isDuplicateExisting) && (
            <div className="flex items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <span>Some URNs already exist in your roster. What should happen to them?</span>
              <label className="flex items-center gap-1.5"><input type="radio" checked={dupeMode === "skip"} onChange={() => setDupeMode("skip")} /> Skip (keep existing)</label>
              <label className="flex items-center gap-1.5"><input type="radio" checked={dupeMode === "overwrite"} onChange={() => setDupeMode("overwrite")} /> Overwrite with imported data</label>
            </div>
          )}

          <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">URN</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">Campus</th>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium">Hours</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.__row} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5 text-slate-400">{r.__row}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.urn || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.name || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.campus === NST_CAMPUS ? "NST" : r.campus || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.batch || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.hours || "—"}</td>
                    <td className="px-3 py-1.5">
                      {r.__errors.length > 0 ? (
                        <span className="text-xs text-red-600">{r.__errors.join("; ")}</span>
                      ) : r.__isDuplicateExisting ? (
                        <span className="text-xs text-amber-600">{dupeMode === "skip" ? "Duplicate -- will skip" : "Duplicate -- will overwrite"}</span>
                      ) : (
                        <span className="text-xs text-green-600">Ready</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={() => { setRows(null); }} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <RotateCcw size={14} /> Start over
            </button>
            <button
              onClick={doImport} disabled={importableRows.length === 0}
              className="flex-1 rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import {importableRows.length} student{importableRows.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// BULK IMPORT -- FOLLOW-UPS
// Matches the real "Follow-Up Log" sheet's PI-entered columns (the
// Auto-computed ones -- Effort Level, Shift in Effort/Risk, Current
// Risk Category -- are recognized and skipped, same as the student
// importer does for Sem 3's auto columns).
// ============================================================
const FUP_IMPORT_TEMPLATE_HEADERS = [
  "URN", "Follow-Up Date", "Productive Weekly Hours", "% of Action Plan Completed",
  "Updates on Tasks Given", "Updated Action Plan (if changed)", "Next Follow-Up Date",
];
const FUP_HEADER_ALIASES = {
  urn: ["urn"],
  date: ["followupdate", "date"],
  hours: ["productiveweeklyhours", "hours"],
  pctCompleted: ["ofactionplancompleted", "actionplancompleted", "pctcompleted"],
  notes: ["updatesontasksgiven", "notes"],
  updatedActionPlan: ["updatedactionplanifchanged", "updatedactionplan"],
  nextDate: ["nextfollowupdate", "nextdate"],
};

function downloadFupCsvTemplate() {
  const example = ["E25B070709", "2026-08-24", "10", "60", "Solved 12 of 20 assigned questions.", "", "2026-09-07"];
  const csv = FUP_IMPORT_TEMPLATE_HEADERS.join(",") + "\n" + example.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "followup_log_import_template.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ImportFollowUpsView({ students, onImport, importCampus }) {
  const [rawText, setRawText] = useState("");
  const [rows, setRows] = useState(null);
  const fileInputRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setRawText(String(ev.target.result || ""));
    reader.readAsText(file);
  }

  function parse() {
    if (!rawText.trim()) return;
    const result = Papa.parse(rawText.trim(), { header: true, skipEmptyLines: true });
    const fieldMap = {};
    (result.meta.fields || []).forEach((h) => {
      const n = normHeader(h);
      Object.keys(FUP_HEADER_ALIASES).forEach((field) => {
        if (FUP_HEADER_ALIASES[field].includes(n)) fieldMap[h] = field;
      });
    });

    const parsed = (result.data || []).map((raw, i) => {
      const rec = {};
      Object.keys(raw).forEach((h) => { if (fieldMap[h]) rec[fieldMap[h]] = String(raw[h] || "").trim(); });
      const errors = [];

      const urn = (rec.urn || "").trim();
      if (!urn) errors.push("Missing URN");
      else if (!students[urn]) errors.push(`URN "${urn}" not found -- import students first`);
      else if (!students[urn].hasSession) errors.push(`"${students[urn].name}" has no 1st session logged yet`);
      else if (importCampus && (students[urn].campus || NST_CAMPUS) !== importCampus) {
        errors.push(`"${students[urn].name}" belongs to ${students[urn].campus || NST_CAMPUS}, not ${importCampus}`);
      }

      const date = rec.date && !isNaN(new Date(rec.date).getTime()) ? rec.date : "";
      if (!date) errors.push("Missing or invalid Follow-Up Date");

      const hoursNum = Number(rec.hours);
      if (rec.hours === undefined || rec.hours === "" || isNaN(hoursNum)) errors.push("Hours must be a number");

      const pctNum = Number(rec.pctCompleted);
      if (rec.pctCompleted === undefined || rec.pctCompleted === "" || isNaN(pctNum)) errors.push("% of Action Plan Completed must be a number");

      const nextDate = rec.nextDate && !isNaN(new Date(rec.nextDate).getTime()) ? rec.nextDate : "";

      return {
        __row: i + 2,
        urn, name: students[urn] ? students[urn].name : "",
        date, hours: rec.hours, pctCompleted: rec.pctCompleted,
        notes: rec.notes || "", updatedActionPlan: rec.updatedActionPlan || "", nextDate,
        __errors: errors,
      };
    });
    setRows(parsed);
  }

  const validRows = rows ? rows.filter((r) => r.__errors.length === 0) : [];
  const errorCount = rows ? rows.length - validRows.length : 0;

  function doImport() {
    const toImport = validRows.map((r) => ({
      urn: r.urn, date: r.date, hours: Number(r.hours), pctCompleted: Number(r.pctCompleted),
      notes: r.notes, updatedActionPlan: r.updatedActionPlan, nextDate: r.nextDate,
    }));
    onImport(toImport);
    setRows(null); setRawText("");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Import follow-ups</h1>
        <p className="text-sm text-slate-500">Bring in logged follow-up sessions at once. Students must already exist (import them first if needed).</p>
      </div>

      {!rows && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={downloadFupCsvTemplate} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Download size={14} /> Download CSV template
            </button>
            <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <Upload size={14} /> Upload a .csv file
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
            <span className="text-xs text-slate-400">Or paste CSV data below</span>
          </div>

          <textarea
            className={inputCls + " font-mono text-xs"} rows={8}
            value={rawText} onChange={(e) => setRawText(e.target.value)}
            placeholder={"URN,Follow-Up Date,Productive Weekly Hours,% of Action Plan Completed,Updates on Tasks Given,Updated Action Plan (if changed),Next Follow-Up Date\nE25B070709,2026-08-24,10,60,Solved 12 of 20...,,2026-09-07"}
          />
          <p className="text-xs text-slate-400">
            Required: <strong>URN, Follow-Up Date, Productive Weekly Hours, % of Action Plan Completed</strong>. The student must
            already exist with a 1st session logged -- Effort Level, Shift in Effort/Risk, and Current Risk Category are all
            calculated for you, same as manual entry.
          </p>

          <button onClick={parse} disabled={!rawText.trim()} className="w-full rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40">
            Preview import
          </button>
        </div>
      )}

      {rows && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Ready to import" value={validRows.length} accent="#16A34A" />
            <StatCard label="Errors" value={errorCount} accent="#DC2626" />
          </div>

          <div className="max-h-96 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Row</th>
                  <th className="px-3 py-2 font-medium">URN</th>
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hours</th>
                  <th className="px-3 py-2 font-medium">% Completed</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.__row} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-1.5 text-slate-400">{r.__row}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.urn || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.name || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.date || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.hours || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-700">{r.pctCompleted || "—"}</td>
                    <td className="px-3 py-1.5">
                      {r.__errors.length > 0
                        ? <span className="text-xs text-red-600">{r.__errors.join("; ")}</span>
                        : <span className="text-xs text-green-600">Ready</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setRows(null)} className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <RotateCcw size={14} /> Start over
            </button>
            <button
              onClick={doImport} disabled={validRows.length === 0}
              className="flex-1 rounded-lg bg-blue-700 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import {validRows.length} follow-up{validRows.length === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}


export default ImportDataView;
