import { useState, useEffect, useMemo } from "react";
import { AuthProvider, useAuth } from "./AuthContext";
import { api } from "./api";
import {
  NST_CAMPUS, CAMPUSES, DEFAULT_SETTINGS, computeStudentState,
} from "./shared";

import Login from "./components/Login";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Dashboard from "./components/Dashboard";
import WeeklyDashboard from "./components/WeeklyDashboard";
import StudentSessionView from "./components/StudentSession";
import AddStudentForm from "./components/AddStudentForm";
import AddFollowUpForm from "./components/AddFollowUpForm";
import SettingsView from "./components/SettingsView";
import ImportDataView from "./components/ImportDataView";
import UserManagement from "./components/UserManagement";

function AppShell() {
  const { user, loading: authLoading } = useAuth();

  if (authLoading) {
    return <div className="flex h-full min-h-[500px] items-center justify-center bg-slate-50 text-sm text-slate-400">Loading…</div>;
  }
  if (!user) return <Login />;
  return <AppContent />;
}

function AppContent() {
  const { user, isAdmin } = useAuth();

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState({});     // keyed by urn, same shape as before
  const [followups, setFollowups] = useState([]);   // flat array
  const [campuses, setCampuses] = useState([]);
  const [settingsByCampus, setSettingsByCampus] = useState({}); // campusId -> settings
  const [toast, setToast] = useState(null);

  const [tab, setTab] = useState("dashboard");
  const [selectedUrn, setSelectedUrn] = useState(null);
  const [conductSessionFor, setConductSessionFor] = useState(null);
  const [followUpForUrn, setFollowUpForUrn] = useState(null);
  const [globalCampus, setGlobalCampus] = useState(NST_CAMPUS);
  const [globalBatch, setGlobalBatch] = useState("All");

  const campusIdByName = useMemo(() => {
    const m = {};
    campuses.forEach((c) => { m[c.name] = c.id; });
    return m;
  }, [campuses]);

  function showToast(msg, type) {
    setToast({ msg, type: type || "success" });
    setTimeout(() => setToast(null), 2600);
  }

  async function loadAll() {
    setLoading(true);
    try {
      const [studentList, followupList, campusList] = await Promise.all([
        api.listStudents(), api.listFollowUps(), api.listCampuses(),
      ]);
      const byUrn = {};
      studentList.forEach((s) => { byUrn[s.urn] = s; });
      setStudents(byUrn);
      setFollowups(followupList);
      setCampuses(campusList);

      // A scoped PI only has settings-read access implicitly through campus
      // membership; fetch every campus's settings so switching the sidebar
      // never has to wait on a network round trip.
      const settingsEntries = await Promise.all(
        campusList.map(async (c) => {
          try { return [c.id, await api.getSettings(c.id)]; }
          catch (e) { return [c.id, DEFAULT_SETTINGS]; }
        })
      );
      setSettingsByCampus(Object.fromEntries(settingsEntries));
    } catch (e) {
      showToast(e.message || "Couldn't load data", "error");
    }
    setLoading(false);
  }

  useEffect(() => {
    if (user) {
      localStorage.setItem("pt_current_user", JSON.stringify({ id: user.id }));
      loadAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const currentCampusId = campusIdByName[globalCampus];
  const currentSettings = settingsByCampus[currentCampusId] || DEFAULT_SETTINGS;

  const followupsByStudent = useMemo(() => {
    const m = {};
    followups.forEach((f) => { (m[f.urn] = m[f.urn] || []).push(f); });
    return m;
  }, [followups]);

  const studentStates = useMemo(() => {
    const m = {};
    Object.values(students).forEach((s) => {
      // Each student's own campus determines which threshold settings apply
      // to them -- not whichever campus happens to be selected in the sidebar.
      const cId = campusIdByName[s.campus || NST_CAMPUS];
      const settingsForThem = settingsByCampus[cId] || DEFAULT_SETTINGS;
      m[s.urn] = computeStudentState(s, followupsByStudent[s.urn] || [], settingsForThem);
    });
    return m;
  }, [students, followupsByStudent, settingsByCampus, campusIdByName]);

  // ---------- Mutations ----------
  async function addStudent(rec, isEdit) {
    const campusId = campusIdByName[rec.campus];
    if (!campusId) { showToast("Unknown campus", "error"); return false; }
    try {
      const saved = await api.saveStudent(rec.urn, { ...rec, campusId }, isEdit);
      setStudents((prev) => ({ ...prev, [saved.urn]: saved }));
      showToast(isEdit ? `${rec.name}'s 1st session updated` : `${rec.name} added`);
      return true;
    } catch (e) {
      showToast(e.message, "error");
      return false;
    }
  }

  async function deleteStudent(urn) {
    try {
      await api.deleteStudent(urn);
      setStudents((prev) => { const n = { ...prev }; delete n[urn]; return n; });
      showToast("Student deleted");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function addFollowUp(rec) {
    try {
      const saved = await api.createFollowUp(rec.urn, rec);
      setFollowups((prev) => [...prev, saved]);
      showToast("Follow-up logged");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  // Bulk import has no dedicated backend endpoint -- it reuses the same
  // single-record endpoints the manual forms use, sequentially. Simple and
  // correct; a true bulk endpoint would only matter at import volumes far
  // beyond what a 25-30 person team generates.
  async function addStudentsBulk(rows) {
    let ok = 0, failed = 0;
    for (const rec of rows) {
      const campusId = campusIdByName[rec.campus];
      if (!campusId) { failed++; continue; }
      try {
        await api.saveStudent(rec.urn, { ...rec, campusId }, true);
        ok++;
      } catch (e) { failed++; }
    }
    await loadAll();
    showToast(`${ok} student(s) imported${failed ? `, ${failed} failed` : ""}`, failed ? "error" : "success");
  }

  async function addFollowUpsBulk(rows) {
    let ok = 0, failed = 0;
    for (const rec of rows) {
      try { await api.createFollowUp(rec.urn, rec); ok++; }
      catch (e) { failed++; }
    }
    await loadAll();
    showToast(`${ok} follow-up(s) imported${failed ? `, ${failed} failed` : ""}`, failed ? "error" : "success");
  }

  async function deleteFollowUp(id) {
    try {
      await api.deleteFollowUp(id);
      setFollowups((prev) => prev.filter((f) => f.id !== id));
      showToast("Follow-up deleted");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  async function persistSettings(patch) {
    if (!currentCampusId) return;
    try {
      const updated = await api.updateSettings(currentCampusId, patch);
      setSettingsByCampus((prev) => ({ ...prev, [currentCampusId]: updated }));
      showToast("Settings saved");
    } catch (e) {
      showToast(e.message, "error");
    }
  }

  const ADMIN_ONLY_TABS = ["weekly", "import", "settings", "team"];
  useEffect(() => {
    if (!isAdmin && ADMIN_ONLY_TABS.includes(tab)) setTab("dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, tab]);

  if (loading) {
    return <div className="flex h-full min-h-[500px] items-center justify-center bg-slate-50 text-sm text-slate-400">Loading your tracker…</div>;
  }

  return (
    <div className="flex h-full min-h-[700px] w-full bg-slate-50 text-slate-900" style={{ fontFamily: "Inter, system-ui, sans-serif" }}>
      <Sidebar activeCampus={globalCampus} activeBatch={globalBatch} onSelectCampus={setGlobalCampus} onSelectBatch={setGlobalBatch} students={students} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar tab={tab} setTab={setTab} />
        {toast && (
          <div
            className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg"
            style={{ backgroundColor: toast.type === "error" ? "#DC2626" : "#16A34A" }}
          >
            {toast.msg}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          {tab === "dashboard" && (
            <Dashboard students={students} studentStates={studentStates} followups={followups} settings={currentSettings} campus={globalCampus} batch={globalBatch} onOpenStudent={(u) => { setSelectedUrn(u); setTab("students"); }} />
          )}
          {tab === "weekly" && isAdmin && (
            <WeeklyDashboard students={students} followupsByStudent={followupsByStudent} settings={currentSettings} campus={globalCampus} batch={globalBatch} />
          )}
          {tab === "students" && (
            <StudentSessionView
              students={students} studentStates={studentStates} followups={followups} followupsByStudent={followupsByStudent} settings={currentSettings}
              campus={globalCampus} batch={globalBatch}
              selectedUrn={selectedUrn} setSelectedUrn={setSelectedUrn}
              onDeleteStudent={deleteStudent} onDeleteFollowUp={deleteFollowUp}
              onConductSession={(urn) => { setConductSessionFor(urn); setTab("addStudent"); }}
              onEditSession={(urn) => { setConductSessionFor(urn); setTab("addStudent"); }}
              onTakeFollowUp={(urn) => { setFollowUpForUrn(urn || null); setTab("addFollowUp"); }}
            />
          )}
          {tab === "addStudent" && (
            <AddStudentForm
              settings={currentSettings}
              defaultCampus={globalCampus}
              prefill={conductSessionFor ? students[conductSessionFor] : null}
              onSave={async (rec) => {
                const isEdit = !!(conductSessionFor && students[conductSessionFor] && students[conductSessionFor].hasSession);
                if (await addStudent(rec, isEdit)) { setConductSessionFor(null); setSelectedUrn(rec.urn); setTab("students"); }
              }}
              onCancel={() => {
                const urn = conductSessionFor;
                setConductSessionFor(null);
                if (urn) setSelectedUrn(urn);
                setTab("students");
              }}
            />
          )}
          {tab === "addFollowUp" && (
            <AddFollowUpForm
              students={students} studentStates={studentStates} settings={currentSettings}
              prefillUrn={followUpForUrn}
              onSave={async (rec) => { await addFollowUp(rec); setFollowUpForUrn(null); setTab("students"); }}
              onCancel={() => { setFollowUpForUrn(null); setTab("students"); }}
            />
          )}
          {tab === "import" && isAdmin && (
            <ImportDataView students={students} defaultCampus={globalCampus} onImportStudents={addStudentsBulk} onImportFollowUps={addFollowUpsBulk} />
          )}
          {tab === "settings" && isAdmin && <SettingsView settings={currentSettings} onSave={persistSettings} />}
          {tab === "team" && isAdmin && <UserManagement />}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
