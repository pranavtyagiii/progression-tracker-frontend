// ============================================================
// Shared domain logic: constants, pure helper functions, the 2x2 Matrix
// and QC scoring engine. Ported directly from the Progression Tracker
// product -- this logic is identical to before; only where the data comes
// from (the API now, not window.storage/browser artifact state) changed.
// ============================================================
import { useState, useRef, useEffect } from "react";

// ============================================================
const NST_CAMPUS = "Newton School of Technology";
const BATCHES = ["Ramanujan", "Hopper", "Neumann", "Turing"]; // NST's own named batches -- unchanged, kept for backward compatibility
const CAMPUSES = [NST_CAMPUS, "ADYPU", "SVYASA", "RU"];
const CAMPUS_BATCHES = {
  [NST_CAMPUS]: BATCHES,
  RU: ["2023", "2024", "2025", "2026"],
  ADYPU: ["2024", "2025", "2026"],
  SVYASA: ["2025", "2026"],
};
function batchesForCampus(campus) { return CAMPUS_BATCHES[campus] || BATCHES; }

const CATEGORY_META = {
  "Growth Zone":             { color: "#16A34A", bg: "#F0FDF4", label: "Growth Zone",             desc: "High Effort + No Risk" },
  "Under-engaged":           { color: "#CA8A04", bg: "#FEFCE8", label: "Under-engaged",            desc: "Low Effort + No Risk" },
  "Skill Gap":               { color: "#EA580C", bg: "#FFF7ED", label: "Skill Gap",                desc: "High Effort + Critical Risk" },
  "Immediate Intervention":  { color: "#DC2626", bg: "#FEF2F2", label: "Immediate Intervention",   desc: "Low Effort + Critical Risk" },
};
const CATEGORY_ORDER = ["Growth Zone", "Under-engaged", "Skill Gap", "Immediate Intervention"];
const RISK_RANK = { "Immediate Intervention": 1, "Skill Gap": 2, "Under-engaged": 3, "Growth Zone": 4 };

const DEFAULT_SETTINGS = { hoursThreshold: 12, pctThreshold: 60, avgConfidenceThreshold: 50 };
// Monday of Week 1, matching your Batch KPI Dashboard script's WEEK1_START.
const WEEK1_START = new Date(2026, 7, 3); // Aug is month index 7

const SESSION_TYPES = ["One-on-One", "Group Session"];
const IN_OUT = ["Inbound", "Outbound"];
const COHORTS = ["Top Cohort", "Middle Cohort", "Bottom Cohort"];
const STUDY_PATTERNS = ["Structured Daily", "Exam-Oriented", "Random/Ad-hoc", "Weekend Only", "Short-term regularity"];
const OWNERSHIP_LEVELS = [
  "Self-Driven (Proactively improves)",
  "Cooperative (Responds when guided)",
  "Reactive (Works only after reminders)",
  "Disengaged (avoids taking responsibility)",
];
const SUBJECTS = [
  { key: "dsa", label: "DSA" },
  { key: "maths3", label: "Maths 3" },
  { key: "wap", label: "WAP" },
  { key: "dva", label: "DVA" },
];

