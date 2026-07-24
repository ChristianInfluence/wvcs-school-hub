import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Calculator,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Files,
  FileText,
  FileSignature,
  GraduationCap,
  LayoutDashboard,
  Lightbulb,
  Lock,
  LogOut,
  NotebookPen,
  ReceiptText,
  Search,
  ShieldAlert,
  Settings,
  Sparkles,
  X,
  UserCircle,
  Users,
} from "lucide-react";
import ImportantDocumentsModule, { AdminDocumentsModule } from "./modules/documents/ImportantDocumentsModule.jsx";
import StaffFormsModule, { AdminFormsModule, FormApprovalActionPage, PublicFormsDirectoryPage, PublicSharedFormPage } from "./modules/forms/FormsModule.jsx";
import AdminSettingsModule from "./modules/admin/InfrastructureModule.jsx";
import StudentDirectoryModule from "./modules/admin/StudentDirectoryModule.jsx";
import SubstituteCalendarModule from "./modules/admin/SubstituteCalendarModule.jsx";
import LookOfWeekModule, { AdminLookOfWeekModule } from "./modules/lookOfWeek/LookOfWeekModule.jsx";
import MeetingsModule, { AdminMeetingsModule } from "./modules/meetings/MeetingsModule.jsx";
import HubMessages from "./modules/messages/HubMessages.jsx";
import FamilyPortalPage from "./modules/familyPortal/FamilyPortalPage.jsx";
import FosAdminModule from "./modules/familyPortal/FosAdminModule.jsx";
import PermissionSlipsModule, { ParentPermissionSigningPage } from "./modules/permissions/PermissionSlipsModule.jsx";
import StructuredRecessModule from "./modules/recess/StructuredRecessModule.jsx";
import SuggestionsModule, { AdminSuggestionsModule } from "./modules/suggestions/SuggestionsModule.jsx";
import SchedulerModule from "./modules/scheduler/SchedulerModule.jsx";
import StudentEvaluationModule from "./modules/studentEvaluation/StudentEvaluationModule.jsx";
import TuitionBillingModule, { IncidentalPaymentPortalPage } from "./modules/tuition/TuitionBillingModule.jsx";
import { fetchFormSubmissions } from "./lib/formsData.js";
import { fetchHubMessageThreads } from "./lib/hubMessagesData.js";
import { isSupabaseConfigured, supabase } from "./lib/supabaseClient.js";
import warriorHeadNew from "./assets/warrior-head-new.png";

