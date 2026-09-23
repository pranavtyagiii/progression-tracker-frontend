import { Users, CalendarPlus, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronRight } from "lucide-react";
import { NST_CAMPUS, CATEGORY_ORDER, CATEGORY_META, QC_LABELS, QC_META, batchesForCampus, fmtDate } from "../shared";
import { StatCard, ProgressRow, CategoryPill } from "../ui";

function Dashboard({ students, studentStates, followups, settings, campus, batch, onOpenStudent }) {
  const allStudentsEverywhere = Object.values(students);
  const campusFilter = campus;
  const batchFilter = batch && batch !== "All" ? batch : null;

  const allStudents = allStudentsEverywhere.filter((s) => (s.campus || NST_CAMPUS) === campusFilter && (!batchFilter || s.batch === batchFilter));
  const totalStudents = allStudents.length;
  const totalFollowUps = followups.filter((f) => students[f.urn] && (students[f.urn].campus || NST_CAMPUS) === campusFilter && (!batchFilter || students[f.urn].batch === batchFilter)).length;
  const withRepeat = allStudents.filter((s) => (studentStates[s.urn]?.followUpCount || 0) >= 2).length;
  const zeroFollowUps = allStudents.filter((s) => (studentStates[s.urn]?.followUpCount || 0) === 0).length;

  const categoryCounts = { "Growth Zone": 0, "Under-engaged": 0, "Skill Gap": 0, "Immediate Intervention": 0 };
  allStudents.forEach((s) => { const c = studentStates[s.urn]?.category; if (c) categoryCounts[c]++; });
  const studentsWithSession = allStudents.filter((s) => s.hasSession).length;
  const awaitingFirstSession = totalStudents - studentsWithSession;

  const qualityCounts = {}; QC_LABELS.forEach((l) => { qualityCounts[l] = 0; });
  allStudents.forEach((s) => { const q = studentStates[s.urn]?.quality; if (q) qualityCounts[q]++; });

  const tracked = allStudents.filter((s) => (studentStates[s.urn]?.followUpCount || 0) > 0);
  let improving = 0, same = 0, needsSupport = 0;
  tracked.forEach((s) => {
    const shift = studentStates[s.urn]?.shiftInRisk;
    if (shift === "Better than last session") improving++;
    else if (shift === "Same as last session") same++;
    else if (shift === "Needs Support") needsSupport++;
  });

  const batchRows = (batchFilter ? [batchFilter] : batchesForCampus(campusFilter)).map((b) => {
    const inBatch = allStudents.filter((s) => s.batch === b && s.hasSession);
    const counts = { "Growth Zone": 0, "Under-engaged": 0, "Skill Gap": 0, "Immediate Intervention": 0 };
    inBatch.forEach((s) => { const c = studentStates[s.urn]?.category; if (c) counts[c]++; });
    const total = inBatch.length;
    const iiPct = total ? counts["Immediate Intervention"] / total : 0;
    const sgPct = total ? counts["Skill Gap"] / total : 0;
    const uePct = total ? counts["Under-engaged"] / total : 0;
    const gzPct = total ? counts["Growth Zone"] / total : 0;
    let health = { label: "No students", color: "#6B7280", bg: "#F3F4F6" };
    if (total > 0) {
      if (iiPct >= 0.2) health = { label: "Critical", color: "#DC2626", bg: "#FEF2F2" };
      else if (sgPct >= 0.2) health = { label: "Needs Support", color: "#EA580C", bg: "#FFF7ED" };
      else if (uePct >= gzPct) health = { label: "Re-engagement Required", color: "#CA8A04", bg: "#FEFCE8" };
      else health = { label: "Healthy", color: "#16A34A", bg: "#F0FDF4" };
    }
    return { batch: b, total, counts, health };
  });

  const recentFollowUps = [...followups]
    .filter((f) => students[f.urn] && (students[f.urn].campus || NST_CAMPUS) === campusFilter && (!batchFilter || students[f.urn].batch === batchFilter))
    .sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500">
          {campusFilter === NST_CAMPUS ? "Newton School of Technology" : campusFilter}{batchFilter ? ` -- ${batchFilter}` : ""} -- live, reflects every entry as soon as it's saved.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Students Tracked" value={totalStudents} sub={awaitingFirstSession > 0 ? `${awaitingFirstSession} awaiting 1st session` : undefined} icon={Users} accent="#1E40AF" />
        <StatCard label="Follow-Ups Logged" value={totalFollowUps} icon={CalendarPlus} accent="#1E40AF" />
        <StatCard label="2+ Follow-Ups" value={withRepeat} sub={`${zeroFollowUps} with none yet`} icon={TrendingUp} accent="#1E40AF" />
        <StatCard label="Needs Support" value={needsSupport} sub="vs their last session" icon={AlertTriangle} accent="#DC2626" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">2×2 Matrix -- current distribution</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {CATEGORY_ORDER.map((cat) => {
              const meta = CATEGORY_META[cat];
              const count = categoryCounts[cat];
              const pct = studentsWithSession ? Math.round((count / studentsWithSession) * 100) : 0;
              return (
                <div key={cat} className="rounded-lg p-3" style={{ backgroundColor: meta.bg, border: `1px solid ${meta.color}33` }}>
                  <div className="text-2xl font-semibold" style={{ color: meta.color }}>{count}</div>
                  <div className="mt-1 text-xs font-medium text-slate-700">{meta.label}</div>
                  <div className="text-[11px] text-slate-500">{pct}% of students</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Current progress <span className="font-normal text-slate-400">(latest session)</span></h2>
          <div className="space-y-2">
            <ProgressRow label="Improving" value={improving} total={tracked.length} color="#16A34A" bg="#F0FDF4" icon={TrendingUp} />
            <ProgressRow label="Same" value={same} total={tracked.length} color="#CA8A04" bg="#FEFCE8" icon={Minus} />
            <ProgressRow label="Needs Support" value={needsSupport} total={tracked.length} color="#EA580C" bg="#FFF7ED" icon={TrendingDown} />
          </div>
          {tracked.length === 0 && <p className="mt-3 text-xs text-slate-400">No follow-ups logged yet -- nothing to compare.</p>}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-sm font-semibold text-slate-800">1st session quality</h2>
        <p className="mb-4 text-xs text-slate-400">Graded automatically from each student's Subjective Read + Action Plan text -- same rubric as your Batch KPI script.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {QC_LABELS.map((label) => {
            const meta = QC_META[label];
            const count = qualityCounts[label];
            const pct = studentsWithSession ? Math.round((count / studentsWithSession) * 100) : 0;
            return (
              <div key={label} className="rounded-lg p-3" style={{ backgroundColor: meta.bg, border: `1px solid ${meta.color}33` }}>
                <div className="text-2xl font-semibold" style={{ color: meta.color }}>{count}</div>
                <div className="mt-1 text-xs font-medium text-slate-700">{label}</div>
                <div className="text-[11px] text-slate-500">{pct}% of students</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Batch health</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2 pr-4 font-medium">Batch</th>
                <th className="pb-2 pr-4 font-medium">Students</th>
                {CATEGORY_ORDER.map((c) => <th key={c} className="pb-2 pr-4 font-medium">{CATEGORY_META[c].label}</th>)}
                <th className="pb-2 font-medium">Health</th>
              </tr>
            </thead>
            <tbody>
              {batchRows.map((row) => (
                <tr key={row.batch} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 pr-4 font-medium text-slate-800">{row.batch}</td>
                  <td className="py-2 pr-4 text-slate-600">{row.total}</td>
                  {CATEGORY_ORDER.map((c) => <td key={c} className="py-2 pr-4 text-slate-600">{row.counts[c]}</td>)}
                  <td className="py-2">
                    <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: row.health.color, backgroundColor: row.health.bg }}>
                      {row.health.label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-slate-800">Recent follow-ups</h2>
        {recentFollowUps.length === 0 ? (
          <p className="text-xs text-slate-400">Nothing logged yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentFollowUps.map((f) => {
              const s = students[f.urn];
              const st = studentStates[f.urn];
              return (
                <button
                  key={f.id}
                  onClick={() => onOpenStudent(f.urn)}
                  className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-slate-800">{s ? s.name : f.urn}</div>
                    <div className="text-xs text-slate-500">{s ? s.batch : ""} · {fmtDate(f.date)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {st && <CategoryPill category={st.category} />}
                    <ChevronRight size={14} className="text-slate-300" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}



export default Dashboard;