// ============================================================
// Pure calculation helpers -- matches your live "Sem 3" sheet's own
// formulas, verified against 54 real data points from your roster:
//   - Per-subject risk is bucketed from Confidence %: <=40 Critical,
//     41-59 Attention Required, 60-79 Stable, 80-100 No Intervention.
//   - Avg Academic Confidence = average of whichever subject
//     Confidence fields are filled in.
//   - Overall Risk Status = Avg Confidence >= 50 -> No Risk, else
//     Critical Risk.
//   - Effort Category = Productive Weekly Hours >= 12 -> High Effort.
//   - 2x2 Matrix = Effort Category x Overall Risk Status, same as
//     the Follow-Up Log.
// ============================================================
function subjectRiskLabel(conf) {
  if (conf === "" || conf === null || conf === undefined || isNaN(Number(conf))) return null;
  const c = Number(conf);
  if (c <= 40) return "Critical Risk";
  if (c < 60) return "Attention Required";
  if (c < 80) return "Stable";
  return "No Intervention";
}
function avgConfidence(student) {
  const vals = SUBJECTS.map((s) => student[s.key + "Confidence"]).filter((v) => v !== "" && v !== undefined && v !== null && !isNaN(Number(v)));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + Number(b), 0) / vals.length;
}
function overallRiskStatusFromConfidence(avgConf, threshold) {
  if (avgConf === null) return "No Risk"; // no diagnostic data yet -- default optimistic, matches sheet leaving it blank/No Risk
  return avgConf >= threshold ? "No Risk" : "Critical Risk";
}
function effortLevel(hours, threshold) {
  return Number(hours) >= threshold ? "High Effort" : "Low Effort";
}
function riskStatus(pct, threshold) {
  return Number(pct) >= threshold ? "No Risk" : "Critical Risk";
}
function matrixCategory(effort, risk) {
  if (effort === "High Effort" && risk === "No Risk") return "Growth Zone";
  if (effort === "High Effort" && risk === "Critical Risk") return "Skill Gap";
  if (effort === "Low Effort" && risk === "No Risk") return "Under-engaged";
  return "Immediate Intervention";
}
// Most recent action plan text for a student -- the latest follow-up's Updated
// Action Plan if one was given, walking back through history, otherwise the
// baseline Action Plan given by PI.
function getLatestActionPlan(student, sortedHistoryDesc) {
  for (const f of sortedHistoryDesc || []) {
    if (f.updatedActionPlan && f.updatedActionPlan.trim()) {
      return { text: f.updatedActionPlan.trim(), source: `Updated on ${fmtDate(f.date)}` };
    }
  }
  if (student.actionPlan && student.actionPlan.trim()) {
    return { text: student.actionPlan.trim(), source: "From 1st session" };
  }
  return null;
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function fmtDateShort(d) {
  if (!d) return "";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt.getTime())) return "";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function daysAgo(d) {
  if (!d) return null;
  const dt = new Date(d + "T00:00:00");
  const diff = Math.round((Date.now() - dt.getTime()) / 86400000);
  return diff;
}

// Next follow-up due date for a student: whatever the most recent follow-up scheduled,
// or the baseline's Next Follow-Up Date if there's no follow-up history yet. An older
// follow-up's date is never used if a more recent one exists but left it blank -- that's
// treated as "nothing currently scheduled", not a stale carry-forward.
function nextDueDate(student, history) {
  const sorted = [...(history || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (sorted.length > 0) return sorted[0].nextDate || null;
  return student.nextFollowUpDate || null;
}

// Categorizes a due date relative to today. daysUntil is negative when overdue.
function dueStatus(dueDateStr) {
  if (!dueDateStr) return null;
  const due = new Date(dueDateStr + "T00:00:00");
  if (isNaN(due.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);
  let label;
  if (daysUntil < 0) label = `Overdue by ${-daysUntil} day${-daysUntil === 1 ? "" : "s"}`;
  else if (daysUntil === 0) label = "Due today";
  else if (daysUntil === 1) label = "Due tomorrow";
  else label = `Due in ${daysUntil} days`;
  return { daysUntil, label };
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Builds Mon-Sun week buckets from WEEK1_START up through the latest date seen
// across the given date strings ("YYYY-MM-DD") -- same logic as the Batch KPI
// script's _buildWeeks, so week numbers line up with your existing dashboard.
function buildWeeks(allDateStrings) {
  let latest = null;
  allDateStrings.forEach((ds) => {
    if (!ds) return;
    const d = new Date(ds + "T12:00:00");
    if (!isNaN(d.getTime()) && (!latest || d > latest)) latest = d;
  });
  const today = new Date();
  let cutoff = latest || new Date(WEEK1_START);
  if (cutoff > today) cutoff = today;

  const weeks = [];
  let wkStart = new Date(WEEK1_START);
  let wkNum = 1;
  while (true) {
    const wkEnd = new Date(wkStart);
    wkEnd.setDate(wkEnd.getDate() + 6);
    weeks.push({ num: wkNum, start: new Date(wkStart), end: new Date(wkEnd) });
    if (cutoff >= wkStart && cutoff <= wkEnd) break;
    if (wkStart > cutoff) break;
    wkStart.setDate(wkStart.getDate() + 7);
    wkNum++;
    if (wkNum > 52) break;
  }
  return weeks;
}
function inWeek(dateStr, wk) {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T12:00:00");
  if (isNaN(d.getTime())) return false;
  return d >= wk.start && d <= new Date(wk.end.getFullYear(), wk.end.getMonth(), wk.end.getDate(), 23, 59, 59);
}

// ============================================================
// Draft autosave -- lets a PI run the session live in the tool without
// losing anything if they get interrupted. Drafts are PERSONAL storage
// (shared: false) so two PIs running sessions at the same time never
// overwrite each other's in-progress draft.
// ============================================================
// Personal, per-browser draft autosave -- protects against losing an
// in-progress form if a tab closes. Uses localStorage (a real browser API)
// instead of the Claude-artifact-only window.storage the old version used.
// Namespaced per logged-in user so two people sharing a browser don't clobber
// each other's drafts.
function draftStorageKey(draftKey) {
  const uid = (JSON.parse(localStorage.getItem("pt_current_user") || "null") || {}).id || "anon";
  return `pt_draft_${uid}_${draftKey}`;
}

function useDraftAutosave(draftKey, data, enabled) {
  const [savedAt, setSavedAt] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        localStorage.setItem(draftStorageKey(draftKey), JSON.stringify({ data, savedAt: Date.now() }));
        setSavedAt(Date.now());
      } catch (e) { /* best-effort -- a failed autosave shouldn't block the session */ }
    }, 700);
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data), enabled]);

  return savedAt;
}

