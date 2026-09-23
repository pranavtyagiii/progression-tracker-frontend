import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { NST_CAMPUS, CAMPUSES, batchesForCampus } from "../shared";

export default function Sidebar({ activeCampus, activeBatch, onSelectCampus, onSelectBatch, students }) {
  const [expanded, setExpanded] = useState(activeCampus !== NST_CAMPUS ? activeCampus : null);

  const campusCounts = {};
  CAMPUSES.forEach((c) => { campusCounts[c] = 0; });
  Object.values(students).forEach((s) => { const c = s.campus || NST_CAMPUS; if (campusCounts[c] !== undefined) campusCounts[c]++; });

  function countFor(campus, batch) {
    return Object.values(students).filter((s) => (s.campus || NST_CAMPUS) === campus && s.batch === batch).length;
  }

  function clickCampus(c) {
    const years = batchesForCampus(c);
    const hasYears = c !== NST_CAMPUS && years.length > 0;
    onSelectCampus(c);
    onSelectBatch("All");
    if (hasYears) setExpanded(expanded === c ? null : c);
    else setExpanded(null);
  }

  return (
    <div className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
        <img src="/logo.png" alt="Newton School of Technology" className="h-10 w-auto" />
      </div>
      <div className="px-3 pt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Campus</div>
      <nav className="flex flex-col gap-0.5 p-2">
        {CAMPUSES.map((c) => {
          const years = batchesForCampus(c);
          const hasYears = c !== NST_CAMPUS;
          const isActiveCampus = activeCampus === c;
          const isExpanded = expanded === c;
          return (
            <div key={c}>
              <button
                onClick={() => clickCampus(c)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                  isActiveCampus && activeBatch === "All" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {hasYears && <ChevronRight size={12} className={`transition-transform ${isExpanded ? "rotate-90" : ""} ${isActiveCampus && activeBatch === "All" ? "text-white" : "text-slate-400"}`} />}
                  {c === NST_CAMPUS ? "Newton School of Technology" : c}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${isActiveCampus && activeBatch === "All" ? "bg-white/20 text-white" : "bg-slate-100 text-slate-400"}`}>
                  {campusCounts[c]}
                </span>
              </button>
              {hasYears && isExpanded && (
                <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-slate-200 pl-2">
                  {years.map((y) => {
                    const isActiveYear = isActiveCampus && activeBatch === y;
                    return (
                      <button
                        key={y}
                        onClick={() => { onSelectCampus(c); onSelectBatch(y); }}
                        className={`flex items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium ${
                          isActiveYear ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50"
                        }`}
                      >
                        <span>{y}</span>
                        <span className="text-slate-400">{countFor(c, y)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </div>
  );
}
