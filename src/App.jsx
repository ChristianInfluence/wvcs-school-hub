import { useMemo, useState } from "react";
import {
  CalendarClock,
  Files,
  FileText,
  LayoutDashboard,
  ShieldAlert,
  Settings,
  Users,
} from "lucide-react";
import ImportantDocumentsModule, { AdminDocumentsModule } from "./modules/documents/ImportantDocumentsModule.jsx";
import StaffFormsModule, { AdminFormsModule } from "./modules/forms/FormsModule.jsx";
import InfrastructureModule from "./modules/admin/InfrastructureModule.jsx";
import MeetingsModule, { AdminMeetingsModule } from "./modules/meetings/MeetingsModule.jsx";
import StructuredRecessModule from "./modules/recess/StructuredRecessModule.jsx";
import SchedulerModule from "./modules/scheduler/SchedulerModule.jsx";

const modules = [
  {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "A quick view of school operations and pending work.",
  },
  {
    id: "scheduler",
    label: "Scheduler",
    icon: CalendarClock,
    description: "Build and manage the master school schedule.",
    color: "sky",
    callout: "Master schedule builder",
  },
  {
    id: "meetings",
    label: "Meeting Requests",
    icon: Users,
    description: "Request meetings with administrators and track responses.",
    color: "violet",
    callout: "Admin availability",
  },
  {
    id: "structured-recess",
    label: "Structured Recess",
    icon: ShieldAlert,
    description: "Track students assigned to structured recess for aides and elementary teachers.",
    color: "amber",
    callout: "Live aide board",
  },
  {
    id: "forms",
    label: "Forms",
    icon: FileText,
    description: "Complete school forms and route them to the right people.",
    color: "emerald",
    callout: "Staff submissions",
  },
  {
    id: "documents",
    label: "Important Documents",
    icon: Files,
    description: "View and download important school documents.",
    color: "teal",
    callout: "Staff resources",
  },
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    description: "Manage school hub settings and future integrations.",
    color: "rose",
    callout: "Approvals and tools",
  },
];

const moduleStyles = {
  sky: {
    card: "border-sky-400/40 bg-sky-500/10 hover:border-sky-300",
    icon: "border-sky-300/40 bg-sky-400/20 text-sky-100",
    bar: "bg-sky-400",
    text: "text-sky-200",
  },
  violet: {
    card: "border-violet-400/40 bg-violet-500/10 hover:border-violet-300",
    icon: "border-violet-300/40 bg-violet-400/20 text-violet-100",
    bar: "bg-violet-400",
    text: "text-violet-200",
  },
  amber: {
    card: "border-amber-400/40 bg-amber-500/10 hover:border-amber-300",
    icon: "border-amber-300/40 bg-amber-400/20 text-amber-100",
    bar: "bg-amber-400",
    text: "text-amber-200",
  },
  emerald: {
    card: "border-emerald-400/40 bg-emerald-500/10 hover:border-emerald-300",
    icon: "border-emerald-300/40 bg-emerald-400/20 text-emerald-100",
    bar: "bg-emerald-400",
    text: "text-emerald-200",
  },
  rose: {
    card: "border-rose-400/40 bg-rose-500/10 hover:border-rose-300",
    icon: "border-rose-300/40 bg-rose-400/20 text-rose-100",
    bar: "bg-rose-400",
    text: "text-rose-200",
  },
  teal: {
    card: "border-teal-400/40 bg-teal-500/10 hover:border-teal-300",
    icon: "border-teal-300/40 bg-teal-400/20 text-teal-100",
    bar: "bg-teal-400",
    text: "text-teal-200",
  },
};