async function loadDraft(draftKey) {
  try {
    const raw = localStorage.getItem(draftStorageKey(draftKey));
    if (raw) return JSON.parse(raw);
  } catch (e) { /* no draft yet -- fine */ }
  return null;
}
async function clearDraft(draftKey) {
  try { localStorage.removeItem(draftStorageKey(draftKey)); } catch (e) { /* already gone -- fine */ }
}
function timeAgo(ts) {
  if (!ts) return "";
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return s + "s ago";
  const m = Math.round(s / 60);
  return m + "m ago";
}

// Given a student's baseline + sorted follow-up history, compute their
// current derived state, mirroring the spreadsheet's "fall back to
// baseline if no prior follow-up" logic.
function computeStudentState(student, history, settings) {
  if (!student.hasSession) {
    return {
      category: null, effort: null, hours: student.hours || 0,
      avgConfidence: avgConfidence(student), overallRiskStatus: null, quality: null, qualityReason: "",
      followUpCount: 0, latestDate: null, shiftInEffort: null, shiftInRisk: null,
      prevCategory: null, escalated: false, notStarted: true,
    };
  }
  const baseEffort = effortLevel(student.hours, settings.hoursThreshold);
  const baseAvgConf = avgConfidence(student);
  const baseRiskStatus = overallRiskStatusFromConfidence(baseAvgConf, settings.avgConfidenceThreshold);
  const baseCategory = matrixCategory(baseEffort, baseRiskStatus);
  // Quality is only ever scored against the 1st session's Subjective Read + Action Plan,
  // same as your Apps Script -- it never re-scores based on follow-ups.
  const qc = scoreSessionQuality(student.subjectiveRead, student.actionPlan, baseCategory);

  if (!history || history.length === 0) {
    return {
      category: baseCategory, effort: baseEffort, hours: student.hours,
      avgConfidence: baseAvgConf, overallRiskStatus: baseRiskStatus, quality: qc.label, qualityReason: qc.reason,
      followUpCount: 0, latestDate: null, shiftInEffort: null, shiftInRisk: null,
      prevCategory: null, escalated: baseCategory === "Immediate Intervention",
    };
  }

  const latest = history[history.length - 1];
  const prev = history.length >= 2 ? history[history.length - 2] : null;

  const prevEffort = prev ? effortLevel(prev.hours, settings.hoursThreshold) : baseEffort;
  const prevRisk = prev ? riskStatus(prev.pctCompleted, settings.pctThreshold) : baseRiskStatus;
  const prevCategory = prev ? matrixCategory(prevEffort, prevRisk) : baseCategory;

  const thisEffort = effortLevel(latest.hours, settings.hoursThreshold);
  const thisRisk = riskStatus(latest.pctCompleted, settings.pctThreshold);
  const thisCategory = matrixCategory(thisEffort, thisRisk);

  const shiftInEffort = thisEffort === prevEffort ? "No Change" : (thisEffort === "High Effort" ? "Increased" : "Decreased");
  const pr = RISK_RANK[prevCategory], tr = RISK_RANK[thisCategory];
  const shiftInRisk = tr > pr ? "Better than last session" : tr < pr ? "Needs Support" : "Same as last session";

  return {
    category: thisCategory, effort: thisEffort, hours: latest.hours,
    avgConfidence: baseAvgConf, overallRiskStatus: baseRiskStatus, quality: qc.label, qualityReason: qc.reason,
    followUpCount: history.length, latestDate: latest.date,
    shiftInEffort, shiftInRisk, prevCategory,
    escalated: thisCategory === "Immediate Intervention",
  };
}

