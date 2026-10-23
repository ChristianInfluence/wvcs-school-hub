import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, FileSpreadsheet, LayoutDashboard, Link2, Loader2, LockKeyhole, Settings2, SlidersHorizontal, TrendingUp, Wallet, X } from "lucide-react";
import { canUseForecast } from "../../../supabase/functions/_shared/financeForecast/access.js";
import { blankDocument, documentSchema, monthLabel, type Account, type CashEvent, type ForecastDocument, type Scenario } from "../../../supabase/functions/_shared/financeForecast/model.ts";
import { sampleDocument } from "../../../supabase/functions/_shared/financeForecast/sample.ts";
import { forecastApi } from "./api.ts";
import { WorkspaceContext, type ForecastApi, type View } from "./components/forecast-context";
import { BoardReports } from "./components/forecast-board";
import { Dashboard } from "./components/forecast-dashboard";
import { ExpensePlan, IncomePlan } from "./components/forecast-plans";
import { ReportImports, Connections, WorkspaceSettings } from "./components/forecast-data";
import { AccountDialog, EventDialog, OverrideDialog } from "./components/forecast-dialogs";
import "./forecast.css";

const navigation = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "forecast", name: "Cash forecast", icon: TrendingUp },
  { id: "expenses", name: "Expense plan", icon: SlidersHorizontal },
  { id: "income", name: "Income & tuition", icon: Wallet },
  { id: "board", name: "Monthly board report", icon: ClipboardList },
  { id: "imports", name: "Reports & imports", icon: FileSpreadsheet },
  { id: "connections", name: "QuickBooks", icon: Link2 },
  { id: "settings", name: "Settings", icon: Settings2 },
] as const;

const titles: Record<View, [string, string]> = {
  overview: ["Budget & cash forecast", "See where cash is headed and the assumptions behind it."],
  forecast: ["Cash forecast", "Monthly balances and payment timing, with every number explained."],
  expenses: ["Expense plan", "Use seasonal history, then adjust for the year ahead."],
  income: ["Income & tuition", "Bring tuition schedules and future income into one plan."],
  board: ["Monthly board report", "Planned and actual results for the month, with a cash outlook through July 31."],
  imports: ["Reports & imports", "Review your accounting reports before applying them to the forecast."],
  connections: ["QuickBooks Online", "Retrieve reports for review without changing the school’s books."],
  settings: ["Forecast settings", "Set reviewed cash, allocated funds, and the operating cushion."],
};

function initialView(): View {
  const view = new URLSearchParams(window.location.hash.split("?")[1] || "").get("view") as View;
  return view && view in titles ? view : "overview";
}

export default function ForecastModule({ currentUserEmail = "", initialForecastView }: { currentUserEmail?: string; initialForecastView?: View }) {
  if (!canUseForecast(currentUserEmail)) {
    return <div className="mx-auto max-w-3xl p-8 text-slate-300" role="alert">You do not have access to the budget forecast.</div>;
  }
  return <ForecastWorkspace key={currentUserEmail.toLowerCase()} currentUserEmail={currentUserEmail} initialForecastView={initialForecastView} />;
}

