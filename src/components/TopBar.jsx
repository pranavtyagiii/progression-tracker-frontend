import { LayoutDashboard, CalendarDays, Users, Upload, Settings as SettingsIcon, UserCog, Shield, LogOut } from "lucide-react";
import { useAuth } from "../AuthContext";

export default function TopBar({ tab, setTab }) {
  const { user, isAdmin, logout } = useAuth();

  const allItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
    { id: "weekly", label: "Weekly Dashboard", icon: CalendarDays, adminOnly: true },
    { id: "students", label: "Student Session", icon: Users, adminOnly: false },
    { id: "import", label: "Import Data", icon: Upload, adminOnly: true },
    { id: "settings", label: "Settings", icon: SettingsIcon, adminOnly: true },
    { id: "team", label: "Team", icon: UserCog, adminOnly: true },
  ];
  const items = allItems.filter((it) => isAdmin || !it.adminOnly);

  return (
    <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
      <div className="flex items-center gap-2.5">
        <span className="text-sm font-semibold tracking-tight text-slate-900">Progression Tracker</span>
      </div>
      <nav className="flex items-center gap-1">
        {items.map((it) => {
          const Icon = it.icon;
          const active = tab === it.id;
          return (
            <button
              key={it.id}
              onClick={() => setTab(it.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? "bg-blue-700 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              <Icon size={14} /> {it.label}
            </button>
          );
        })}
      </nav>
      <div className="flex items-center gap-2 pl-3">
        <span className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {isAdmin ? <Shield size={12} className="text-indigo-600" /> : <Users size={12} className="text-slate-400" />}
          {user?.name} <span className="text-slate-400">· {user?.role}</span>
        </span>
        <button onClick={logout} title="Log out" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
          <LogOut size={14} />
        </button>
      </div>
    </div>
  );
}