// Computes Effort Level + Shift in Effort for EVERY follow-up in a student's
// (already date-sorted) history, not just the latest -- needed for the Weekly
// Dashboard's per-week Increased/No Change/Decline counts, matching your
// Apps Script's per-row "Shift in Effort" column.
function computeFollowUpShifts(student, history, settings) {
  const baseEffort = effortLevel(student.hours, settings.hoursThreshold);
  const out = [];
  let prevEffort = baseEffort;
  (history || []).forEach((f) => {
    const thisEffort = effortLevel(f.hours, settings.hoursThreshold);
    const shiftInEffort = thisEffort === prevEffort ? "No Change" : (thisEffort === "High Effort" ? "Increased" : "Decreased");
    out.push({ followup: f, effort: thisEffort, shiftInEffort });
    prevEffort = thisEffort;
  });
  return out;
}

// ============================================================
// SESSION QUALITY SCORING -- ported directly from your Batch KPI
// Dashboard Apps Script (the "_scoreQC" engine). This grades a 1st
// session's Subjective Read + Action Plan text against its 2x2
// Matrix category, into one of 5 labels: Good Quality / Almost Good
// / Partially Aligned / Low Quality / Action Plan Not Given.
// Only ever applied to 1st sessions -- your script never runs this
// on follow-ups either, so neither does this port.
// ============================================================
const QC_GOOD = "Good Quality";
const QC_ALMOST = "Almost Good";
const QC_PARTIAL = "Partially Aligned";
const QC_LOW = "Low Quality";
const QC_NO_PLAN = "Action Plan Not Given";
const QC_LABELS = [QC_GOOD, QC_ALMOST, QC_PARTIAL, QC_LOW, QC_NO_PLAN];
const QC_META = {
  [QC_GOOD]:    { color: "#16A34A", bg: "#F0FDF4" },
  [QC_ALMOST]:  { color: "#CA8A04", bg: "#FEFCE8" },
  [QC_PARTIAL]: { color: "#7C3AED", bg: "#F5F3FF" },
  [QC_LOW]:     { color: "#DC2626", bg: "#FEF2F2" },
  [QC_NO_PLAN]: { color: "#64748B", bg: "#F1F5F9" },
};

function qcClean(v) {
  return v ? String(v).replace(/[\u200B\u200C\u200D\uFEFF\u00AD\u200E\u200F]/g, "").trim() : "";
}

