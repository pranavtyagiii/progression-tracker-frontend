import { useState, useMemo } from "react";
import {
  Search, ChevronRight, ArrowLeft, AlertTriangle, CalendarDays, CalendarPlus, Mail, Clock, Users, X,
} from "lucide-react";
import {
  NST_CAMPUS, CAMPUSES, RISK_RANK, SUBJECTS, batchesForCampus, fmtDate, effortLevel, avgConfidence,
  overallRiskStatusFromConfidence, matrixCategory, nextDueDate, dueStatus, getLatestActionPlan, riskStatus
} from "../shared";
import { CategoryPill, QualityPill, ShiftBadge, ShiftEffortTag, MiniStat, inputCls } from "../ui";

function StudentSessionView({ students, studentStates, followups, followupsByStudent, settings, campus, batch, selectedUrn, setSelectedUrn, onDeleteStudent, onDeleteFollowUp, onConductSession, onEditSession, onTakeFollowUp }) {
  const [screen, setScreen] = useState("landing"); // "landing" | "interaction"
  const [viewMode, setViewMode] = useState("students"); // "students" | "sessions"
  const [query, setQuery] = useState("");
  // Defaults to whichever campus/batch is active in the sidebar, but stays a dropdown here --
  // Student Session is a lookup tool, so switching to "All campuses" to find someone
  // without changing your sidebar selection is still useful.
  const [campusFilter, setCampusFilter] = useState(campus || "All");
  const [batchFilter, setBatchFilter] = useState(batch && batch !== "All" ? batch : "All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dueFilter, setDueFilter] = useState("all"); // "all" | "overdue" | "today" | "2days" | "3days" | "7days"

  const allList = Object.values(students);
  const needsSessionCount = allList.filter((s) => !s.hasSession).length;
  const availableBatches = campusFilter === "All"
    ? [...new Set(CAMPUSES.flatMap((c) => batchesForCampus(c)))]
    : batchesForCampus(campusFilter);

  const list = allList
    .filter((s) => campusFilter === "All" || (s.campus || NST_CAMPUS) === campusFilter)
    .filter((s) => batchFilter === "All" || s.batch === batchFilter)
    .filter((s) => statusFilter === "All" || (statusFilter === "needsSession" ? !s.hasSession : s.hasSession))
    .filter((s) => !query || s.name.toLowerCase().includes(query.toLowerCase()) || s.urn.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Who needs a follow-up, and when -- respects the same campus/batch scope as the list
  // above, so a PI on a specific batch only sees their own students here.
  const dueWindows = { overdue: -1, today: 0, "2days": 2, "3days": 3, "7days": 7 };
  const dueList = allList
    .filter((s) => campusFilter === "All" || (s.campus || NST_CAMPUS) === campusFilter)
    .filter((s) => batchFilter === "All" || s.batch === batchFilter)
    .filter((s) => s.hasSession)
    .map((s) => {
      const due = nextDueDate(s, followupsByStudent[s.urn] || []);
      const status = dueStatus(due);
      return { student: s, due, status };
    })
    .filter((x) => x.status !== null)
    .filter((x) => {
      if (dueFilter === "all") return true;
      if (dueFilter === "overdue") return x.status.daysUntil < 0;
      const max = dueWindows[dueFilter];
      return x.status.daysUntil >= 0 && x.status.daysUntil <= max;
    })
    .sort((a, b) => a.status.daysUntil - b.status.daysUntil);

  // "All Sessions" -- a complete chronological log: every student's 1st session AS A ROW,
  // plus every follow-up as a row, merged and sorted by date. Not just follow-ups, per your
  // request to bring the two logs together in one place.
  const sessionRows = useMemo(() => {
    const out = [];
    Object.values(students).filter((s) => s.hasSession).forEach((s) => {
      const hist = followupsByStudent[s.urn] || [];
      const baseEffort = effortLevel(s.hours, settings.hoursThreshold);
      const baseAvgConf = avgConfidence(s);
      const baseRisk = overallRiskStatusFromConfidence(baseAvgConf, settings.avgConfidenceThreshold);
      const baseCategory = matrixCategory(baseEffort, baseRisk);

      out.push({
        id: s.urn + "-baseline", urn: s.urn, name: s.name, campus: s.campus || NST_CAMPUS, batch: s.batch,
        sessionLabel: "1st Session", date: s.date, hours: s.hours, pctCompleted: null,
        effort: baseEffort, shiftInEffort: "—", category: baseCategory, shiftInRisk: "—",
        notes: s.subjectiveRead || s.actionPlan || "",
      });

      let prevEffort = baseEffort, prevCategory = baseCategory;
      hist.forEach((f, idx) => {
        const thisEffort = effortLevel(f.hours, settings.hoursThreshold);
        const thisTaskFT = riskStatus(f.pctCompleted, settings.pctThreshold);
        const thisCategory = matrixCategory(thisEffort, thisTaskFT);
        const shiftInEffort = thisEffort === prevEffort ? "No Change" : (thisEffort === "High Effort" ? "Increased" : "Decreased");
        const pr = RISK_RANK[prevCategory], tr = RISK_RANK[thisCategory];
        const shiftInRisk = tr > pr ? "Better than last session" : tr < pr ? "Needs Support" : "Same as last session";
        out.push({
          id: f.id, urn: s.urn, name: s.name, campus: s.campus || NST_CAMPUS, batch: s.batch,
          sessionLabel: `Follow-Up #${idx + 1}`, date: f.date, hours: f.hours, pctCompleted: f.pctCompleted,
          effort: thisEffort, shiftInEffort, category: thisCategory, shiftInRisk,
          notes: f.notes,
        });
        prevEffort = thisEffort; prevCategory = thisCategory;
      });
    });
    return out.sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [students, followups, settings]);

  const filteredSessions = sessionRows
    .filter((r) => campusFilter === "All" || r.campus === campusFilter)
    .filter((r) => batchFilter === "All" || r.batch === batchFilter)
    .filter((r) => !query || r.name.toLowerCase().includes(query.toLowerCase()) || r.urn.toLowerCase().includes(query.toLowerCase()));

  const selected = selectedUrn ? students[selectedUrn] : null;

  if (selected) {
    return (
      <StudentDetail
        student={selected}
        state={studentStates[selected.urn]}
        history={followupsByStudent[selected.urn] || []}
        onBack={() => setSelectedUrn(null)}
        onDelete={() => { onDeleteStudent(selected.urn); setSelectedUrn(null); }}
        onDeleteFollowUp={onDeleteFollowUp}
        onConductSession={() => onConductSession(selected.urn)}
        onEditSession={() => onEditSession(selected.urn)}
      />
    );
  }

  if (screen === "landing") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Student Session</h1>
        <p className="mb-6 text-sm text-slate-500">What do you want to do?</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={onTakeFollowUp}
            className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100">
              <CalendarPlus size={20} />
            </div>
            <div className="text-base font-semibold text-slate-900">Take Follow-Up</div>
            <div className="text-sm text-slate-500">Log a 2nd, 3rd, 4th... follow-up session for a student -- 1st, 2nd, 3rd counted automatically.</div>
          </button>
          <button
            onClick={() => setScreen("interaction")}
            className="group flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-white p-6 text-left shadow-sm hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 group-hover:bg-blue-100">
              <Users size={20} />
            </div>
            <div className="text-base font-semibold text-slate-900">Student Interaction</div>
            <div className="text-sm text-slate-500">Browse students, conduct or edit a 1st session, or see the full session history.</div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setScreen("landing")} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
            <ArrowLeft size={14} />
          </button>
          <h1 className="text-xl font-semibold text-slate-900">Student Session</h1>
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button onClick={() => setViewMode("students")} className={`rounded-md px-3 py-1 text-xs font-medium ${viewMode === "students" ? "bg-blue-700 text-white" : "text-slate-500 hover:bg-slate-50"}`}>By Student</button>
            <button onClick={() => setViewMode("sessions")} className={`rounded-md px-3 py-1 text-xs font-medium ${viewMode === "sessions" ? "bg-blue-700 text-white" : "text-slate-500 hover:bg-slate-50"}`}>All Sessions</button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or URN"
              className="rounded-lg border border-slate-300 py-1.5 pl-8 pr-3 text-sm focus:border-slate-500 focus:outline-none"
            />
          </div>
          <select value={campusFilter} onChange={(e) => { setCampusFilter(e.target.value); setBatchFilter("All"); }} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option value="All">All campuses</option>
            {CAMPUSES.map((c) => <option key={c} value={c}>{c === NST_CAMPUS ? "NST" : c}</option>)}
          </select>
          <select value={batchFilter} onChange={(e) => setBatchFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
            <option>All</option>
            {availableBatches.map((b) => <option key={b}>{b}</option>)}
          </select>
          {viewMode === "students" && (
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
              <option value="All">All statuses</option>
              <option value="needsSession">Needs 1st session</option>
              <option value="active">1st session done</option>
            </select>
          )}
        </div>
      </div>

      {viewMode === "students" && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
              <CalendarDays size={15} className="text-blue-600" /> Follow-Ups Due
            </h2>
            <div className="flex flex-wrap gap-1">
              {[
                ["all", "All scheduled"],
                ["overdue", "Overdue"],
                ["today", "Today"],
                ["2days", "Next 2 days"],
                ["3days", "Next 3 days"],
                ["7days", "Next 7 days"],
              ].map(([key, label]) => (
                <button
                  key={key} onClick={() => setDueFilter(key)}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${dueFilter === key ? "bg-blue-700 text-white" : "bg-white text-slate-500 hover:bg-slate-100"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {dueList.length === 0 ? (
            <p className="text-sm text-slate-400">No students match this window right now.</p>
          ) : (
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {dueList.map(({ student, due, status }) => (
                <button
                  key={student.urn}
                  onClick={() => onTakeFollowUp(student.urn)}
                  className="flex w-full items-center justify-between rounded-lg bg-white px-3 py-2 text-left text-sm shadow-sm hover:bg-slate-50"
                >
                  <span>
                    <span className="font-medium text-slate-800">{student.name}</span>
                    <span className="ml-2 text-xs text-slate-400">{student.batch} -- {(student.campus || NST_CAMPUS) === NST_CAMPUS ? "NST" : student.campus}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    status.daysUntil < 0 ? "bg-red-50 text-red-600" : status.daysUntil === 0 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-500"
                  }`}>
                    {status.label} · {fmtDate(due)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === "students" && needsSessionCount > 0 && statusFilter !== "needsSession" && (
        <button
          onClick={() => setStatusFilter("needsSession")}
          className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-left text-sm text-amber-800 hover:bg-amber-100"
        >
          <span><strong>{needsSessionCount}</strong> student{needsSessionCount === 1 ? "" : "s"} imported from the roster {needsSessionCount === 1 ? "hasn't" : "haven't"} had a 1st session yet.</span>
          <ChevronRight size={14} />
        </button>
      )}

      {viewMode === "students" ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 font-medium">Name</th>
                <th className="px-4 py-2.5 font-medium">Campus</th>
                <th className="px-4 py-2.5 font-medium">Batch</th>
                <th className="px-4 py-2.5 font-medium">Current Status</th>
                <th className="px-4 py-2.5 font-medium">Follow-Ups</th>
                <th className="px-4 py-2.5 font-medium">Last Session</th>
                <th className="px-4 py-2.5 font-medium">Trend</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">No students match -- add one from the top bar or import your roster.</td></tr>
              )}
              {list.map((s) => {
                const st = studentStates[s.urn];
                return (
                  <tr key={s.urn} onClick={() => setSelectedUrn(s.urn)} className="cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{s.name}<div className="text-xs font-normal text-slate-400">{s.urn}</div></td>
                    <td className="px-4 py-2.5 text-slate-600">{(s.campus || NST_CAMPUS) === NST_CAMPUS ? "NST" : s.campus}</td>
                    <td className="px-4 py-2.5 text-slate-600">{s.batch}</td>
                    <td className="px-4 py-2.5">
                      {st && st.notStarted ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Needs 1st session</span>
                      ) : st ? <CategoryPill category={st.category} /> : null}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{st ? st.followUpCount : 0}</td>
                    <td className="px-4 py-2.5 text-slate-500">{st && st.latestDate ? fmtDate(st.latestDate) : "—"}</td>
                    <td className="px-4 py-2.5">{st && !st.notStarted && <ShiftBadge shift={st.shiftInRisk} />}</td>
                    <td className="px-4 py-2.5">
                      {st && st.notStarted && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onConductSession(s.urn); }}
                          className="rounded-lg bg-blue-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-800"
                        >
                          Conduct 1st session
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Student</th>
                  <th className="px-3 py-2 font-medium">Campus</th>
                  <th className="px-3 py-2 font-medium">Batch</th>
                  <th className="px-3 py-2 font-medium">Session</th>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hours</th>
                  <th className="px-3 py-2 font-medium">% Completed</th>
                  <th className="px-3 py-2 font-medium">Effort</th>
                  <th className="px-3 py-2 font-medium">Shift in Effort</th>
                  <th className="px-3 py-2 font-medium">Risk Category</th>
                  <th className="px-3 py-2 font-medium">Shift in Risk</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredSessions.length === 0 && (
                  <tr><td colSpan={12} className="px-3 py-8 text-center text-slate-400">No sessions logged yet.</td></tr>
                )}
                {filteredSessions.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800">{r.name}<div className="text-[10px] font-normal text-slate-400">{r.urn}</div></td>
                    <td className="px-3 py-2 text-slate-600">{r.campus === NST_CAMPUS ? "NST" : r.campus}</td>
                    <td className="px-3 py-2 text-slate-600">{r.batch}</td>
                    <td className="px-3 py-2 text-slate-600">{r.sessionLabel}</td>
                    <td className="px-3 py-2 text-slate-600">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 text-slate-600">{r.hours}</td>
                    <td className="px-3 py-2 text-slate-600">{r.pctCompleted !== null ? r.pctCompleted + "%" : "—"}</td>
                    <td className="px-3 py-2 text-slate-600">{r.effort}</td>
                    <td className="px-3 py-2">{r.shiftInEffort === "—" ? <span className="text-slate-300">—</span> : <ShiftEffortTag shift={r.shiftInEffort} />}</td>
                    <td className="px-3 py-2"><CategoryPill category={r.category} /></td>
                    <td className="px-3 py-2">{r.shiftInRisk === "—" ? <span className="text-slate-300">—</span> : <ShiftBadge shift={r.shiftInRisk} />}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-slate-500" title={r.notes}>{r.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StudentDetail({ student, state, history, onBack, onDelete, onDeleteFollowUp, onConductSession, onEditSession }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sorted = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
  const notStarted = state && state.notStarted;
  const latestPlan = getLatestActionPlan(student, sorted);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft size={14} /> Back to students
      </button>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{student.name}</h1>
            <p className="text-sm text-slate-500">{student.urn} · {student.batch}{student.lab ? " · " + student.lab : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            {notStarted ? (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-500">Needs 1st session</span>
            ) : (
              <>
                <span className="text-xs text-slate-400">Current status (latest session):</span>
                {state && <CategoryPill category={state.category} size="lg" />}
              </>
            )}
            {state && state.escalated && (
              <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                <AlertTriangle size={12} /> Escalate to Team Lead
              </span>
            )}
            {!notStarted && (
              <button onClick={onEditSession} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
                Edit 1st session
              </button>
            )}
          </div>
        </div>

        {notStarted ? (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-dashed border-amber-200 bg-amber-50 p-4">
            <div className="text-sm text-amber-800">
              Imported from the roster -- diagnostic marks are on file, but the 1st one-on-one hasn't been conducted yet.
              {state.avgConfidence !== null && <span> Avg confidence so far: {Math.round(state.avgConfidence)}%.</span>}
            </div>
            <button onClick={onConductSession} className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-800">
              Conduct 1st session
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <MiniStat label="Follow-ups" value={state ? state.followUpCount : 0} />
              <MiniStat label="Current hours/wk" value={state ? state.hours : student.hours} />
              <MiniStat label="Effort level" value={state ? state.effort : "—"} />
              <MiniStat label="Trend" value={state ? <ShiftBadge shift={state.shiftInRisk} /> : "—"} />
              <MiniStat label="1st session quality" value={state && state.quality ? <QualityPill quality={state.quality} /> : "—"} />
            </div>

            {state && state.avgConfidence !== null && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Baseline confidence -- avg {Math.round(state.avgConfidence)}% ({state.overallRiskStatus}):</span>
                {SUBJECTS.filter((s) => student[s.key + "Confidence"] !== "" && student[s.key + "Confidence"] !== undefined).map((s) => (
                  <span key={s.key} className="rounded-full bg-slate-100 px-2 py-0.5">{s.label} {student[s.key + "Confidence"]}%</span>
                ))}
              </div>
            )}
            {state && state.qualityReason && (
              <div className="mt-2 text-xs text-slate-400">Quality note: {state.qualityReason}</div>
            )}

            {student.actionPlan && (
              <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="font-medium text-slate-700">Current action plan </span>
                    <span className="text-xs text-slate-400">({latestPlan ? latestPlan.source : ""})</span>
                    <div className="mt-1">{latestPlan ? latestPlan.text : student.actionPlan}</div>
                  </div>
                  {latestPlan && (
                    <a
                      href={
                        "mailto:" + encodeURIComponent(student.email || "") +
                        "?subject=" + encodeURIComponent(`Action Plan -- ${student.name}`) +
                        "&body=" + encodeURIComponent(`Hi ${student.name},\n\nHere's the action plan from our session:\n\n${latestPlan.text}\n\nLet me know if anything's unclear.\n`)
                      }
                      className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium ${
                        student.email ? "border-slate-300 text-slate-600 hover:bg-slate-100" : "border-amber-200 bg-amber-50 text-amber-700"
                      }`}
                      title={student.email ? `Opens your email client, addressed to ${student.email}` : "No email on file -- opens your email client with the address blank"}
                    >
                      <Mail size={13} /> Email Action Plan
                    </a>
                  )}
                </div>
                {!student.email && (
                  <div className="mt-2 text-xs text-amber-600">
                    No email on file for this student -- add one via "Edit 1st session" to have it pre-filled.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {!notStarted && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Session history</h2>
          <div className="space-y-3">
            <div className="flex items-start justify-between rounded-lg border border-dashed border-slate-200 p-3">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">1st Session (Baseline)</div>
                <div className="text-sm text-slate-700">{fmtDate(student.date)} · {student.hours} hrs/wk{state ? " · " + state.overallRiskStatus : ""}</div>
                {student.subjectiveRead && <div className="mt-1 text-xs text-slate-500">{student.subjectiveRead}</div>}
              </div>
            </div>
            {sorted.map((f, idx) => (
              <div key={f.id} className="flex items-start justify-between rounded-lg border border-slate-100 p-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Follow-Up #{sorted.length - idx} <Clock size={11} /> {fmtDate(f.date)}
                  </div>
                  <div className="text-sm text-slate-700">{f.hours} hrs/wk · {f.pctCompleted}% plan completed</div>
                  {f.notes && <div className="mt-1 text-xs text-slate-500">{f.notes}</div>}
                  {f.updatedActionPlan && <div className="mt-1 text-xs text-slate-500"><span className="font-medium">Updated plan: </span>{f.updatedActionPlan}</div>}
                </div>
                <button onClick={() => onDeleteFollowUp(f.id)} className="shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            ))}
            {sorted.length === 0 && <p className="text-xs text-slate-400">No follow-ups logged yet.</p>}
          </div>
        </div>
      )}

      <div className="flex justify-end">
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="text-xs text-slate-400 hover:text-red-500">Remove this student</button>
        ) : (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Delete {student.name} and all their follow-ups? This can't be undone.</span>
            <button onClick={onDelete} className="rounded bg-red-600 px-2 py-1 font-medium text-white hover:bg-red-700">Delete</button>
            <button onClick={() => setConfirmDelete(false)} className="rounded border border-slate-300 px-2 py-1 text-slate-600">Cancel</button>
          </div>
        )}
      </div>
    </div>
  );
}



export default StudentSessionView;
export { StudentDetail };
