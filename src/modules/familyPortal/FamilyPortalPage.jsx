import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, CreditCard, DollarSign, FileText, Info, ReceiptText, RefreshCw, Send, Users, Utensils } from "lucide-react";
import { createLunchCheckout, fetchFamilyPortalData, submitFosHours, submitLunchOrders } from "../../lib/familyPortalData.js";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient.js";

const today = new Date().toISOString().slice(0, 10);
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthStart(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthName(value) {
  return monthStart(value).toLocaleDateString([], { month: "long", year: "numeric" });
}

function buildSchoolMonthDays(value) {
  const start = monthStart(value);
  const days = [];
  const cursor = new Date(start);
  while (cursor.getMonth() === start.getMonth()) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const leading = days.length ? days[0].getDay() - 1 : 0;
  const cells = Array.from({ length: leading }, () => null).concat(days);
  while (cells.length % 5 !== 0) cells.push(null);
  return cells;
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400 ${props.className || ""}`}
    />
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-200">
      {label}
      {children}
    </label>
  );
}

function Stat({ label, value, tone = "white", info = "" }) {
  const tones = {
    white: "text-white",
    green: "text-emerald-200",
    amber: "text-amber-200",
    rose: "text-rose-200",
    sky: "text-sky-200",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span>{label}</span>
        {info && (
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label={`${label} explanation`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-slate-400 outline-none hover:border-sky-400 hover:text-sky-200 focus:border-sky-400 focus:text-sky-200"
            >
              <Info size={12} />
            </button>
            <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 p-3 text-left text-xs font-medium normal-case leading-5 tracking-normal text-slate-200 shadow-xl group-hover:block group-focus-within:block">
              {info}
            </span>
          </span>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold ${tones[tone] || tones.white}`}>{value}</div>
    </div>
  );
}

function isOpenInvoice(invoice) {
  const status = `${invoice?.paymentStatus || invoice?.status || ""}`.toLowerCase();
  return !status.includes("paid") && !status.includes("void") && !status.includes("cancel");
}