function qcExtractConcerns(sL) {
  const f = [];
  function add(pp, id) { if (pp.some((k) => sL.indexOf(k) > -1)) f.push(id); }
  add(["maths is weak","math is weak","maths weak","math weak","maths low","math low","maths needs","math needs",
       "maths is poor","math is poor","maths structure","maths concepts","math concepts","low in maths","weak in maths",
       "weak in math","persistent weak area","math underperformance","maths both at","maths mark","maths score",
       "low maths","maths at 3","maths at 2","maths at 1","sesd and maths","aiml and maths","maths:","math:"], "maths");
  add(["dsa is weak","dsa weak","dsa.*not able","not able.*dsa","dsa fear","dsa concepts","dsa fundamentals","dsa gap",
       "weak.*dsa","struggling.*dsa","can't implement","cannot implement","not able to implement","visualize code",
       "dsa.*finding","finding.*dsa"], "dsa");
  add(["aiml","ai ml","ai & ml","machine learning","aiml.*weak","aiml.*struggling"], "aiml");
  add(["sesd","sesd:","sesd weak","sesd.*not"], "sesd");
  add(["dva","dva:","dva weak","dva.*not","not.*dva"], "dva");
  add(["wap.*weak","wap.*struggl","struggling.*wap","wap.*not able","surviving in wap","surving in wap",
       "wap assignments","wap.*html","js.*hard","html.*css.*dom","js application","foai.*js"], "wap_js");
  add(["concept.*not clear","conceptual gap","gap in concept","not understanding","clarity in concept",
       "concept.*weak","concepts aren't clear"], "concepts");
  add(["time management","no time ","not able to manage time","poor time","unable to manage","time crunch",
       "can't balance","personal distraction","not able to balance"], "time");
  add(["not attend","debarred","detained","missing class","miss class","skip class","bunking","absent.*class"], "attendance");
  if (/attendance.*[3-6]\d%|[3-6]\d%.*attendance/.test(sL)) f.push("attendance");
  add(["assignment.*[0-4]\\d%","[0-4]\\d%.*assignment","assignment completion","incomplete assignment",
       "not doing assignment","assignments.*low","low.*assignment","assignment.*below","pending assignment",
       "assignment.*not submitted","assignments are largely incomplete"], "assignments");
  add(["not practicing","not doing questions","not solving","lack of practice","no practice","practice is less",
       "less practice","practice deficiency","not practic"], "practice");
  add(["feels demotivated","feeling demotivated","lost motivation","no motivation","low motivation",
       "lacks motivation","losing interest","doesn't feel like studying","does not feel like","giving up",
       "demotivated","low motivation"], "motivation");
  add(["procrastinates","procrastination","keeps delaying","putting off"], "procrastination");
  add(["not able to focus","can't focus","losing focus","distracted","difficulty in focusing",
       "phone distraction","difficulty concentrating","personal distract"], "focus");
  add(["very nervous","gets nervous","nervousness","low confidence","anxiety","anxious","mind is.*enemy","exam fear"], "confidence");
  add(["overwhelmed","too overwhelmed","stressed","mental stress"], "wellbeing");
  add(["no project","not building project","project.*missing","project portfolio.*basic","no internship",
       "not applying.*internship","resume.*not ready","resume not prepared","resume approval"], "project_career");
  add(["internship","intern ","placement","job search"], "internship");
  return f.filter((v, i) => f.indexOf(v) === i);
}

function qcAlreadyHandled(sL, c) {
  const m = {
    maths: ["maths.*fine","math.*fine","strong in maths","strong in math","maths.*[8-9]\\d","math.*[8-9]\\d",
             "maths.*100","math.*100","no issue with maths"],
    dsa: ["dsa.*going well","dsa.*fine","strong.*dsa","enjoying dsa"],
    aiml: ["aiml.*fine","aiml.*going well","strong in aiml"],
    attendance: ["100%.*attendance","attendance.*100%","no attendance issue","attendance is fine","good attendance",
                 "attending all","full attendance"],
    motivation: ["self-motivat","self motivat","self-driven","self driven","uses peer competition as a positive push",
                 "genuinely motivated","intrinsically motivated","positive push","internally motivated"],
    focus: ["improved discipline","structured study schedule","cut down.*distract","now maintains.*schedule",
            "consciously.*schedule","structured.*study"],
    confidence: ["confidence.*improved","gaining confidence","becoming confident"],
  };
  return (m[c] || []).some((h) => { try { return new RegExp(h).test(sL); } catch (e) { return sL.indexOf(h) > -1; } });
}