export function ForecastWorkspace({ currentUserEmail, initialForecastView, request = forecastApi }: { currentUserEmail: string; initialForecastView?: View; request?: ForecastApi }) {
  const [view, setView] = useState<View>(initialForecastView || initialView);
  const [doc, setDoc] = useState<ForecastDocument>(sampleDocument);
  const [revision, setRevision] = useState(0), [demo, setDemo] = useState(true);
  const [loading, setLoading] = useState(true), [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0), [saving, setSaving] = useState(false), [notice, setNotice] = useState("");
  const [scenario, setScenario] = useState<Scenario>("expected");
  const [account, setAccount] = useState<Account | null>(null), [event, setEvent] = useState<CashEvent | null>(null);
  const [override, setOverride] = useState<{ accountId: string; month: string } | null>(null);

  const go = (next: View) => {
    setView(next);
    if (window.location.hash.startsWith("#/office-finance")) {
      window.history.replaceState(null, "", `#/office-finance/forecast?view=${next}`);
    }
  };
  useEffect(() => { if (initialForecastView) go(initialForecastView); }, [initialForecastView]);
  useEffect(() => {
    let active = true;
    setLoading(true); setLoadError("");
    request("/api/workspace").then(data => {
      if (!active) return;
      const next = documentSchema.parse(data.document);
      setRevision(data.revision);
      setDoc(next.initialized ? next : sampleDocument());
      setDemo(!next.initialized);
    }).catch(error => { if (active) setLoadError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    const callback = new URLSearchParams(window.location.hash.split("?")[1] || "").get("qbo");
    if (callback) setNotice(callback === "connected" ? "QuickBooks connected. Review reports before importing." : "QuickBooks connection did not finish. Start again in QuickBooks.");
    return () => { active = false; };
  }, [currentUserEmail, reload, request]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""), 8000); return () => clearTimeout(timer); }, [notice]);

  function imported(data: any) {
    setDoc(documentSchema.parse(data.document)); setRevision(data.revision); setDemo(false);
  }
  async function save(next: ForecastDocument, force = false) {
    const validated = documentSchema.parse(next);
    if (demo && !force) { setDoc(validated); setNotice("Sample updated. Create the school workspace to save real figures."); return; }
    setSaving(true);
    try {
      imported(await request("/api/workspace", { method: "PUT", body: JSON.stringify({ document: validated, revision }) }));
      setNotice("School forecast saved");
    } finally { setSaving(false); }
  }
  async function start() {
    const next = blankDocument(); next.initialized = true;
    try { await save(next, true); go("settings"); setNotice("School workspace created. Review starting cash, then import your reports."); }
    catch (error) { setNotice((error as Error).message); }
  }

  return <div className="wvcs-forecast"><WorkspaceContext.Provider value={{ doc, revision, demo, saving, signedIn: true, scenario, setScenario, notify: setNotice, go, persist: next => save(next), imported, editAccount: setAccount, editEvent: setEvent, overrideMonth: (accountId, month) => setOverride({ accountId, month }), request }}>
    <div className="forecast-hub-heading"><div><div className="eyebrow">OFFICE & FINANCE</div><h1>{titles[view][0]}</h1><p>{titles[view][1]}</p></div><div className="forecast-access-stamp"><LockKeyhole size={14} /><span>Restricted access<small>{saving ? "Saving…" : demo ? "Illustrative sample" : "Shared school forecast"}</small></span></div></div>
    <nav className="forecast-hub-nav" aria-label="Forecast workspace">{navigation.map(item => <button type="button" key={item.id} aria-current={view === item.id ? "page" : undefined} className={view === item.id ? "active" : ""} onClick={() => go(item.id)}><item.icon size={15} />{item.name}</button>)}</nav>
    {loading ? <div className="loading-screen"><Loader2 className="spin" size={24} />Opening the shared school forecast…</div>
      : loadError ? <section className="card forecast-unavailable" role="alert"><LockKeyhole size={24} /><h2>Shared forecast unavailable</h2><p>{loadError}</p><button type="button" className="button secondary" onClick={() => setReload(value => value + 1)}>Try again</button></section>
      : <>
        {demo && <div className="sample-banner"><div><span className="sample-tag">SAMPLE</span><span>Illustrative figures. These are not WVCS financial records.</span></div><button type="button" disabled={saving} onClick={start}>Create school workspace <ArrowRight size={14} /></button></div>}
        <div className="page-content">
          {(view === "overview" || view === "forecast") && <Dashboard detailed={view === "forecast"} />}
          {view === "expenses" && <ExpensePlan />}{view === "income" && <IncomePlan />}{view === "board" && <BoardReports />}{view === "imports" && <ReportImports />}{view === "connections" && <Connections />}{view === "settings" && <WorkspaceSettings />}
          <footer className="page-footer"><span><CheckCircle2 size={13} />WVCS budget & cash forecast</span><span>{demo ? "Illustrative sample data" : `Books reviewed through ${monthLabel(doc.settings.cutoffMonth, true)}`} · Planning estimates</span></footer>
        </div>
      </>}
    {notice && <div className="toast" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
    {account && <AccountDialog account={account} onClose={() => setAccount(null)} />}{event && <EventDialog event={event} onClose={() => setEvent(null)} />}{override && <OverrideDialog value={override} onClose={() => setOverride(null)} />}
  </WorkspaceContext.Provider></div>;
}