const WVCS_DOMAIN = "wvcs.org";
const defaultAccess = {
  canUseHub: true,
  canUseAdmin: false,
  canUseScheduler: false,
  canUseDigitalSlips: false,
  canUseOfficePayroll: false,
  canManageUsers: false,
};

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
    id: "permission-slips",
    label: "Digital Slips",
    icon: FileSignature,
    description: "Create field trip permission slips and collect parent electronic signatures.",
    color: "blue",
    callout: "Parent signatures",
    topLevelOnly: true,
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
    id: "student-evaluation",
    label: "Student Evaluation",
    icon: ClipboardCheck,
    description: "Evaluate new students during the 6 week probation window.",
    color: "cyan",
    callout: "Probation reviews",
  },
  {
    id: "suggestions",
    label: "Suggestions",
    icon: Lightbulb,
    description: "A staff suggestion box for ideas, process improvements, and school needs.",
    color: "lime",
    callout: "Staff voice",
  },
  {
    id: "office-finance",
    label: "Office & Finance",
    icon: ReceiptText,
    description: "Manage tuition breakdowns, incidental invoices, accounts receivable, family ledgers, and substitutes.",
    color: "sky",
    callout: "Billing and AR",
    topLevelOnly: true,
  },
  {
    id: "meeting-notes",
    label: "Meeting Notes",
    icon: NotebookPen,
    description: "Shared notes, action items, and follow-up records from school meetings.",
    color: "indigo",
    callout: "Coming soon",
    comingSoon: true,
  },
  {
    id: "look-of-the-week",
    label: "Look of the Week",
    icon: Sparkles,
    description: "A weekly glance at upcoming events, reminders, and items staff should know.",
    color: "orange",
    callout: "Weekly brief",
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

const moduleIds = new Set(modules.map((module) => module.id));
const moduleHashPaths = Object.fromEntries(modules.map((module) => [module.id, `#/${module.id}`]));

function getRouteFromHash(hash = window.location.hash) {
  const incidentalPaymentMatch = hash.match(/^#\/incidental-pay\/(.+)$/);
  if (incidentalPaymentMatch) {
    return {
      incidentalPaymentToken: decodeURIComponent(incidentalPaymentMatch[1]),
      parentSigningToken: "",
      formApprovalToken: "",
      formShareToken: "",
      publicFormsDirectory: false,
      familyPortalToken: "",
      moduleId: "dashboard",
      structuredRecessView: "full",
    };
  }

  const permissionMatch = hash.match(/^#\/permission-sign\/(.+)$/);
  if (permissionMatch) {
    return {
      incidentalPaymentToken: "",
      parentSigningToken: decodeURIComponent(permissionMatch[1]),
      formApprovalToken: "",
      formShareToken: "",
      publicFormsDirectory: false,
      familyPortalToken: "",
      moduleId: "dashboard",
      structuredRecessView: "full",
    };
  }

  const formApprovalMatch = hash.match(/^#\/form-approval\/(.+)$/);
  if (formApprovalMatch) {
    return {
      incidentalPaymentToken: "",
      parentSigningToken: "",
      formApprovalToken: decodeURIComponent(formApprovalMatch[1]),
      formShareToken: "",
      publicFormsDirectory: false,
      familyPortalToken: "",
      moduleId: "dashboard",
      structuredRecessView: "full",
    };
  }

  const formShareMatch = hash.match(/^#\/form-share\/(.+)$/);
  if (formShareMatch) {
    return {
      incidentalPaymentToken: "",
      parentSigningToken: "",
      formApprovalToken: "",
      formShareToken: decodeURIComponent(formShareMatch[1]),
      publicFormsDirectory: false,
      familyPortalToken: "",
      moduleId: "dashboard",
      structuredRecessView: "full",
    };
  }

  if (hash === "#/structured-recess/aide") {
    return {
      incidentalPaymentToken: "",
      parentSigningToken: "",
      formApprovalToken: "",
      formShareToken: "",
      publicFormsDirectory: false,
      familyPortalToken: "",
      moduleId: "structured-recess",
      structuredRecessView: "aide",
    };
  }

  if (hash === "#/public-forms") {
    return {
      incidentalPaymentToken: "",
      parentSigningToken: "",
      formApprovalToken: "",
      formShareToken: "",
      publicFormsDirectory: true,
      familyPortalToken: "",
      moduleId: "dashboard",
      structuredRecessView: "full",
    };
  }

  const familyPortalMatch = hash.match(/^#\/family-portal\/(.+)$/);
  if (familyPortalMatch) {
    return {
      incidentalPaymentToken: "",
      parentSigningToken: "",
      formApprovalToken: "",
      formShareToken: "",
      publicFormsDirectory: false,
      familyPortalToken: decodeURIComponent(familyPortalMatch[1]),
      moduleId: "dashboard",
      structuredRecessView: "full",
    };
  }

  const moduleMatch = hash.match(/^#\/([^/?#]+)$/);
  const moduleId = moduleMatch?.[1];
  return {
    incidentalPaymentToken: "",
    parentSigningToken: "",
    formApprovalToken: "",
    formShareToken: "",
    publicFormsDirectory: false,
    familyPortalToken: "",
    moduleId: moduleIds.has(moduleId) ? moduleId : "dashboard",
    structuredRecessView: moduleId === "structured-recess" ? "full" : "full",
  };
}

function setModuleHash(moduleId, structuredRecessView = "full") {
  const nextHash = moduleId === "structured-recess" && structuredRecessView === "aide"
    ? "#/structured-recess/aide"
    : moduleHashPaths[moduleId] || "#/dashboard";
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}

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
  cyan: {
    card: "border-cyan-400/40 bg-cyan-500/10 hover:border-cyan-300",
    icon: "border-cyan-300/40 bg-cyan-400/20 text-cyan-100",
    bar: "bg-cyan-400",
    text: "text-cyan-200",
  },
  lime: {
    card: "border-lime-400/35 bg-lime-500/10 hover:border-lime-300",
    icon: "border-lime-300/40 bg-lime-400/20 text-lime-100",
    bar: "bg-lime-400",
    text: "text-lime-200",
  },
  indigo: {
    card: "border-indigo-400/40 bg-indigo-500/10 hover:border-indigo-300",
    icon: "border-indigo-300/40 bg-indigo-400/20 text-indigo-100",
    bar: "bg-indigo-400",
    text: "text-indigo-200",
  },
  orange: {
    card: "border-orange-400/40 bg-orange-500/10 hover:border-orange-300",
    icon: "border-orange-300/40 bg-orange-400/20 text-orange-100",
    bar: "bg-orange-400",
    text: "text-orange-200",
  },
  blue: {
    card: "border-blue-400/40 bg-blue-500/10 hover:border-blue-300",
    icon: "border-blue-300/40 bg-blue-400/20 text-blue-100",
    bar: "bg-blue-400",
    text: "text-blue-200",
  },
};

function formatActivityDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function DashboardModule({ access, currentUserEmail = "", onSelectModule, onOpenAideView }) {
  const launchModules = modules.filter((module) => module.id !== "dashboard" && !module.topLevelOnly);
  const featured = launchModules.find((module) => module.id === "structured-recess");
  const [activity, setActivity] = useState({ loading: true, submissions: [], messages: [], error: "" });

  function isLocked(module) {
    if (module.id === "admin") return !access.canUseAdmin;
    if (module.id === "scheduler") return !access.canUseScheduler;
    if (module.id === "permission-slips") return !access.canUseAdmin && !access.canUseDigitalSlips;
    if (module.id === "office-finance") return !access.canUseOfficePayroll;
    return false;
  }

  useEffect(() => {
    let active = true;
    async function loadActivity() {
      try {
        const [formsResult, messagesResult] = await Promise.all([
          fetchFormSubmissions(),
          currentUserEmail ? fetchHubMessageThreads(currentUserEmail) : Promise.resolve({ loaded: true, threads: [] }),
        ]);
        if (!active) return;
        setActivity({
          loading: false,
          submissions: formsResult.loaded ? formsResult.submissions.slice(0, 5) : [],
          messages: messagesResult.loaded ? messagesResult.threads.slice(0, 5) : [],
          error: formsResult.reason || messagesResult.reason || "",
        });
      } catch (error) {
        if (active) setActivity({ loading: false, submissions: [], messages: [], error: error.message });
      }
    }
    loadActivity();
    return () => {
      active = false;
    };
  }, [currentUserEmail]);

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
            const locked = isLocked(module);
            return (
              <button
                key={module.id}
                type="button"
                disabled={module.comingSoon || locked}
                onClick={() => onSelectModule(module.id)}
                className={`group relative flex min-h-64 flex-col overflow-hidden rounded-lg border p-4 text-left transition ${
                  module.comingSoon || locked
                    ? `${styles.card} cursor-default opacity-85`
                    : `${styles.card} hover:-translate-y-1 hover:shadow-2xl`
                }`}
              >
                <div className={`absolute left-0 top-0 h-1.5 w-full ${styles.bar}`} />
                <div className="relative h-14">
                  <div className={`absolute left-0 top-0 flex h-12 w-12 items-center justify-center rounded-lg border ${styles.icon}`}>
                    {locked ? <Lock size={24} /> : <Icon size={24} />}
                  </div>
                  <div className="absolute right-0 top-0 text-4xl font-black leading-none text-white/5 transition group-hover:text-white/10">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                </div>
                <div className="flex flex-1 flex-col">
                  <div className={`mt-4 min-h-4 text-xs font-semibold uppercase tracking-[0.16em] ${styles.text}`}>
                    {module.callout}
                  </div>
                  <h2 className="mt-2 min-h-14 text-xl font-bold leading-7 text-white">{module.label}</h2>
                  <p className="text-sm leading-6 text-slate-300">{module.description}</p>
                  <div className="mt-auto pt-5">
                    {locked && (
                      <div className="inline-flex items-center gap-2 rounded-full border border-slate-600 bg-slate-950 px-2.5 py-1 text-xs font-semibold text-slate-300">
                        <Lock size={12} />
                        Access restricted
                      </div>
                    )}
                    {module.comingSoon && (
                      <div className="inline-flex rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-200">
                        Planned feature
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">Recently Used</div>
                <div className="mt-1 text-xs text-slate-500">Latest form activity and Hub conversations.</div>
              </div>
              <button
                type="button"
                onClick={() => onSelectModule("forms")}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                Forms
              </button>
            </div>
            <div className="mt-4 grid gap-2">
              {activity.loading && <div className="text-sm text-slate-400">Loading recent activity...</div>}
              {!activity.loading && activity.error && <div className="text-sm text-amber-200">{activity.error}</div>}
              {!activity.loading && !activity.error && !activity.submissions.length && (
                <div className="text-sm text-slate-400">No recent form activity yet.</div>
              )}
              {activity.submissions.map((submission) => (
                <button
                  key={submission.id}
                  type="button"
                  onClick={() => onSelectModule(access.canUseAdmin ? "admin" : "forms")}
                  className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-left hover:border-slate-600"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{submission.templateTitle}</div>
                      <div className="mt-1 truncate text-xs text-slate-400">
                        {submission.submitterName} · {formatActivityDate(submission.submittedAt)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-700 px-2 py-1 text-[11px] font-semibold text-slate-300">
                      {submission.status}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="text-sm font-semibold text-white">Recent Messages</div>
            <div className="mt-1 text-xs text-slate-500">Unread and recent conversations stay close at hand.</div>
            <div className="mt-4 grid gap-2">
              {activity.loading && <div className="text-sm text-slate-400">Loading messages...</div>}
              {!activity.loading && !activity.messages.length && (
                <div className="text-sm text-slate-400">No recent Hub messages yet.</div>
              )}
              {activity.messages.map((thread) => (
                <div key={thread.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{thread.subject}</div>
                      <div className="mt-1 truncate text-xs text-slate-400">
                        {thread.latestPost?.senderName || thread.latestPost?.senderEmail || "Message"} · {formatActivityDate(thread.latestPostAt)}
                      </div>
                    </div>
                    {thread.unread && (
                      <span className="shrink-0 rounded-full border border-sky-400 bg-sky-500/15 px-2 py-1 text-[11px] font-semibold text-sky-100">
                        New
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FormNotificationBadge({ access, onOpenAdmin }) {
  const [notice, setNotice] = useState({ loading: true, pending: 0, publicCount: 0, error: "" });

  useEffect(() => {
    if (!access.canUseAdmin) return undefined;
    let active = true;
    async function loadNotice() {
      try {
        const result = await fetchFormSubmissions();
        if (!active) return;
        if (!result.loaded) {
          setNotice({ loading: false, pending: 0, publicCount: 0, error: result.reason || "" });
          return;
        }
        const pending = result.submissions.filter((submission) => submission.status === "Submitted");
        setNotice({
          loading: false,
          pending: pending.length,
          publicCount: pending.filter((submission) => submission.source === "public-share-link").length,
          error: "",
        });
      } catch (error) {
        if (active) setNotice({ loading: false, pending: 0, publicCount: 0, error: error.message });
      }
    }
    loadNotice();
    const interval = window.setInterval(loadNotice, 45000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [access.canUseAdmin]);

  if (!access.canUseAdmin) return null;

  return (
    <button
      type="button"
      onClick={onOpenAdmin}
      className={`relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
        notice.pending
          ? "border-amber-400 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
          : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
      }`}
      title={notice.error || "Form notifications"}
    >
      <Bell size={16} />
      Forms
      {notice.pending > 0 && (
        <span className="rounded-full bg-amber-300 px-1.5 py-0.5 text-[11px] font-black text-slate-950">
          {notice.pending}
        </span>
      )}
      {notice.publicCount > 0 && <span className="sr-only">{notice.publicCount} public submissions pending</span>}
      {notice.loading && <span className="sr-only">Loading</span>}
    </button>
  );
}

function GlobalSearch({ access, currentUserEmail = "", onSelectModule, onOpenOfficeFinance }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [data, setData] = useState({ loading: false, submissions: [], messages: [], error: "" });
  const needle = query.trim().toLowerCase();

  useEffect(() => {
    if (!open) return undefined;
    let active = true;
    async function loadSearchData() {
      setData((current) => ({ ...current, loading: true, error: "" }));
      try {
        const [formsResult, messagesResult] = await Promise.all([
          fetchFormSubmissions(),
          currentUserEmail ? fetchHubMessageThreads(currentUserEmail) : Promise.resolve({ loaded: true, threads: [] }),
        ]);
        if (!active) return;
        setData({
          loading: false,
          submissions: formsResult.loaded ? formsResult.submissions : [],
          messages: messagesResult.loaded ? messagesResult.threads : [],
          error: formsResult.reason || messagesResult.reason || "",
        });
      } catch (error) {
        if (active) setData({ loading: false, submissions: [], messages: [], error: error.message });
      }
    }
    loadSearchData();
    return () => {
      active = false;
    };
  }, [open, currentUserEmail]);

  const results = useMemo(() => {
    if (!needle) return [];
    const moduleResults = modules
      .filter((module) => {
        if (module.id === "admin" && !access.canUseAdmin) return false;
        if (module.id === "scheduler" && !access.canUseScheduler) return false;
        if (module.id === "permission-slips" && !access.canUseAdmin && !access.canUseDigitalSlips) return false;
        if (module.id === "office-finance" && !access.canUseOfficePayroll) return false;
        return `${module.label} ${module.description} ${module.callout || ""}`.toLowerCase().includes(needle);
      })
      .map((module) => ({
        id: `module-${module.id}`,
        type: "Hub Area",
        title: module.label,
        detail: module.description,
        action: () => onSelectModule(module.id),
      }));

    const officeFinanceResults = access.canUseOfficePayroll
      ? [
          {
            id: "office-finance-billing",
            type: "Office & Finance",
            title: "Office & Finance",
            detail: "Tuition breakdowns, incidentals, accounts receivable, family ledger, and substitutes.",
            terms: "office finance billing tuition incidentals incidental accounts receivable family ledger substitutes payroll invoices payments",
            target: { officeView: "tuition" },
          },
          {
            id: "office-finance-incidentals",
            type: "Office & Finance",
            title: "Incidentals",
            detail: "Create and send incidental invoices.",
            terms: "incidentals incidental invoice invoices charges fees payments office finance",
            target: { officeView: "incidentals", activeView: "incidentals", incidentalWorkspaceView: "invoice" },
          },
          {
            id: "office-finance-receivables",
            type: "Office & Finance",
            title: "Accounts Receivable",
            detail: "View incidental invoice balances, payments, fees, and receipt records.",
            terms: "accounts receivable ar records balances paid unpaid partial fees net receipts incidentals",
            target: { officeView: "receivables", activeView: "incidentals", incidentalWorkspaceView: "receivables" },
          },
          {
            id: "office-finance-ledger",
            type: "Office & Finance",
            title: "Family Ledger",
            detail: "Look up family incidental invoice and payment history.",
            terms: "family ledger account history family records incidentals invoices payments office finance",
            target: { officeView: "ledger", activeView: "incidentals", incidentalWorkspaceView: "ledger" },
          },
          {
            id: "office-finance-substitutes",
            type: "Office & Finance",
            title: "Substitutes",
            detail: "Office & Finance substitute calendar.",
            terms: "substitutes substitute calendar office finance payroll",
            target: { officeView: "substitutes" },
          },
          {
            id: "office-finance-fos",
            type: "Office & Finance",
            title: "FOS Volunteer Hours",
            detail: "Manage family portal links, Friends of School hour submissions, approvals, and balances.",
            terms: "fos friends of school volunteer hours family portal balance approve deny adjust",
            target: { officeView: "fos" },
          },
        ]
          .filter((item) => `${item.title} ${item.detail} ${item.terms}`.toLowerCase().includes(needle))
          .map((item) => ({
            ...item,
            action: () => onOpenOfficeFinance(item.target),
          }))
      : [];

    const formResults = data.submissions
      .filter((submission) =>
        `${submission.templateTitle} ${submission.submitterName} ${submission.submitterEmail} ${submission.status}`.toLowerCase().includes(needle)
      )
      .slice(0, 6)
      .map((submission) => ({
        id: `form-${submission.id}`,
        type: "Form",
        title: submission.templateTitle,
        detail: `${submission.submitterName} · ${submission.status} · ${formatActivityDate(submission.submittedAt)}`,
        action: () => onSelectModule(access.canUseAdmin ? "admin" : "forms"),
      }));

    const messageResults = data.messages
      .filter((thread) => {
        const posts = (thread.posts || []).map((post) => `${post.senderName} ${post.senderEmail} ${post.body}`).join(" ");
        const people = (thread.participants || []).map((participant) => participant.email).join(" ");
        return `${thread.subject} ${people} ${posts}`.toLowerCase().includes(needle);
      })
      .slice(0, 6)
      .map((thread) => ({
        id: `message-${thread.id}`,
        type: "Message",
        title: thread.subject,
        detail: `${thread.latestPost?.senderName || thread.latestPost?.senderEmail || "Message"} · ${formatActivityDate(thread.latestPostAt)}`,
        action: () => window.dispatchEvent(new CustomEvent("wvcs-open-message", { detail: { threadId: thread.id } })),
      }));

    return [...moduleResults, ...officeFinanceResults, ...formResults, ...messageResults].slice(0, 12);
  }, [access, data.messages, data.submissions, needle, onOpenOfficeFinance, onSelectModule]);

  function runAction(result) {
    result.action();
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
      >
        <Search size={16} />
        Search
      </button>
      {open && (
        <div className="fixed inset-x-4 top-20 z-50 rounded-lg border border-slate-700 bg-slate-950 shadow-2xl shadow-slate-950/60 md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:w-[420px]">
          <div className="flex items-center gap-2 border-b border-slate-800 p-3">
            <Search size={16} className="text-sky-300" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
              placeholder="Search Hub areas, forms, messages"
            />
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-300 hover:bg-slate-800"
              title="Close search"
            >
              <X size={14} />
            </button>
          </div>
          <div className="max-h-[420px] overflow-auto p-2">
            {data.loading && <div className="p-3 text-sm text-slate-400">Loading search...</div>}
            {!data.loading && data.error && <div className="p-3 text-sm text-amber-200">{data.error}</div>}
            {!needle && <div className="p-3 text-sm text-slate-400">Type to search across the Hub.</div>}
            {needle && !results.length && !data.loading && (
              <div className="p-3 text-sm text-slate-400">No matching Hub results.</div>
            )}
            {results.map((result) => (
              <button
                key={result.id}
                type="button"
                onClick={() => runAction(result)}
                className="mb-2 w-full rounded-lg border border-slate-800 bg-slate-900 p-3 text-left transition last:mb-0 hover:border-slate-600"
              >
                <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-300">{result.type}</div>
                <div className="mt-1 truncate text-sm font-semibold text-white">{result.title}</div>
                <div className="mt-1 truncate text-xs text-slate-400">{result.detail}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function getRoleLabels(access) {
  const roles = [];
  if (access.canUseAdmin) roles.push("Administrator");
  if (access.canUseScheduler) roles.push("Scheduler");
  if (access.canUseDigitalSlips) roles.push("Digital Slips");
  if (access.canUseOfficePayroll) roles.push("Office & Finance");
  if (access.canManageUsers) roles.push("Superuser");
  if (access.canUseHub) roles.push("Hub User");
  return roles.length ? roles : ["No active role"];
}

function UserProfileMenu({ user, access, signOut }) {
  const [open, setOpen] = useState(false);
  const displayName = user.user_metadata?.full_name || user.email;
  const roles = getRoleLabels(access);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
      >
        <UserCircle size={16} className="text-sky-300" />
        <span className="max-w-[180px] truncate">{user.email}</span>
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-slate-800 bg-slate-950 p-3 text-left shadow-2xl shadow-black/40">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">User Profile</div>
          <div className="mt-2 text-sm font-bold text-white">{displayName}</div>
          <div className="mt-1 break-all text-xs text-slate-500">{user.email}</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {roles.map((role) => (
              <span key={role} className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200">
                {role}
              </span>
            ))}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            <LogOut size={16} />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

function OfficePayrollWorkspace({ currentUserEmail = "", officeFinanceTarget = null }) {
  const [officeView, setOfficeView] = useState("tuition");

  useEffect(() => {
    if (officeFinanceTarget?.officeView) setOfficeView(officeFinanceTarget.officeView);
    else setOfficeView("tuition");
  }, [officeFinanceTarget]);

  return (
    <section>
      <div className="mx-auto max-w-[1500px] px-5 pt-4">
        <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
          {[
            ["tuition", "Tuition Breakdowns", ReceiptText],
            ["incidentals", "Incidentals", Calculator],
            ["receivables", "Accounts Receivable", Calculator],
            ["ledger", "Family Ledger", ReceiptText],
            ["fos", "FOS", Users],
            ["substitutes", "Substitutes", CalendarDays],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setOfficeView(id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                officeView === id
                  ? "border-sky-400 bg-sky-500 text-white"
                  : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>
      {officeView !== "substitutes" && officeView !== "fos" && (
        <TuitionBillingModule
          currentUserEmail={currentUserEmail}
          officeFinanceTarget={{
            ...(officeFinanceTarget || {}),
            activeView: officeView === "tuition" ? "tuition" : "incidentals",
            incidentalWorkspaceView:
              officeView === "incidentals"
                ? "invoice"
                : officeView === "receivables" || officeView === "ledger"
                ? officeView
                : officeFinanceTarget?.incidentalWorkspaceView,
          }}
          hideOfficeFinanceNavigation
        />
      )}
      {officeView === "fos" && <FosAdminModule currentUserEmail={currentUserEmail} />}
      {officeView === "substitutes" && <SubstituteCalendarModule />}
    </section>
  );
}

function AdminModule({ currentUserEmail = "", access = defaultAccess }) {
  const [adminView, setAdminView] = useState("module-admin");
  const [moduleAdminView, setModuleAdminView] = useState("forms");
  const moduleAdminOptions = [
    ["forms", "Forms Admin", FileText],
    ["meetings", "Meetings Admin", Users],
    ["documents", "Documents Admin", Files],
    ["suggestions", "Suggestions", Lightbulb],
    ["look-of-the-week", "Look of the Week", Sparkles],
  ];

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto flex max-w-[1500px] flex-wrap gap-2 px-5 pt-6">
        {[
          ["settings", "Settings", Settings],
          ["student-directory", "Student Directory", GraduationCap],
          ["module-admin", "Module Admin", LayoutDashboard],
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
      {adminView === "student-directory" && <StudentDirectoryModule />}
      {adminView === "settings" && <AdminSettingsModule currentUserEmail={currentUserEmail} canManageUsers={access.canManageUsers} />}
      {adminView === "module-admin" && (
        <>
          <div className="mx-auto max-w-[1500px] px-5 pt-4">
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
              {moduleAdminOptions.map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setModuleAdminView(id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    moduleAdminView === id
                      ? "border-emerald-400 bg-emerald-500 text-white"
                      : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>
          {moduleAdminView === "meetings" && <AdminMeetingsModule />}
          {moduleAdminView === "forms" && <AdminFormsModule currentUserEmail={currentUserEmail} />}
          {moduleAdminView === "documents" && <AdminDocumentsModule />}
          {moduleAdminView === "suggestions" && <AdminSuggestionsModule />}
          {moduleAdminView === "look-of-the-week" && <AdminLookOfWeekModule />}
        </>
      )}
    </section>
  );
}

function AuthGate({ children }) {
  const [authState, setAuthState] = useState(() =>
    isSupabaseConfigured
      ? {
          loading: true,
          user: null,
          access: defaultAccess,
          error: "",
        }
      : {
          loading: false,
          user: null,
          access: defaultAccess,
          error: "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable sign-in.",
        }
  );

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return undefined;
    }

    let active = true;

    async function handleSession(session) {
      const user = session?.user || null;
      const email = user?.email || "";
      const domain = email.split("@")[1]?.toLowerCase();

      if (!user) {
        if (active) {
          setAuthState({ loading: false, user: null, access: defaultAccess, error: "" });
        }
        return;
      }

      if (user && domain !== WVCS_DOMAIN) {
        await supabase.auth.signOut();
        if (active) {
          setAuthState({
            loading: false,
            user: null,
            access: defaultAccess,
            error: "Please sign in with your WVCS Google account.",
          });
        }
        return;
      }

      const { data, error } = await supabase
        .from("staff_access")
        .select("*")
        .eq("email", email.toLowerCase())
        .maybeSingle();

      if (error) {
        if (active) {
          setAuthState({
            loading: false,
            user,
            access: defaultAccess,
            error: `Signed in, but access lookup failed: ${error.message}`,
          });
        }
        return;
      }

      const access = {
        canUseHub: data?.can_use_hub ?? false,
        canUseAdmin: data?.can_use_admin ?? false,
        canUseScheduler: data?.can_use_scheduler ?? false,
        canUseDigitalSlips: data?.can_use_digital_slips ?? false,
        canUseOfficePayroll: data?.can_use_office_payroll ?? data?.can_use_admin ?? false,
        canManageUsers: email.toLowerCase() === "mconniry@wvcs.org" || Boolean(data?.can_manage_users),
      };

      if (!access.canUseHub) {
        await supabase.auth.signOut();
        if (active) {
          setAuthState({
            loading: false,
            user: null,
            access: defaultAccess,
            error: "Your WVCS account is not enabled for School Hub access.",
          });
        }
        return;
      }

      if (active) {
        setAuthState({ loading: false, user, access, error: "" });
      }
    }

    supabase.auth.getSession().then(({ data }) => handleSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      handleSession(session);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function signInWithGoogle() {
    setAuthState((current) => ({ ...current, error: "" }));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: {
          hd: WVCS_DOMAIN,
        },
      },
    });
    if (error) {
      setAuthState((current) => ({ ...current, error: error.message }));
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (authState.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-slate-100">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          Checking WVCS sign-in...
        </div>
      </div>
    );
  }

  if (!authState.user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-slate-100">
        <div className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl">
          <div className="flex items-center gap-3">
            <img src={warriorHeadNew} alt="WVCS Warrior" className="h-12 w-12 rounded-lg object-contain" />
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Willamette Valley Christian School</div>
              <h1 className="text-2xl font-bold text-white">School Hub Sign In</h1>
            </div>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-400">
            Sign in with your WVCS Google account to access the dashboard.
          </p>
          {authState.error && (
            <div className="mt-4 rounded-lg border border-rose-400/40 bg-rose-500/10 p-3 text-sm text-rose-100">
              {authState.error}
            </div>
          )}
          <button
            type="button"
            onClick={signInWithGoogle}
            disabled={!isSupabaseConfigured}
            className="mt-5 w-full rounded-lg border border-sky-400 bg-sky-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Sign in with Google
          </button>
          <div className="mt-3 text-xs text-slate-500">Only @{WVCS_DOMAIN} accounts are allowed.</div>

          <div className="mt-6 border-t border-slate-800 pt-5 text-sm leading-6 text-slate-400">
            <p className="text-center">
              WVCS School Hub is an official service of Willamette Valley Christian School. Main school website:{" "}
              <a
                href="https://wvcs.org"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-sky-300 underline-offset-4 hover:underline"
              >
                wvcs.org
              </a>
              .
            </p>

            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/80 p-4 text-center">
              <div className="font-bold text-slate-100">Willamette Valley Christian School</div>
              <div className="mt-1 text-sm text-slate-400">9075 Pueblo Ave. NE, Brooks, OR 97305</div>
              <div className="mt-1">
                <a href="tel:15033935236" className="font-semibold text-sky-300 underline-offset-4 hover:underline">
                  503-393-5236
                </a>
              </div>
            </div>

            <nav className="mt-4 grid grid-cols-2 gap-2 text-center text-xs font-semibold sm:grid-cols-5">
              <a
                href="https://wvcs.org"
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 flex-col items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-2 py-2 text-sky-300 transition hover:border-sky-500/50 hover:bg-slate-800"
              >
                <span>School</span>
                <span>Site</span>
              </a>
              <a
                href="#/public-forms"
                className="flex min-h-12 flex-col items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-2 py-2 text-sky-300 transition hover:border-sky-500/50 hover:bg-slate-800"
              >
                <span>Public</span>
                <span>Forms</span>
              </a>
              <a
                href="https://www.wvcs.org/privacy"
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 flex-col items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-2 py-2 text-sky-300 transition hover:border-sky-500/50 hover:bg-slate-800"
              >
                <span>Privacy</span>
                <span>Policy</span>
              </a>
              <a
                href="https://www.wvcs.org/terms"
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 flex-col items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-2 py-2 text-sky-300 transition hover:border-sky-500/50 hover:bg-slate-800"
              >
                <span>SMS</span>
                <span>Terms</span>
              </a>
              <a
                href="https://www.wvcs.org/text-messaging"
                target="_blank"
                rel="noreferrer"
                className="col-span-2 flex min-h-12 flex-col items-center justify-center rounded-md border border-slate-800 bg-slate-950/70 px-2 py-2 text-sky-300 transition hover:border-sky-500/50 hover:bg-slate-800 sm:col-span-1"
              >
                <span>Text</span>
                <span>Enrollment</span>
              </a>
            </nav>
          </div>
        </div>
      </div>
    );
  }

  return children({ user: authState.user, access: authState.access, signOut });
}

export default function App() {
  const initialRoute = getRouteFromHash();
  const [activeModule, setActiveModule] = useState(initialRoute.moduleId);
  const [structuredRecessView, setStructuredRecessView] = useState(initialRoute.structuredRecessView);
  const [incidentalPaymentToken, setIncidentalPaymentToken] = useState(initialRoute.incidentalPaymentToken);
  const [parentSigningToken, setParentSigningToken] = useState(initialRoute.parentSigningToken);
  const [formApprovalToken, setFormApprovalToken] = useState(initialRoute.formApprovalToken);
  const [formShareToken, setFormShareToken] = useState(initialRoute.formShareToken);
  const [publicFormsDirectory, setPublicFormsDirectory] = useState(initialRoute.publicFormsDirectory);
  const [familyPortalToken, setFamilyPortalToken] = useState(initialRoute.familyPortalToken);
  const [officeFinanceTarget, setOfficeFinanceTarget] = useState(null);
  const active = useMemo(
    () => modules.find((module) => module.id === activeModule) || modules[0],
    [activeModule]
  );
  const ActiveIcon = active.icon;

  useEffect(() => {
    function handleHashRoute() {
      const route = getRouteFromHash();
      setIncidentalPaymentToken(route.incidentalPaymentToken);
      setParentSigningToken(route.parentSigningToken);
      setFormApprovalToken(route.formApprovalToken);
      setFormShareToken(route.formShareToken);
      setPublicFormsDirectory(route.publicFormsDirectory);
      setFamilyPortalToken(route.familyPortalToken);
      setActiveModule(route.moduleId);
      setStructuredRecessView(route.structuredRecessView);
    }
    window.addEventListener("hashchange", handleHashRoute);
    if (!window.location.hash) setModuleHash("dashboard");
    else handleHashRoute();
    return () => window.removeEventListener("hashchange", handleHashRoute);
  }, []);

  function openModule(moduleId, options = {}) {
    setIncidentalPaymentToken("");
    setParentSigningToken("");
    setFormApprovalToken("");
    setFormShareToken("");
    setPublicFormsDirectory(false);
    setFamilyPortalToken("");
    if (!options.keepOfficeFinanceTarget) setOfficeFinanceTarget(null);
    setModuleHash(moduleId, "full");
  }

  function openOfficeFinanceTarget(target) {
    setOfficeFinanceTarget({ ...target, key: Date.now() });
    openModule("office-finance", { keepOfficeFinanceTarget: true });
  }

  function openStructuredRecessAideView() {
    setIncidentalPaymentToken("");
    setParentSigningToken("");
    setFormApprovalToken("");
    setFormShareToken("");
    setPublicFormsDirectory(false);
    setFamilyPortalToken("");
    setModuleHash("structured-recess", "aide");
  }

  if (incidentalPaymentToken) {
    return <IncidentalPaymentPortalPage token={incidentalPaymentToken} />;
  }

  if (parentSigningToken) {
    return <ParentPermissionSigningPage token={parentSigningToken} />;
  }

  if (formApprovalToken) {
    return <FormApprovalActionPage token={formApprovalToken} />;
  }

  if (formShareToken) {
    return <PublicSharedFormPage token={formShareToken} />;
  }

  if (publicFormsDirectory) {
    return <PublicFormsDirectoryPage />;
  }

  if (familyPortalToken) {
    return <FamilyPortalPage token={familyPortalToken} />;
  }

  return (
    <AuthGate>
      {({ user, access, signOut }) => (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="no-print border-b border-slate-800 bg-slate-950">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <img src={warriorHeadNew} alt="WVCS Warrior" className="h-12 w-12 rounded-lg object-contain" />
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Willamette Valley Christian School</div>
              <h1 className="text-2xl font-bold text-white">WVCS School Hub</h1>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-2">
            {modules
              .filter((module) =>
                module.id === "dashboard" ||
                (module.id === "permission-slips" && (access.canUseAdmin || access.canUseDigitalSlips)) ||
                (module.id === "office-finance" && access.canUseOfficePayroll) ||
                (module.id === "admin" && access.canUseAdmin)
              )
              .map((module) => {
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
            <div className="hidden h-8 w-px bg-slate-800 sm:block" />
            <GlobalSearch
              access={access}
              currentUserEmail={user.email}
              onSelectModule={openModule}
              onOpenOfficeFinance={openOfficeFinanceTarget}
            />
            <HubMessages
              currentUserEmail={user.email}
              currentUserName={user.user_metadata?.full_name || user.email}
            />
            <UserProfileMenu user={user} access={access} signOut={signOut} />
          </nav>
        </div>

        <div className="mx-auto flex max-w-[1600px] items-center gap-2 px-5 pb-4 text-sm text-slate-400">
          <ActiveIcon size={16} className="text-sky-300" />
          <span>{active.description}</span>
        </div>
      </header>

      {activeModule === "dashboard" && (
        <DashboardModule
          access={access}
          currentUserEmail={user.email}
          onSelectModule={openModule}
          onOpenAideView={openStructuredRecessAideView}
        />
      )}

      {activeModule === "scheduler" && access.canUseScheduler && <SchedulerModule currentUserEmail={user.email} />}

      {activeModule === "meetings" && (
        <MeetingsModule />
      )}

      {activeModule === "structured-recess" && (
        <StructuredRecessModule
          key={structuredRecessView}
          initialView={structuredRecessView}
          currentUserEmail={user.email}
        />
      )}

      {activeModule === "forms" && (
        <StaffFormsModule currentUserEmail={user.email} />
      )}

      {activeModule === "permission-slips" && (access.canUseAdmin || access.canUseDigitalSlips) && (
        <PermissionSlipsModule currentUserEmail={user.email} />
      )}

      {activeModule === "documents" && (
        <ImportantDocumentsModule />
      )}

      {activeModule === "suggestions" && (
        <SuggestionsModule currentUserEmail={user.email} />
      )}

      {activeModule === "office-finance" && access.canUseOfficePayroll && (
        <OfficePayrollWorkspace currentUserEmail={user.email} officeFinanceTarget={officeFinanceTarget} />
      )}

      {activeModule === "look-of-the-week" && (
        <LookOfWeekModule />
      )}

      {activeModule === "student-evaluation" && (
        <StudentEvaluationModule />
      )}

      {activeModule === "admin" && access.canUseAdmin && (
        <AdminModule currentUserEmail={user.email} access={access} />
      )}
    </div>
      )}
    </AuthGate>
  );
}