function qcPlanCovers(c, pL) {
  const pk = ["assignment","practice","daily","question","solve","problem","by monday","by friday","by tuesday",
              "by wednesday","by thursday"];
  const pi = pk.some((k) => pL.indexOf(k) > -1);
  if ((c === "assignments" || c === "practice" || c === "concepts" || c === "dsa") && pi) return true;
  const m = {
    maths: ["maths","math","gurpreet","worksheet","maths.*topic","daily.*maths"],
    dsa: ["dsa","leetcode","dsa.*question","data struct","algorithm"],
    aiml: ["aiml","ai","ml","machine learning"],
    sesd: ["sesd","uml","diagram","revision"],
    dva: ["dva","addhyan","office hour","dva.*question"],
    wap_js: ["wap","html","css","javascript","js","dom"],
    concepts: ["concept","topic","revise","faculty","doubt","resource","lecture"],
    time: ["time","schedule","daily","plan","prioriti","balance","routine","structured"],
    attendance: ["attend","class","present","100%","make sure","daily.*class"],
    assignments: ["assignment","submit","complete","above","from.*%","to.*%","by monday","by friday","by tuesday",
                  "by wednesday","by thursday","by saturday","by sunday","by 3","by 9","by 2","by 1"],
    practice: ["practice","question","daily","solve","problem","assignment","leetcode"],
    motivation: ["goal","direction","target","clarity","career","vision","motivat","mental peace","explore",
                 "achievement","short term","long term"],
    procrastination: ["schedule","daily","routine","start","morning","commit","plan","habit"],
    focus: ["focus","schedule","routine","plan","dedicated","session","distract"],
    confidence: ["counselling","counsel","session","confidence","mental","support","mentor"],
    wellbeing: ["rest","relax","counsel","peace","mental","support","help","break","talk"],
    project_career: ["project","internship","portfolio","apply","linkedin","hackathon","project ideas",
                      "bring.*project","resume"],
    internship: ["internship","apply","portal","linkedin","company","interview","resume","project"],
  };
  return (m[c] || []).some((kw) => { try { return new RegExp(kw).test(pL); } catch (e) { return pL.indexOf(kw) > -1; } });
}

const QC_CONCERN_LABELS = { maths:"Maths", dsa:"DSA", aiml:"AIML", sesd:"SESD", dva:"DVA", wap_js:"WAP/JS", concepts:"concept gaps",
  time:"time management", attendance:"attendance", assignments:"assignments", practice:"practice",
  motivation:"motivation", procrastination:"procrastination", focus:"focus/distraction",
  confidence:"confidence/nervousness", wellbeing:"wellbeing/stress", project_career:"projects/career",
  internship:"internship" };

function qcBuildReason(concerns, pL) {
  const miss = concerns.filter((c) => !qcPlanCovers(c, pL));
  return miss.length > 0
    ? "Missing plan for: " + miss.slice(0, 3).map((c) => QC_CONCERN_LABELS[c] || c).join(", ")
    : "Plan does not sufficiently address the concerns raised";
}

function qcScoreGrowth(pL, pW) {
  const hasTarget = /\d+%/.test(pL);
  const hasDeadline = /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)|this week|next week|\d+(th|rd|st|nd)\b/.test(pL);
  const hasSpecificPerson = /\b(sir|ma'am|mam|counsell)\b/.test(pL);
  const actionLines = pL.split(/\n|^\d+\.|;/).filter((l) => l.trim().length > 3);
  const multiAction = actionLines.length > 1;
  if (multiAction || hasTarget || hasDeadline || hasSpecificPerson || pW.length >= 6) return { label: QC_GOOD, reason: "" };
  if (pW.length >= 3) return { label: QC_ALMOST, reason: "Plan gives some direction but lacks a specific target or deadline." };
  if (pW.length >= 2) return { label: QC_PARTIAL, reason: "Plan is minimal -- add a specific action with direction." };
  return { label: QC_LOW, reason: "Plan is nonsensical or completely irrelevant." };
}

