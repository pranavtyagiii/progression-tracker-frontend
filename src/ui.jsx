// ============================================================
// Small shared UI bits -- pills, badges, stat cards, form fields.
// Ported directly from the product; purely presentational, no data-layer
// changes needed here.
// ============================================================
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { CATEGORY_META, QC_META } from "./shared";

function CategoryPill({ category, size = "sm" }) {
  const meta = CATEGORY_META[category] || { color: "#6B7280", bg: "#F3F4F6", label: category || "—" };
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${pad}`}
      style={{ color: meta.color, backgroundColor: meta.bg, border: `1px solid ${meta.color}33` }}
    >
      {meta.label}
    </span>
  );
}

function QualityPill({ quality, size = "sm" }) {
  const meta = QC_META[quality] || { color: "#6B7280", bg: "#F3F4F6" };
  const pad = size === "sm" ? "px-2 py-0.5 text-xs" : "px-3 py-1 text-sm";
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium ${pad}`}
      style={{ color: meta.color, backgroundColor: meta.bg, border: `1px solid ${meta.color}33` }}
    >
      {quality || "—"}
    </span>
  );
}

function ShiftBadge({ shift }) {
  if (!shift) return <span className="text-xs text-slate-400">First session</span>;
  const map = {
    "Better than last session": { icon: TrendingUp, color: "#16A34A", bg: "#F0FDF4", text: "Improving" },
    "Same as last session": { icon: Minus, color: "#CA8A04", bg: "#FEFCE8", text: "Same" },
    "Needs Support": { icon: TrendingDown, color: "#EA580C", bg: "#FFF7ED", text: "Needs Support" },
  };
  const m = map[shift] || { icon: Minus, color: "#6B7280", bg: "#F3F4F6", text: shift };
  const Icon = m.icon;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ color: m.color, backgroundColor: m.bg }}
    >
      <Icon size={12} /> {m.text}
    </span>
  );
}

function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
          {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
        </div>
        {Icon && (
          <div className="rounded-lg p-2" style={{ backgroundColor: (accent || "#1E40AF") + "1A" }}>
            <Icon size={18} style={{ color: accent || "#1E40AF" }} />
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200";
function ProgressRow({ label, value, total, color, bg, icon: Icon }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between rounded-lg p-2.5" style={{ backgroundColor: bg }}>
      <div className="flex items-center gap-2">
        <Icon size={14} style={{ color }} />
        <span className="text-sm font-medium text-slate-700">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold" style={{ color }}>{value}</span>
        <span className="text-xs text-slate-400">({pct}%)</span>
      </div>
    </div>
  );
}

// ============================================================
// STUDENTS VIEW (list + detail)
function MiniStat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5">
      <div className="text-[11px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-800">{value}</div>
    </div>
  );
}
function ShiftEffortTag({ shift }) {
  const map = {
    Increased: { color: "#16A34A", bg: "#F0FDF4" },
    "No Change": { color: "#CA8A04", bg: "#FEFCE8" },
    Decreased: { color: "#DC2626", bg: "#FEF2F2" },
  };
  const m = map[shift] || { color: "#6B7280", bg: "#F3F4F6" };
  return <span className="rounded-full px-2 py-0.5 text-xs font-medium" style={{ color: m.color, backgroundColor: m.bg }}>{shift}</span>;
}

export {
  CategoryPill,
  QualityPill,
  ShiftBadge,
  StatCard,
  Field,
  inputCls,
  ProgressRow,
  MiniStat,
  ShiftEffortTag,
};