export default function FamilyPortalPage({ token = "", secureLogin = false, previewFamilyKey = "" }) {
  const [portal, setPortal] = useState({ loading: true, error: "", data: null });
  const [familySession, setFamilySession] = useState({ loading: Boolean(secureLogin || previewFamilyKey), user: null });
  const [loginDraft, setLoginDraft] = useState({ email: "" });
  const [loginStatus, setLoginStatus] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [draft, setDraft] = useState({ parentName: "", parentEmail: "", activityDate: today, activity: "", hours: "", notes: "" });
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showFosForm, setShowFosForm] = useState(false);
  const [lunchDraft, setLunchDraft] = useState({ studentId: "", menuId: "", selectedItems: {}, amount: "25.00" });
  const [lunchStatus, setLunchStatus] = useState("");

  const authRequired = Boolean(secureLogin || previewFamilyKey);

  async function loadPortal() {
    setPortal((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await fetchFamilyPortalData(previewFamilyKey ? { previewFamilyKey } : secureLogin ? {} : token);
      if (!result.found) {
        setPortal({
          loading: false,
          error: secureLogin
            ? "No family portal is connected to this email address yet. Please contact the WVCS office."
            : "This family portal link was not found or is no longer active.",
          data: null,
        });
        return;
      }
      setPortal({ loading: false, error: "", data: result });
      setDraft((current) => ({
        ...current,
        parentEmail: current.parentEmail || result.family?.contactEmails?.[0] || "",
      }));
    } catch (error) {
      setPortal({ loading: false, error: error.message, data: null });
    }
  }

  useEffect(() => {
    if (!authRequired) {
      loadPortal();
      return undefined;
    }

    let active = true;
    async function loadSession() {
      if (!isSupabaseConfigured) {
        setFamilySession({ loading: false, user: null });
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (active) setFamilySession({ loading: false, user: data.session?.user || null });
    }
    loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setFamilySession({ loading: false, user: session?.user || null });
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [authRequired]);

  useEffect(() => {
    if (!authRequired) return;
    if (familySession.loading) return;
    if (familySession.user) loadPortal();
    else setPortal({ loading: false, error: "", data: null });
  }, [authRequired, familySession.loading, familySession.user?.id, previewFamilyKey]);

  const balance = portal.data?.fos?.balance || {};
  const entries = portal.data?.fos?.entries || [];
  const invoices = useMemo(
    () => [...(portal.data?.invoices?.incidentals || []), ...(portal.data?.invoices?.tuition || [])],
    [portal.data]
  );
  const visibleInvoice = selectedInvoice && invoices.find((invoice) => invoice.id === selectedInvoice.id && invoice.type === selectedInvoice.type);
  const openInvoices = invoices.filter(isOpenInvoice);
  const openInvoiceBalance = openInvoices.reduce((total, invoice) => total + invoiceTotal(invoice), 0);
  const latestInvoice = invoices[0];
  const fosBalanceInfo = `This family's FOS obligation starts at ${money(balance.liabilityAmount || portal.data?.fos?.buyoutAmount || 500)}. Each approved volunteer hour reduces this amount by ${money(balance.hourValue || portal.data?.fos?.hourValue || 10)} until the requirement is complete.`;
  const lunch = portal.data?.lunch || {};
  const lunchMenus = lunch.menus || [];
  const activeLunchMenu = (lunch.menus || []).find((menu) => menu.id === lunchDraft.menuId) || lunch.menus?.[0] || null;
  const lunchItems = (activeLunchMenu?.items || []).map((item) => ({ ...item, menuId: activeLunchMenu.id, menuTitle: activeLunchMenu.title, itemKey: `${activeLunchMenu.id}:${item.id}` }));
  const lunchItemsByDate = useMemo(() => {
    const map = new Map();
    lunchItems.forEach((item) => {
      if (!item.date) return;
      map.set(item.date, [...(map.get(item.date) || []), item]);
    });
    return map;
  }, [lunchItems]);
  const selectedLunchItems = lunchItems.filter((item) => lunchDraft.selectedItems[item.itemKey]);
  const expectedLunchCost = selectedLunchItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const monthCells = buildSchoolMonthDays(activeLunchMenu?.weekStart || today);

  useEffect(() => {
    if (!lunchMenus.length) return;
    if (lunchDraft.menuId && lunchMenus.some((menu) => menu.id === lunchDraft.menuId)) return;
    setLunchDraft((current) => ({ ...current, menuId: lunchMenus[0].id, selectedItems: {} }));
  }, [lunchMenus.length, lunchDraft.menuId]);

  function invoiceTitle(invoice) {
    if (!invoice) return "Invoice";
    if (invoice.type === "tuition") return `${invoice.schoolYear || invoice.invoice?.schoolYear || "Tuition"} Tuition Breakdown`;
    const firstCharge = Array.isArray(invoice.invoice?.charges) ? invoice.invoice.charges[0]?.description : "";
    return invoice.invoice?.title || invoice.invoice?.invoiceTitle || firstCharge || "Incidental Invoice";
  }

  function invoiceTotal(invoice) {
    if (!invoice) return 0;
    return Number(invoice.total || invoice.invoice?.total || invoice.invoice?.balanceDue || 0);
  }

  function chargeRows(invoice) {
    const charges = invoice?.invoice?.charges;
    if (Array.isArray(charges) && charges.length) return charges.map((charge) => ({ label: charge.description || charge.label || "Charge", amount: charge.amount }));
    const students = invoice?.invoice?.students;
    if (Array.isArray(students) && students.length) {
      return students.flatMap((student) => [
        { label: `${student.name || "Student"} tuition`, amount: student.tuition },
        { label: `${student.name || "Student"} comprehensive fee`, amount: student.comprehensiveFee },
      ]).filter((row) => Number(row.amount || 0));
    }
    return [];
  }

  function incidentalUrl(invoice) {
    if (invoice?.type !== "incidental" || !invoice.publicToken) return "";
    return `${window.location.origin}${window.location.pathname}#/incidental-pay/${encodeURIComponent(invoice.publicToken)}`;
  }

  async function submitHours() {
    if (!draft.activityDate || !draft.activity || !Number(draft.hours)) {
      setStatus("Enter the date, activity, and hours before submitting.");
      return;
    }
    setSubmitting(true);
    setStatus("Submitting FOS hours...");
    try {
      await submitFosHours(token, draft);
      setStatus("Hours submitted. They are pending office verification.");
      setDraft((current) => ({ ...current, activity: "", hours: "", notes: "" }));
      setShowFosForm(false);
      await loadPortal();
    } catch (error) {
      setStatus(`Unable to submit hours: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendLoginLink() {
    const email = loginDraft.email.trim().toLowerCase();
    if (!email) {
      setLoginStatus("Enter the email address connected to your WVCS family record.");
      return;
    }
    setLoginStatus("Sending secure sign-in link...");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/#/family-login`,
        shouldCreateUser: false,
      },
    });
    if (error) {
      setLoginStatus(error.message);
      return;
    }
    setLinkSent(true);
    setLoginStatus("Check your email and click the secure sign-in link to open your family portal.");
  }

  async function signOutFamilyPortal() {
    await supabase.auth.signOut();
    setPortal({ loading: false, error: "", data: null });
  }

  async function submitLunchOrder() {
    if (!lunchDraft.studentId || !selectedLunchItems.length) {
      setLunchStatus("Choose a student and at least one lunch item before submitting.");
      return;
    }
    setLunchStatus("Submitting lunch orders...");
    try {
      await submitLunchOrders(selectedLunchItems.map((item) => ({ studentId: lunchDraft.studentId, menuId: item.menuId, itemId: item.id })));
      setLunchDraft((current) => ({ ...current, selectedItems: {} }));
      setLunchStatus(`Lunch menu submitted. Expected cost: ${money(expectedLunchCost)}. The office will charge the account only for lunches that are served.`);
      await loadPortal();
    } catch (error) {
      setLunchStatus(`Unable to submit lunch order: ${error.message}`);
    }
  }

  function hasLunchMealForDate(item) {
    return lunchItems.some((candidate) =>
      candidate.date === item.date &&
      !candidate.requiresMeal &&
      candidate.itemKey !== item.itemKey &&
      lunchDraft.selectedItems[candidate.itemKey]
    );
  }

  function toggleLunchItem(item) {
    if (item.requiresMeal && !hasLunchMealForDate(item)) {
      setLunchStatus("Choose a regular meal for that date before adding this restricted item.");
      return;
    }
    setLunchDraft((current) => ({
      ...current,
      selectedItems: {
        ...current.selectedItems,
        [item.itemKey]: !current.selectedItems[item.itemKey],
      },
    }));
    setLunchStatus("");
  }

  async function addLunchFunds() {
    setLunchStatus("Opening secure checkout...");
    try {
      const result = await createLunchCheckout(lunchDraft.amount);
      if (result.url) window.location.href = result.url;
      else setLunchStatus(result.reason || "Unable to create checkout.");
    } catch (error) {
      setLunchStatus(`Unable to open checkout: ${error.message}`);
    }
  }

  if (secureLogin && !familySession.loading && !familySession.user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <section className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-8">
          <div className="w-full rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">WVCS Family Portal</div>
            <h1 className="mt-2 text-3xl font-bold text-white">Family Sign In</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Enter the parent or guardian email address that WVCS has connected to your family record. The system will send a secure sign-in link to that email.
            </p>
            <div className="mt-5 grid gap-3">
              <Field label="Email">
                <Input type="email" value={loginDraft.email} onChange={(event) => setLoginDraft({ ...loginDraft, email: event.target.value })} placeholder="parent@example.com" />
              </Field>
              <button
                type="button"
                onClick={sendLoginLink}
                disabled={!isSupabaseConfigured}
                className="inline-flex w-full items-center justify-center rounded-lg border border-sky-400 bg-sky-500 px-3 py-3 text-sm font-bold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linkSent ? "Send Link Again" : "Send Sign-In Link"}
              </button>
              {linkSent && (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
                  Keep this page open, then use the link in your email. On this device, you should stay signed in for future visits unless you sign out or your browser clears the session.
                </div>
              )}
            </div>
            {loginStatus && <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{loginStatus}</div>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-[1720px] px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">WVCS Family Portal</div>
            <h1 className="mt-2 text-3xl font-bold text-white">{portal.data?.family?.familyName || "Family Portal"}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {previewFamilyKey ? "Office preview of the family portal." : "View FOS progress, invoice history, and family account tools."}
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              Tuition payments are processed through FACTS and are not recorded in the WVCS School Hub. Please use FACTS for tuition payment records and balances.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadPortal}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            {secureLogin && familySession.user && (
              <button
                type="button"
                onClick={signOutFamilyPortal}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        {portal.loading && <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">Loading family portal...</div>}
        {portal.error && <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{portal.error}</div>}

        {portal.data && (
          <div className="mt-6 space-y-5">
            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="Open Invoices" value={openInvoices.length} tone="amber" />
              <Stat label="Open Balance" value={money(openInvoiceBalance)} tone="sky" />
              <Stat label="FOS Remaining" value={`${balance.remainingHours || 0} hrs`} tone="amber" />
              <Stat label="FOS Amount Owed" value={money(balance.remainingBalance)} tone="rose" info={fosBalanceInfo} />
            </div>

            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
              {[
                ["overview", "Overview", Users],
                ["invoices", "Invoices", ReceiptText],
                ["lunch", "Lunch", Utensils],
                ["fos", "FOS Hours", Clock],
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    activeTab === id
                      ? "border-sky-400 bg-sky-500 text-white"
                      : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                <div className="space-y-5">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <FileText size={16} className="text-sky-300" />
                      Account Summary
                    </div>
                    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Tuition payments are processed through FACTS and are not recorded in the Hub.
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Latest Invoice</div>
                        <div className="mt-2 text-sm font-bold text-white">{latestInvoice ? invoiceTitle(latestInvoice) : "No invoices yet"}</div>
                        {latestInvoice && <div className="mt-1 text-xs text-slate-500">{latestInvoice.paymentStatus || latestInvoice.status} | {money(invoiceTotal(latestInvoice))}</div>}
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">FOS Progress</div>
                        <div className="mt-2 text-sm font-bold text-white">{balance.approvedHours || 0} approved hours</div>
                        <div className="mt-1 text-xs text-slate-500">{balance.remainingHours || 0} hours remaining</div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Lunch Balance</div>
                        <div className="mt-2 text-sm font-bold text-white">{money(lunch.balance || 0)}</div>
                        <div className="mt-1 text-xs text-slate-500">Family lunch account</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <CheckCircle2 size={16} className="text-emerald-300" />
                      Recent FOS History
                    </div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                      {entries.slice(0, 4).map((entry) => (
                        <div key={entry.id} className="grid gap-2 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[100px_1fr_80px_90px]">
                          <div className="text-slate-400">{shortDate(entry.activityDate)}</div>
                          <div>
                            <div className="font-semibold text-white">{entry.activity}</div>
                            {entry.officeNote && <div className="mt-1 text-xs text-slate-500">{entry.officeNote}</div>}
                          </div>
                          <div className="text-slate-300">{entry.approvedHours || entry.submittedHours} hrs</div>
                          <div className="font-semibold text-sky-200">{entry.status}</div>
                        </div>
                      ))}
                      {!entries.length && <div className="p-4 text-sm text-slate-500">No FOS hours have been submitted yet.</div>}
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-bold text-white">Students</div>
                    <div className="mt-3 space-y-2">
                      {(portal.data.family?.students || []).map((student) => (
                        <div key={student.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                          {student.name} {student.grade ? <span className="text-slate-500">Grade {student.grade}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <DollarSign size={16} className="text-emerald-300" />
                      Lunch Balance
                    </div>
                    <div className="mt-3 text-2xl font-bold text-white">{money(lunch.balance || 0)}</div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("lunch")}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                    >
                      <Utensils size={16} />
                      Open Lunch Account
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "lunch" && (
              <div className="space-y-5">
                <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)] xl:items-start">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <DollarSign size={16} className="text-emerald-300" />
                      Lunch Balance
                    </div>
                    <div className="mt-3 text-3xl font-bold text-white">{money(lunch.balance || 0)}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Online deposits add to your family lunch account. WVCS charges the account only after the office marks a lunch as served.
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input inputMode="decimal" value={lunchDraft.amount} onChange={(event) => setLunchDraft({ ...lunchDraft, amount: event.target.value })} placeholder="25.00" />
                      <button
                        type="button"
                        onClick={addLunchFunds}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                      >
                        <CreditCard size={16} />
                        Add Funds
                      </button>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <Utensils size={16} className="text-sky-300" />
                        Monthly Lunch Menu
                      </div>
                      {activeLunchMenu && (
                        <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-100">
                          Published Menu
                        </div>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3">
                      {lunchMenus.length > 1 && (
                        <Field label="Menu">
                          <select
                            value={activeLunchMenu?.id || ""}
                            onChange={(event) => setLunchDraft({ ...lunchDraft, menuId: event.target.value, selectedItems: {} })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                          >
                            {lunchMenus.map((menu) => <option key={menu.id} value={menu.id}>{menu.title}</option>)}
                          </select>
                        </Field>
                      )}
                      <Field label="Student">
                        <select
                          value={lunchDraft.studentId}
                          onChange={(event) => setLunchDraft({ ...lunchDraft, studentId: event.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                        >
                          <option value="">Select student</option>
                          {(portal.data.family?.students || []).map((student) => <option key={student.id} value={student.id}>{student.name} {student.grade ? `(Grade ${student.grade})` : ""}</option>)}
                        </select>
                      </Field>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-white">{activeLunchMenu?.title || "Lunch Menu"}</div>
                            <div className="text-xs text-slate-500">{activeLunchMenu ? monthName(activeLunchMenu.weekStart) : `No published menu loaded (${lunchMenus.length} received)`}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Expected Cost</div>
                            <div className="text-xl font-bold text-emerald-200">{money(expectedLunchCost)}</div>
                          </div>
                        </div>
                        {activeLunchMenu?.notes && <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs leading-5 text-slate-300">{activeLunchMenu.notes}</div>}
                      </div>
                      {activeLunchMenu && !lunchItems.length && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
                          This lunch menu is published, but it does not have any dated lunch items saved yet. Please contact the WVCS office.
                        </div>
                      )}
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <div className="min-w-[900px]">
                          <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-900 text-center text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                            {weekDays.map((day) => <div key={day} className="border-r border-slate-800 px-2 py-2 last:border-r-0">{day}</div>)}
                          </div>
                          <div className="grid grid-cols-5">
                            {monthCells.map((cellDate, index) => {
                              const cellIso = cellDate ? isoDate(cellDate) : "";
                              const dayItems = cellIso ? lunchItemsByDate.get(cellIso) || [] : [];
                              return (
                                <div key={cellIso || `blank-${index}`} className="min-h-40 border-r border-b border-slate-800 bg-slate-950 p-2 last:border-r-0">
                                  {cellDate ? (
                                    <>
                                      <div className="text-sm font-bold text-slate-200">{cellDate.getDate()}</div>
                                      <div className="mt-2 space-y-2">
                                        {dayItems.map((item) => {
                                          const checked = Boolean(lunchDraft.selectedItems[item.itemKey]);
                                          return (
                                            <button
                                              key={item.itemKey}
                                              type="button"
                                              onClick={() => toggleLunchItem(item)}
                                              className={`flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition ${
                                                checked ? "border-emerald-400 bg-emerald-500/15 text-emerald-50" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/50"
                                              }`}
                                            >
                                              <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-emerald-300 bg-emerald-400 text-slate-950" : "border-slate-600"}`}>
                                                {checked ? "✓" : ""}
                                              </span>
                                              <span>
                                                <span className="block font-semibold">{item.name}</span>
                                                <span className="block text-slate-500">{money(item.price)}</span>
                                                {item.requiresMeal && <span className="block text-amber-200">Requires meal</span>}
                                              </span>
                                            </button>
                                          );
                                        })}
                                        {!dayItems.length && <div className="rounded-md border border-dashed border-slate-800 p-2 text-center text-xs text-slate-600">No lunch</div>}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="h-full rounded-md bg-slate-900/60" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={submitLunchOrder}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                      >
                        <Send size={16} />
                        Submit Monthly Lunch Order
                      </button>
                    </div>
                    {!activeLunchMenu && <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-500">No lunch menus are published yet. Use Refresh after the office publishes a menu. Menus received: {lunchMenus.length}.</div>}
                    {lunchStatus && <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{lunchStatus}</div>}
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-bold text-white">Lunch Orders</div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                      {(lunch.orders || []).map((order) => (
                        <div key={order.id} className="grid gap-2 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[100px_1fr_90px]">
                          <div className="text-slate-400">{shortDate(order.orderDate)}</div>
                          <div>
                            <div className="font-semibold text-white">{order.studentName}: {order.itemName}</div>
                            <div className="text-xs text-slate-500">{money(order.price)} | {order.source || "Lunch order"}</div>
                          </div>
                          <div className="font-semibold text-sky-200">{order.status}</div>
                        </div>
                      ))}
                      {!lunch.orders?.length && <div className="p-4 text-sm text-slate-500">No lunch orders yet.</div>}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-bold text-white">Lunch Account History</div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                      {(lunch.transactions || []).map((transaction) => (
                        <div key={transaction.id} className="flex items-start justify-between gap-3 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0">
                          <div>
                            <div className="font-semibold text-white">{transaction.description || transaction.type}</div>
                            <div className="text-xs text-slate-500">{shortDate(transaction.createdAt?.slice(0, 10))}</div>
                          </div>
                          <div className={transaction.amount < 0 ? "font-bold text-rose-200" : "font-bold text-emerald-200"}>{money(transaction.amount)}</div>
                        </div>
                      ))}
                      {!lunch.transactions?.length && <div className="p-4 text-sm text-slate-500">No lunch account activity yet.</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "invoices" && (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <ReceiptText size={16} className="text-sky-300" />
                  Invoice History
                </div>
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-100">
                  Tuition payment activity is not tracked in the WVCS School Hub. Tuition payments and tuition account balances are handled through FACTS.
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {invoices.map((invoice) => (
                    <button
                      key={`${invoice.id}-${invoice.type}-${invoice.schoolYear || invoice.status}`}
                      type="button"
                      onClick={() =>
                        setSelectedInvoice((current) =>
                          current?.id === invoice.id && current?.type === invoice.type ? null : { id: invoice.id, type: invoice.type }
                        )
                      }
                      className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-slate-800 ${
                        visibleInvoice?.id === invoice.id && visibleInvoice?.type === invoice.type
                          ? "border-sky-500/50 bg-sky-500/10"
                          : "border-slate-800 bg-slate-950"
                      }`}
                    >
                      <div className="font-semibold text-white">{invoiceTitle(invoice)}</div>
                      <div className="mt-1 text-xs text-slate-500">{invoice.paymentStatus || invoice.status} {invoice.total ? `| ${money(invoice.total)}` : ""}</div>
                    </button>
                  ))}
                  {!invoices.length && <div className="text-sm text-slate-500">No invoice history is available yet.</div>}
                </div>
                {visibleInvoice && (
                  <div className="mt-4 rounded-lg border border-sky-500/30 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Invoice Viewer</div>
                        <div className="mt-1 text-base font-bold text-white">{invoiceTitle(visibleInvoice)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {visibleInvoice.paymentStatus || visibleInvoice.status || "Invoice"} {visibleInvoice.sentAt ? `| Sent ${shortDate(visibleInvoice.sentAt)}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Total</div>
                        <div className="text-lg font-bold text-white">{money(invoiceTotal(visibleInvoice))}</div>
                      </div>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                      {chargeRows(visibleInvoice).map((row, index) => (
                        <div key={`${row.label}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0">
                          <div className="text-slate-200">{row.label}</div>
                          <div className="font-semibold text-white">{money(row.amount)}</div>
                        </div>
                      ))}
                      {!chargeRows(visibleInvoice).length && (
                        <div className="px-3 py-3 text-sm text-slate-500">This invoice record does not include line-item details.</div>
                      )}
                    </div>
                    {visibleInvoice.receiptNumber && <div className="mt-3 text-xs text-slate-400">Receipt: {visibleInvoice.receiptNumber}</div>}
                    {incidentalUrl(visibleInvoice) && (
                      <a
                        href={incidentalUrl(visibleInvoice)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                      >
                        Open Full Invoice
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "fos" && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <Stat label="Approved Hours" value={balance.approvedHours || 0} tone="green" />
                  <Stat label="Remaining Hours" value={balance.remainingHours || 0} tone="amber" />
                  <Stat label="FOS Amount Owed" value={money(balance.remainingBalance)} tone="rose" info={fosBalanceInfo} />
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <Clock size={16} className="text-sky-300" />
                      FOS Hours
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFosForm((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                    >
                      <Send size={16} />
                      {showFosForm ? "Close Form" : "Report Volunteer Hours"}
                    </button>
                  </div>

                  {showFosForm && (
                    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Parent / Guardian Name">
                          <Input value={draft.parentName} onChange={(event) => setDraft({ ...draft, parentName: event.target.value })} />
                        </Field>
                        <Field label="Email">
                          <Input type="email" value={draft.parentEmail} onChange={(event) => setDraft({ ...draft, parentEmail: event.target.value })} />
                        </Field>
                        <Field label="Date">
                          <Input type="date" value={draft.activityDate} onChange={(event) => setDraft({ ...draft, activityDate: event.target.value })} />
                        </Field>
                        <Field label="Hours">
                          <Input inputMode="decimal" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} placeholder="0.00" />
                        </Field>
                        <div className="md:col-span-2">
                          <Field label="Activity">
                            <Input value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.target.value })} placeholder="Auction help, classroom support, event setup..." />
                          </Field>
                        </div>
                        <div className="md:col-span-2">
                          <Field label="Notes">
                            <Input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional details" />
                          </Field>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={submitHours}
                        disabled={submitting}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
                      >
                        <Send size={16} />
                        {submitting ? "Submitting..." : "Submit Hours"}
                      </button>
                    </div>
                  )}
                  {status && <div className="mt-3 text-sm text-sky-200">{status}</div>}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <CheckCircle2 size={16} className="text-emerald-300" />
                    FOS History
                  </div>
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                    {entries.map((entry) => (
                      <div key={entry.id} className="grid gap-2 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[100px_1fr_80px_90px]">
                        <div className="text-slate-400">{shortDate(entry.activityDate)}</div>
                        <div>
                          <div className="font-semibold text-white">{entry.activity}</div>
                          {entry.officeNote && <div className="mt-1 text-xs text-slate-500">{entry.officeNote}</div>}
                        </div>
                        <div className="text-slate-300">{entry.approvedHours || entry.submittedHours} hrs</div>
                        <div className="font-semibold text-sky-200">{entry.status}</div>
                      </div>
                    ))}
                    {!entries.length && <div className="p-4 text-sm text-slate-500">No FOS hours have been submitted yet.</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
