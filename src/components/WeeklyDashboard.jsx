import { useState, useMemo } from "react";
import { LineChart, Line, BarChart, Bar, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import {
  NST_CAMPUS, CAMPUSES, batchesForCampus, CATEGORY_ORDER, QC_LABELS, QC_GOOD, QC_ALMOST, QC_PARTIAL, QC_LOW, QC_NO_PLAN, QC_META,
  fmtDate, fmtDateShort, WEEK1_START, buildWeeks, inWeek, computeFollowUpShifts,
  effortLevel, avgConfidence, overallRiskStatusFromConfidence, matrixCategory, scoreSessionQuality,
} from "../shared";

function weekInsights(sessionRows) {
  const reads = [];
  sessionRows.forEach((s) => {
    const v = (s.subjectiveRead || "").trim();
    if (v && v.replace(/[-\u2013\u2014\s]/g, "").length > 0) reads.push(v);
  });
  if (reads.length === 0) return "• No subjective notes recorded.";
  const t = { tm: 0, lm: 0, as_: 0, pi: 0, pe: 0, ip: 0, pd: 0, sd: 0, ng: 0, gpt: 0 };
  reads.forEach((text) => {
    const tx = text.toLowerCase();
    if (tx.includes("time management") || tx.includes("no time") || tx.includes("balance")) t.tm++;
    if (tx.includes("not feel") || tx.includes("doesn't feel") || tx.includes("boring") || tx.includes("not motivated") || tx.includes("lightly") || tx.includes("overwhelm")) t.lm++;
    if (tx.includes("weak") || tx.includes("low marks") || tx.includes("did not study") || tx.includes("not practicing") || tx.includes("low score") || tx.includes("skip") || tx.includes("not study")) t.as_++;
    if (tx.includes("personal") || tx.includes("health") || tx.includes("distract") || tx.includes("family") || tx.includes("going home")) t.pi++;
    if (tx.includes("willing") || tx.includes("improve") || tx.includes("goal") || tx.includes("cgpa") || tx.includes("wants to") || tx.includes("self apply") || tx.includes("proactive")) t.pe++;
    if (tx.includes("internship") || tx.includes("project") || tx.includes("gsoc") || tx.includes("startup") || tx.includes("hackathon") || tx.includes("cp ")) t.ip++;
    if (tx.includes("practice") || tx.includes("assignment") || tx.includes("not enough practice") || tx.includes("does not practice")) t.pd++;
    if (tx.includes("self-driven") || tx.includes("proactively") || tx.includes("on his own") || tx.includes("initiative")) t.sd++;
    if (tx.includes("need guidance") || tx.includes("right direction") || tx.includes("needs someone") || tx.includes("guide")) t.ng++;
    if (tx.includes("gpt") || tx.includes("chatgpt") || tx.includes("ai when") || tx.includes("uses ai")) t.gpt++;
  });
  const b = [`• Notes: ${reads.length}/${sessionRows.length} sessions`];
  if (t.tm > 0) b.push(`• ${t.tm} – poor time management`);
  if (t.lm > 0) b.push(`• ${t.lm} – low motivation / overwhelmed`);
  if (t.as_ > 0) b.push(`• ${t.as_} – academic struggle`);
  if (t.pd > 0) b.push(`• ${t.pd} – practice deficiency`);
  if (t.pi > 0) b.push(`• ${t.pi} – personal / health issues`);
  if (t.ip > 0) b.push(`• ${t.ip} – internship / project focus`);
  if (t.gpt > 0) b.push(`• ${t.gpt} – ChatGPT dependency`);
  if (t.ng > 0) b.push(`• ${t.ng} – needs guidance`);
  if (t.pe > 0) b.push(`• ${t.pe} – positive intent`);
  if (t.sd > 0) b.push(`• ${t.sd} – self-driven`);
  return b.join("\n");
}

const AP_THEMES = [
  { label: "📞 Follow-up call", words: ["follow up", "follow-up", "call", "reach out", "check in", "check-in", "contact"] },
  { label: "📚 Study/Practice plan", words: ["study plan", "practice", "revision", "revise", "concept", "topic", "assignment", "solve", "leetcode", "coding"] },
  { label: "🎯 Goal setting", words: ["goal", "target", "cgpa", "aim", "plan", "roadmap", "milestone"] },
  { label: "🧠 Motivation/Mindset", words: ["motivat", "mindset", "confidence", "attitude", "positive", "encourage", "inspire"] },
  { label: "👥 Peer/Group support", words: ["peer", "group", "team", "buddy", "mentor", "pair", "together"] },
  { label: "⏰ Time management", words: ["time", "schedule", "routine", "deadline", "priorit", "manage", "plan"] },
  { label: "💼 Career/Internship", words: ["internship", "job", "career", "placement", "interview", "resume", "linkedin", "startup", "company"] },
  { label: "🔄 Re-engagement", words: ["re-engage", "re engage", "reconnect", "inactive", "engagement", "dropout", "absent"] },
  { label: "🩺 Personal support", words: ["personal", "health", "family", "mental", "stress", "wellbeing", "counsell"] },
  { label: "📊 Progress tracking", words: ["track", "progress", "monitor", "update", "report", "weekly", "dashboard"] },
];

function apSummaryCategories(sessionRows) {
  const texts = [];
  sessionRows.forEach((s) => {
    const v = (s.actionPlan || "").trim();
    if (v && v.replace(/[-\u2013\u2014\s]/g, "").length > 0) texts.push(v.toLowerCase());
  });
  if (texts.length === 0) return "• No action plans recorded.";

  const counts = {};
  AP_THEMES.forEach((th) => {
    const cnt = texts.filter((t) => th.words.some((w) => t.includes(w))).length;
    if (cnt > 0) counts[th.label] = cnt;
  });
  const categorised = texts.filter((t) => AP_THEMES.some((th) => th.words.some((w) => t.includes(w)))).length;
  const other = texts.length - categorised;

  const lines = [`• Plans: ${texts.length}/${sessionRows.length} sessions`];
  const themeLines = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map((k) => `• ${k}: ${counts[k]}`);
  lines.push(...themeLines);
  if (other > 0) lines.push(`• 📌 Other: ${other}`);
  return lines.join("\n");
}

// ============================================================
// TREND CHART -- one card, one metric (or a small family of related
// metrics), plotted week over week. Bars for volume counts (sessions,
// follow-ups), lines for rates/scores/composition -- never stacked,
// per direct feedback that stacked composition bars read as confusing.
// ============================================================
function TrendChart({ data, type, title, subtitle, series, unit, domain, allowDecimals = true }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="mb-1 text-sm font-semibold text-slate-800">{title}</h3>
      <p className="mb-3 text-xs text-slate-400">{subtitle}</p>
      <ResponsiveContainer width="100%" height={240}>
        {type === "bar" ? (
          <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" height={50} interval={0} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={allowDecimals} unit={unit} domain={domain} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => <Bar key={s.key} dataKey={s.key} fill={s.color} />)}
          </BarChart>
        ) : (
          <LineChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
            <XAxis dataKey="week" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" height={50} interval={0} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={allowDecimals} unit={unit} domain={domain} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            {series.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}
            {series.map((s) => (
              <Line key={s.key} type="monotone" dataKey={s.key} stroke={s.color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
            ))}
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

function WeeklyDashboard({ students, followupsByStudent, settings, campus, batch }) {
  const allStudentsEverywhere = Object.values(students).filter((s) => s.hasSession);
  const campusFilter = campus;
  const batchFilter = batch && batch !== "All" ? batch : null;
  // Batch names like "2023" are shared across ADYPU/SVYASA/RU, so campus MUST be part of
  // the filter here -- matching on batch name alone would mix different campuses together.
  const allStudents = allStudentsEverywhere.filter((s) => (s.campus || NST_CAMPUS) === campusFilter && (!batchFilter || s.batch === batchFilter));

  // Flatten every follow-up across every student, each tagged with its own
  // computed Effort Level + Shift in Effort (per-row, not just latest).
  const allFollowUpsFlat = useMemo(() => {
    const out = [];
    allStudents.forEach((s) => {
      const hist = followupsByStudent[s.urn] || [];
      const shifted = computeFollowUpShifts(s, hist, settings);
      shifted.forEach((x) => out.push({ ...x, urn: s.urn, batch: s.batch }));
    });
    return out;
  }, [students, followupsByStudent, settings, campusFilter]);

  const weeks = useMemo(() => {
    const dates = allStudents.map((s) => s.date).concat(allFollowUpsFlat.map((x) => x.followup.date));
    return buildWeeks(dates);
  }, [students, allFollowUpsFlat, campusFilter]);

  function weekRow(batch, wk) {
    const sessRows = allStudents.filter((s) => s.batch === batch && inWeek(s.date, wk));
    const total = sessRows.length;
    const oneOnOne = sessRows.filter((s) => s.sessionType === "One-on-One").length;
    const group = sessRows.filter((s) => s.sessionType === "Group Session").length;
    const inbound = sessRows.filter((s) => s.inboundOutbound === "Inbound").length;
    const outbound = sessRows.filter((s) => s.inboundOutbound === "Outbound").length;

    const qc = {}; QC_LABELS.forEach((l) => { qc[l] = 0; });
    const cat = { "Growth Zone": 0, "Under-engaged": 0, "Skill Gap": 0, "Immediate Intervention": 0 };
    sessRows.forEach((s) => {
      const eff = effortLevel(s.hours, settings.hoursThreshold);
      const avgC = avgConfidence(s);
      const risk = overallRiskStatusFromConfidence(avgC, settings.avgConfidenceThreshold);
      const c = matrixCategory(eff, risk);
      cat[c]++;
      const q = scoreSessionQuality(s.subjectiveRead, s.actionPlan, c);
      qc[q.label]++;
    });

    const fupRows = allFollowUpsFlat.filter((x) => x.batch === batch && inWeek(x.followup.date, wk));
    const fupStudents = new Set(fupRows.map((x) => x.urn)).size;
    const fupUp = fupRows.filter((x) => x.shiftInEffort === "Increased").length;
    const fupSame = fupRows.filter((x) => x.shiftInEffort === "No Change").length;
    const fupDown = fupRows.filter((x) => x.shiftInEffort === "Decreased").length;
    const pctVals = fupRows.map((x) => x.followup.pctCompleted).filter((v) => v !== "" && v !== undefined && !isNaN(Number(v)));
    const avgPct = pctVals.length ? Math.round(pctVals.reduce((a, b) => a + Number(b), 0) / pctVals.length) : null;

    const insights = weekInsights(sessRows);
    const apSummary = apSummaryCategories(sessRows);

    return { batch, total, oneOnOne, group, inbound, outbound, qc, cat, fupLogged: fupRows.length, fupStudents, fupUp, fupSame, fupDown, avgPct, insights, apSummary };
  }

  // Sums weekRow() across all 4 batches -- the "Total" row at the bottom of each week's table.
  function weekTotal(wk) {
    const rows = (batchFilter ? [batchFilter] : batchesForCampus(campusFilter)).map((b) => weekRow(b, wk));
    const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
    const qc = {}; QC_LABELS.forEach((l) => { qc[l] = rows.reduce((a, r) => a + r.qc[l], 0); });
    const cat = {};
    CATEGORY_ORDER.forEach((c) => { cat[c] = rows.reduce((a, r) => a + r.cat[c], 0); });
    const fupStudentsTotal = new Set(
      allFollowUpsFlat.filter((x) => inWeek(x.followup.date, wk)).map((x) => x.urn)
    ).size;
    const pctVals = allFollowUpsFlat
      .filter((x) => inWeek(x.followup.date, wk))
      .map((x) => x.followup.pctCompleted)
      .filter((v) => v !== "" && v !== undefined && !isNaN(Number(v)));
    const avgPct = pctVals.length ? Math.round(pctVals.reduce((a, b) => a + Number(b), 0) / pctVals.length) : null;
    const allWeekSessions = allStudents.filter((s) => inWeek(s.date, wk));
    return {
      total: sum("total"), oneOnOne: sum("oneOnOne"), group: sum("group"), inbound: sum("inbound"), outbound: sum("outbound"),
      qc, cat, fupLogged: sum("fupLogged"), fupStudents: fupStudentsTotal, fupUp: sum("fupUp"), fupSame: sum("fupSame"), fupDown: sum("fupDown"), avgPct,
      insights: weekInsights(allWeekSessions), apSummary: apSummaryCategories(allWeekSessions),
    };
  }

  function pf(n, total) { return total ? `${n} (${Math.round((n / total) * 100)}%)` : "—"; }

  // Week-over-week trend data -- only weeks with at least one session count toward the
  // chart, so it doesn't start with a long flat run of zeros before real data begins.
  const trendData = useMemo(() => {
    return weeks.map((wk) => {
      const t = weekTotal(wk);
      const catTotal = CATEGORY_ORDER.reduce((a, c) => a + t.cat[c], 0);
      const pct = (c) => (catTotal ? Math.round((t.cat[c] / catTotal) * 100) : 0);
      const fupTotal = t.fupUp + t.fupSame + t.fupDown;
      // Quality score -- same weighting as the PI Weekly Scorecard: Good=1.0, Almost=0.7,
      // Partial=0.4, Low=0, No Plan=-0.2 (a real penalty, not just zero), scaled to 0-100.
      const graded = QC_LABELS.reduce((a, l) => a + t.qc[l], 0);
      const qualityScore = graded
        ? Math.round(Math.max(0, Math.min(1,
            (t.qc[QC_GOOD] * 1.0 + t.qc[QC_ALMOST] * 0.7 + t.qc[QC_PARTIAL] * 0.4 + t.qc[QC_LOW] * 0 + t.qc[QC_NO_PLAN] * -0.2) / graded
          )) * 100)
        : null;
      return {
        week: `W${wk.num} (${fmtDateShort(wk.start.toISOString().slice(0, 10))} - ${fmtDateShort(wk.end.toISOString().slice(0, 10))})`,
        Sessions: t.total,
        "Follow-Ups": t.fupLogged,
        "Quality Score": qualityScore,
        "Avg % Plan Completed": t.avgPct,
        "Growth Zone": pct("Growth Zone"),
        "Under-engaged": pct("Under-engaged"),
        "Skill Gap": pct("Skill Gap"),
        "Immediate Intervention": pct("Immediate Intervention"),
        Improving: t.fupUp,
        Same: t.fupSame,
        "Needs Support": t.fupDown,
        hasData: t.total > 0 || fupTotal > 0,
      };
    });
  }, [weeks, allStudents, allFollowUpsFlat]);

  const firstDataIdx = trendData.findIndex((d) => d.hasData);
  const chartData = firstDataIdx >= 0 ? trendData.slice(firstDataIdx) : [];

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Weekly Dashboard</h1>
        <p className="text-sm text-slate-500">
          {campusFilter === NST_CAMPUS ? "Newton School of Technology" : campusFilter}{batchFilter ? ` -- ${batchFilter}` : ""} -- Week 1 starts {fmtDate(WEEK1_START.toISOString().slice(0, 10))}, same numbering as your Batch KPI script.
        </p>
      </div>

      {chartData.length >= 2 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Team Performance Trends</h2>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-1 text-sm font-semibold text-slate-800">Sessions, follow-ups &amp; quality</h3>
            <p className="mb-3 text-xs text-slate-400">
              Bars (left axis) = how much happened. Lines (right axis) = how good it was. The story in one view: is activity holding up, and is quality keeping pace.
            </p>
            <ResponsiveContainer width="100%" height={330}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -10, bottom: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} angle={-40} textAnchor="end" height={50} interval={0} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} allowDecimals={false} label={{ value: "Sessions", angle: -90, position: "insideLeft", fontSize: 11, fill: "#94A3B8" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} label={{ value: "Quality / Completion", angle: 90, position: "insideRight", fontSize: 11, fill: "#94A3B8" }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="Sessions" fill="#1D4ED8" barSize={18} />
                <Bar yAxisId="left" dataKey="Follow-Ups" fill="#A78BFA" barSize={18} />
                <Line yAxisId="right" type="monotone" dataKey="Quality Score" stroke="#0EA5E9" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
                <Line yAxisId="right" type="monotone" dataKey="Avg % Plan Completed" stroke="#0D9488" strokeWidth={2.5} dot={{ r: 3 }} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TrendChart
              data={chartData} type="line" title="Student health trend" subtitle="% of sessions in each 2x2 Matrix category." unit="%"
              series={[
                { key: "Growth Zone", color: "#16A34A" },
                { key: "Under-engaged", color: "#CA8A04" },
                { key: "Skill Gap", color: "#EA580C" },
                { key: "Immediate Intervention", color: "#DC2626" },
              ]}
            />
            <TrendChart
              data={chartData} type="line" title="Follow-up progress trend" subtitle="Students improving vs. needing support each week." allowDecimals={false}
              series={[
                { key: "Improving", color: "#16A34A" },
                { key: "Same", color: "#CA8A04" },
                { key: "Needs Support", color: "#DC2626" },
              ]}
            />
          </div>
        </div>
      )}

      {weeks.length === 0 || allStudents.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">No sessions logged yet.</div>
      ) : (
        <div className="space-y-6">
          {weeks.slice().reverse().map((wk) => (
            <div key={wk.num} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between bg-blue-700 px-4 py-2 text-white">
                <span className="text-sm font-semibold">Week {wk.num}</span>
                <span className="text-xs text-slate-300">{fmtDate(wk.start.toISOString().slice(0, 10))} -- {fmtDate(wk.end.toISOString().slice(0, 10))}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2 font-medium">Batch</th>
                      <th className="px-3 py-2 font-medium">Total</th>
                      <th className="px-3 py-2 font-medium">1-on-1</th>
                      <th className="px-3 py-2 font-medium">Group</th>
                      <th className="px-3 py-2 font-medium">Inbound</th>
                      <th className="px-3 py-2 font-medium">Outbound</th>
                      {QC_LABELS.map((l) => <th key={l} className="px-3 py-2 font-medium">{l}</th>)}
                      <th className="px-3 py-2 font-medium border-l border-slate-200">Follow-ups</th>
                      <th className="px-3 py-2 font-medium">Students</th>
                      <th className="px-3 py-2 font-medium">↑</th>
                      <th className="px-3 py-2 font-medium">—</th>
                      <th className="px-3 py-2 font-medium">↓</th>
                      <th className="px-3 py-2 font-medium">Avg % Plan</th>
                      <th className="px-3 py-2 font-medium border-l border-slate-200">📝 Subjective Read Insights</th>
                      <th className="px-3 py-2 font-medium">📝 Summarised Action Plans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(batchFilter ? [batchFilter] : batchesForCampus(campusFilter)).map((b) => {
                      const r = weekRow(b, wk);
                      return (
                        <tr key={b} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-2 font-medium text-slate-800">{b}</td>
                          <td className="px-3 py-2 text-slate-600">{r.total}</td>
                          <td className="px-3 py-2 text-slate-600">{pf(r.oneOnOne, r.total)}</td>
                          <td className="px-3 py-2 text-slate-600">{pf(r.group, r.total)}</td>
                          <td className="px-3 py-2 text-slate-600">{pf(r.inbound, r.total)}</td>
                          <td className="px-3 py-2 text-slate-600">{pf(r.outbound, r.total)}</td>
                          {QC_LABELS.map((l) => (
                            <td key={l} className="px-3 py-2">
                              {r.qc[l] > 0 ? <span style={{ color: QC_META[l].color }} className="font-medium">{pf(r.qc[l], r.total)}</span> : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-slate-600 border-l border-slate-200">{r.fupLogged || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{r.fupStudents || "—"}</td>
                          <td className="px-3 py-2 text-green-600 font-medium">{r.fupUp || "—"}</td>
                          <td className="px-3 py-2 text-amber-600 font-medium">{r.fupSame || "—"}</td>
                          <td className="px-3 py-2 text-red-600 font-medium">{r.fupDown || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{r.avgPct !== null ? r.avgPct + "%" : "—"}</td>
                          <td className="px-3 py-2 text-slate-600 border-l border-slate-200 whitespace-pre-line align-top min-w-[220px]">{r.insights}</td>
                          <td className="px-3 py-2 text-slate-600 whitespace-pre-line align-top min-w-[200px]">{r.apSummary}</td>
                        </tr>
                      );
                    })}
                    {(() => {
                      const t = weekTotal(wk);
                      return (
                        <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                          <td className="px-3 py-2 text-slate-900">Total</td>
                          <td className="px-3 py-2 text-slate-900">{t.total}</td>
                          <td className="px-3 py-2 text-slate-700">{pf(t.oneOnOne, t.total)}</td>
                          <td className="px-3 py-2 text-slate-700">{pf(t.group, t.total)}</td>
                          <td className="px-3 py-2 text-slate-700">{pf(t.inbound, t.total)}</td>
                          <td className="px-3 py-2 text-slate-700">{pf(t.outbound, t.total)}</td>
                          {QC_LABELS.map((l) => (
                            <td key={l} className="px-3 py-2">
                              {t.qc[l] > 0 ? <span style={{ color: QC_META[l].color }}>{pf(t.qc[l], t.total)}</span> : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-slate-700 border-l border-slate-200">{t.fupLogged || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{t.fupStudents || "—"}</td>
                          <td className="px-3 py-2 text-green-700">{t.fupUp || "—"}</td>
                          <td className="px-3 py-2 text-amber-700">{t.fupSame || "—"}</td>
                          <td className="px-3 py-2 text-red-700">{t.fupDown || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{t.avgPct !== null ? t.avgPct + "%" : "—"}</td>
                          <td className="px-3 py-2 text-slate-700 border-l border-slate-200 whitespace-pre-line align-top min-w-[220px]">{t.insights}</td>
                          <td className="px-3 py-2 text-slate-700 whitespace-pre-line align-top min-w-[200px]">{t.apSummary}</td>
                        </tr>
                      );
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// FOLLOW-UP LOG -- a flat, searchable table of every follow-up
// session logged, mirroring the "Follow-Up Log" sheet: one row per
// session, with the same computed columns (Effort Level, Shift in
// Effort, Current Risk Category, Shift in Risk).
// ============================================================
function ShiftEffortTag({ shift }) {
  const map = {
    Increased: { color: "#16A34A", bg: "#F0FDF4" },
    "No Change": { color: "#CA8A04", bg: "#FEFCE8" },
    Decreased: { color: "#DC2626", bg: "#FEF2F2" },
  };
  const m = map[shift] || { color: "#6B7280", bg: "#F3F4F6" };
  return <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: m.color, backgroundColor: m.bg }}>{shift}</span>;
}

// ============================================================
// SETTINGS
// ============================================================


export default WeeklyDashboard;
