import { useMemo, useState } from "react";
import {
  CalendarClock,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";
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
  },
  {
    id: "meetings",
    label: "Meeting Requests",
    icon: Users,
    description: "Request meetings with administrators and track responses.",
  },
  {
    id: "forms",
    label: "Forms",
    icon: FileText,
    description: "Complete school forms and route them to the right people.",
  },
  {
    id: "admin",
    label: "Admin",
    icon: Settings,
    description: "Manage school hub settings and future integrations.",
  },
];

function PlaceholderModule({ title, description, items }) {
  return (
    <section className="min-h-[560px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">{description}</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {items.map((item) => (
            <div key={item.title} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-sm font-semibold text-white">{item.title}</div>
              <p className="mt-2 text-sm text-slate-400">{item.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [activeModule, setActiveModule] = useState("dashboard");
  const active = useMemo(
    () => modules.find((module) => module.id === activeModule) || modules[0],
    [activeModule]
  );
  const ActiveIcon = active.icon;

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
                  onClick={() => setActiveModule(module.id)}
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
        <PlaceholderModule
          title="School Operations Dashboard"
          description="This hub is ready to grow into a shared place for scheduling, administrator meetings, forms, approvals, and future WVCS tools."
          items={[
            {
              title: "Scheduler",
              body: "The existing master scheduler is already available as the first full module.",
            },
            {
              title: "Meeting Requests",
              body: "Next step: add request forms, administrator availability, and notification routing.",
            },
            {
              title: "Forms",
              body: "Next step: add PDF form templates, fillable fields, approvals, and email delivery.",
            },
          ]}
        />
      )}

      {activeModule === "scheduler" && <SchedulerModule />}

      {activeModule === "meetings" && (
        <PlaceholderModule
          title="Meeting Requests"
          description="A future workspace for faculty and staff to request meetings with administrators."
          items={[
            { title: "Request Form", body: "Collect requester, topic, urgency, and preferred time windows." },
            { title: "Admin Routing", body: "Route requests to the correct administrator or office team." },
            { title: "Notifications", body: "Send email confirmations when requests are submitted or approved." },
          ]}
        />
      )}

      {activeModule === "forms" && (
        <PlaceholderModule
          title="Forms"
          description="A future workspace for completing PDF forms and sending them to the right recipients."
          items={[
            { title: "PDF Library", body: "Store common WVCS forms and organize them by department." },
            { title: "Fill and Review", body: "Complete forms in-app before generating a final PDF." },
            { title: "Email Routing", body: "Send completed forms through a secure backend email service." },
          ]}
        />
      )}

      {activeModule === "admin" && (
        <PlaceholderModule
          title="Admin"
          description="A future settings area for shared app configuration, permissions, and integrations."
          items={[
            { title: "School Settings", body: "Manage school name, branding, terms, and default recipients." },
            { title: "User Roles", body: "Prepare for role-based access when authentication is added." },
            { title: "Integrations", body: "Connect email, calendar, storage, and other school systems." },
          ]}
        />
      )}
    </div>
  );
}