// Main entry point. subjectiveRead/actionPlan are raw text, category is
// one of the 4 CATEGORY_ORDER values (or null/blank if not yet known).
function scoreSessionQuality(subjectiveRead, actionPlan, category) {
  const p = qcClean(actionPlan);
  const pW = p.split(/\s+/).filter((w) => w.length > 1);
  if (!p || pW.length < 2) return { label: QC_NO_PLAN, reason: "" };

  let isGrowth = category === "Growth Zone";
  let isSkill = category === "Skill Gap";
  let isUnder = category === "Under-engaged";
  let isImmed = category === "Immediate Intervention";
  if (!isGrowth && !isSkill && !isUnder && !isImmed) isSkill = true; // matrix not filled -> default to Skill Gap thresholds

  const s = qcClean(subjectiveRead);
  if (!s || s.length < 5) {
    return pW.length >= 5
      ? { label: QC_ALMOST, reason: "Plan exists but no subjective read to verify against." }
      : { label: QC_NO_PLAN, reason: "" };
  }
  const sL = s.toLowerCase(), pL = p.toLowerCase();

  if (isGrowth) {
    const hasCrit = /attendance.*[3-6]\d%|[3-6]\d%.*attendance|debarred|detained/.test(sL) || /\b[0-3]\d\b/.test(sL);
    const hasSpecific = /\d+%/.test(pL) && /by\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)|this week|next week|\d+th|\d+rd|\d+st/.test(pL);
    if (hasCrit && !hasSpecific) { isGrowth = false; isSkill = true; }
    else return qcScoreGrowth(pL, pW);
  }

  const concerns = qcExtractConcerns(sL).filter((c) => !qcAlreadyHandled(sL, c));
  if (!concerns.length) return { label: pW.length >= 3 ? QC_GOOD : QC_ALMOST, reason: "" };

  let covered = 0;
  concerns.forEach((c) => { if (qcPlanCovers(c, pL)) covered++; });
  let ratio = covered / concerns.length;

  const hasTarget = /\d+%/.test(pL);
  const hasDeadline = /\bby\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d)|this week|next week|\d+(th|rd|st|nd)\b/.test(pL);
  if (hasTarget && hasDeadline) ratio = Math.min(ratio + 0.12, 1.0);
  else if (hasTarget || hasDeadline) ratio = Math.min(ratio + 0.06, 1.0);
  if (pW.length < 5 && concerns.length > 2) ratio = Math.max(ratio - 0.15, 0);

  if (isImmed) {
    if (ratio >= 0.80) return { label: QC_GOOD, reason: "" };
    if (ratio >= 0.70) return { label: QC_ALMOST, reason: qcBuildReason(concerns, pL) };
    if (ratio >= 0.60) return { label: QC_PARTIAL, reason: qcBuildReason(concerns, pL) };
    return { label: QC_LOW, reason: qcBuildReason(concerns, pL) };
  }
  if (ratio >= 0.70) return { label: QC_GOOD, reason: "" };
  if (ratio >= 0.60) return { label: QC_ALMOST, reason: qcBuildReason(concerns, pL) };
  if (ratio >= 0.50) return { label: QC_PARTIAL, reason: qcBuildReason(concerns, pL) };
  return { label: QC_LOW, reason: qcBuildReason(concerns, pL) };
}

// ============================================================
// Small shared UI bits
// ============================================================


export {
  batchesForCampus,
  subjectRiskLabel,
  avgConfidence,
  overallRiskStatusFromConfidence,
  effortLevel,
  riskStatus,
  matrixCategory,
  getLatestActionPlan,
  fmtDate,
  fmtDateShort,
  daysAgo,
  nextDueDate,
  dueStatus,
  uid,
  buildWeeks,
  inWeek,
  draftStorageKey,
  useDraftAutosave,
  loadDraft,
  clearDraft,
  timeAgo,
  computeStudentState,
  computeFollowUpShifts,
  qcClean,
  qcExtractConcerns,
  qcAlreadyHandled,
  qcPlanCovers,
  qcBuildReason,
  qcScoreGrowth,
  scoreSessionQuality,
  NST_CAMPUS,
  BATCHES,
  CAMPUSES,
  CAMPUS_BATCHES,
  CATEGORY_META,
  CATEGORY_ORDER,
  RISK_RANK,
  DEFAULT_SETTINGS,
  WEEK1_START,
  SESSION_TYPES,
  IN_OUT,
  COHORTS,
  STUDY_PATTERNS,
  OWNERSHIP_LEVELS,
  SUBJECTS,
  QC_GOOD,
  QC_ALMOST,
  QC_PARTIAL,
  QC_LOW,
  QC_NO_PLAN,
  QC_LABELS,
  QC_META,
  QC_CONCERN_LABELS,
};