function DashboardModule({ onSelectModule, onOpenAideView }) {
  const launchModules = modules.filter((module) => module.id !== "dashboard");
  const featured = launchModules.find((module) => module.id === "structured-recess");

  return (
    <section className="min-h-[560px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">WVCS Command Center</div>
            <h1 className="mt-2 text-3xl font-bold text-white">School Operations Dashboard</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Jump into scheduling, recess support, forms, approvals, and future staff workflows from one clean launch point.
            </p>
          </div>
          {featured && (
            <button
              type="button"
              onClick={onOpenAideView}
              className="rounded-lg border border-amber-400/50 bg-amber-500/15 px-4 py-3 text-left transition hover:bg-amber-500/25"
            >
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">Aide&apos;s View</div>
              <div className="mt-1 text-sm font-semibold text-white">Open Structured Recess Board</div>
            </button>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-5">
          {launchModules.map((module, index) => {
            const Icon = module.icon;
            const styles = moduleStyles[module.color];
            return (
              <button
                key={module.id}
                type="button"
                onClick={() => onSelectModule(module.id)}
                className={`group relative min-h-56 overflow-hidden rounded-lg border p-4 text-left transition hover:-translate-y-1 hover:shadow-2xl ${styles.card}`}
              >
                <div className={`absolute left-0 top-0 h-1.5 w-full ${styles.bar}`} />
                <div className="flex items-start justify-between gap-3">
                  <div className={`rounded-lg border p-3 ${styles.icon}`}>
                    <Icon size={24} />
                  </div>
                  <div className={`text-4xl font-black text-white/5 transition group-hover:text-white/10`}>
                    {String(index + 1).padStart(2, "0")}
                  </div>
                </div>
                <div className={`mt-5 text-xs font-semibold uppercase tracking-[0.16em] ${styles.text}`}>
                  {module.callout}
                </div>
                <h2 className="mt-2 text-xl font-bold text-white">{module.label}</h2>
                <p className="mt-3 text-sm leading-6 text-slate-300">{module.description}</p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function AdminModule() {
  const [adminView, setAdminView] = useState("forms");

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1500px] flex-wrap gap-2 px-5 pt-6">
        {[
          ["infrastructure", "Infrastructure", Settings],
          ["meetings", "Meetings Admin", Users],
          ["forms", "Forms Admin", FileText],
          ["documents", "Documents Admin", Files],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setAdminView(id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              adminView === id
                ? "border-sky-400 bg-sky-500 text-white"
                : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {adminView === "infrastructure" && <InfrastructureModule />}
      {adminView === "meetings" && <AdminMeetingsModule />}
      {adminView === "forms" && <AdminFormsModule />}
      {adminView === "documents" && <AdminDocumentsModule />}
    </section>
  );
}

export default function App() {
  const [activeModule, setActiveModule] = useState("dashboard");
  const [structuredRecessView, setStructuredRecessView] = useState("full");
  const active = useMemo(
    () => modules.find((module) => module.id === activeModule) || modules[0],
    [activeModule]
  );
  const ActiveIcon = active.icon;

  function openModule(moduleId) {
    if (moduleId === "structured-recess") setStructuredRecessView("full");
    setActiveModule(moduleId);
  }

  function openStructuredRecessAideView() {
    setStructuredRecessView("aide");
    setActiveModule("structured-recess");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="no-print border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <img src="/wvcs-logo.png" alt="WVCS" className="h-12 w-12 rounded-lg object-contain" />
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">WVCS</div>
              <h1 className="text-2xl font-bold text-white">WVCS School Hub</h1>
            </div>
          </div>

          <nav className="flex flex-wrap gap-2">
            {modules.map((module) => {
              const Icon = module.icon;
              const selected = module.id === activeModule;
              return (
                <button
                  key={module.id}
                  type="button"
                  onClick={() => openModule(module.id)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                    selected
                      ? "border-sky-400 bg-sky-500 text-white"
                      : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Icon size={16} />
                  {module.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-5 pb-4 text-sm text-slate-400">
          <ActiveIcon size={16} className="text-sky-300" />
          <span>{active.description}</span>
        </div>
      </header>

      {activeModule === "dashboard" && (
        <DashboardModule onSelectModule={openModule} onOpenAideView={openStructuredRecessAideView} />
      )}

      {activeModule === "scheduler" && <SchedulerModule />}

      {activeModule === "meetings" && (
        <MeetingsModule />
      )}

      {activeModule === "structured-recess" && (
        <StructuredRecessModule key={structuredRecessView} initialView={structuredRecessView} />
      )}

      {activeModule === "forms" && (
        <StaffFormsModule />
      )}

      {activeModule === "documents" && (
        <ImportantDocumentsModule />
      )}

      {activeModule === "admin" && (
        <AdminModule />
      )}
    </div>
  );
}
