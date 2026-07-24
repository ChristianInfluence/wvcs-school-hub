import { useEffect, useMemo, useState } from "react";
import { Clock, DollarSign, FileText, History, Mail, RefreshCw, Search, ShieldCheck, Utensils, Users } from "lucide-react";
import { fetchFamilyPortalAccessRecords, fetchFosAuditEvents, fetchFosEntries, calculateFosBalance, FOS_SCHOOL_YEAR } from "../../lib/familyPortalData.js";
import { fetchLunchAdminData, money } from "../../lib/lunchData.js";
import { fetchIncidentalInvoices, fetchOfficeFamilyDirectory, fetchTuitionInvoices } from "../../lib/tuitionBillingData.js";

const today = new Date().toISOString().slice(0, 10);

function formatDate(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatShortDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

function StatusPill({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
  };
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${tones[tone] || tones.slate}`}>{children}</span>;
}

function invoiceBalance(invoice) {
  const total = Number(invoice.invoice?.total || invoice.invoice?.amount || invoice.invoice?.balanceDue || 0);
  return Number.isFinite(total) ? total : 0;
}

function paymentTone(invoice) {
  const status = String(invoice.paymentStatus || invoice.status || "").toLowerCase();
  if (status.includes("paid")) return "emerald";
  if (status.includes("void") || status.includes("refund")) return "slate";
  if (status.includes("partial")) return "amber";
  return "rose";
}

function FamilyRecordsModule({ initialSavedView = "all" }) {
  const [data, setData] = useState({ loading: true, families: [], tuition: [], incidentals: [], lunch: null, fosEntries: [], access: [], audit: [], error: "" });
  const [search, setSearch] = useState("");
  const [selectedFamilyKey, setSelectedFamilyKey] = useState("");
  const [savedView, setSavedView] = useState(initialSavedView || "all");
  const savedViewLabels = {
    unpaid: "families with unpaid incidental invoices",
    fos: "families with FOS balances or pending FOS hours",
    lunch: "families with negative lunch balances",
    portal: "families without a recorded portal login",
  };

  async function loadData(message = "") {
    setData((current) => ({ ...current, loading: true, error: message }));
    try {
      const [directoryResult, tuitionResult, incidentalResult, lunchResult, fosResult, accessResult, auditResult] = await Promise.all([
        fetchOfficeFamilyDirectory(),
        fetchTuitionInvoices(),
        fetchIncidentalInvoices(),
        fetchLunchAdminData(),
        fetchFosEntries(),
        fetchFamilyPortalAccessRecords(),
        fetchFosAuditEvents(120),
      ]);
      setData({
        loading: false,
        families: directoryResult.families || [],
        tuition: tuitionResult.invoices || [],
        incidentals: incidentalResult.invoices || [],
        lunch: lunchResult || null,
        fosEntries: fosResult.entries || [],
        access: accessResult.access || [],
        audit: auditResult.events || [],
        error: directoryResult.reason || tuitionResult.reason || incidentalResult.reason || lunchResult.reason || fosResult.reason || accessResult.reason || auditResult.reason || "",
      });
    } catch (error) {
      setData((current) => ({ ...current, loading: false, error: error.message }));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialSavedView) setSavedView(initialSavedView);
  }, [initialSavedView]);

  const familySummaries = useMemo(() => {
    const accounts = new Map((data.lunch?.accounts || []).map((account) => [account.familyKey, account]));
    const accessMap = new Map(data.access.map((record) => [record.familyKey, record]));
    return data.families.map((family) => {
      const incidentalInvoices = data.incidentals.filter((invoice) => invoice.familyKey === family.familyKey || invoice.familyName === family.familyName);
      const tuitionInvoices = data.tuition.filter((invoice) => invoice.familyName === family.familyName);
      const lunchOrders = (data.lunch?.orders || []).filter((order) => order.familyKey === family.familyKey);
      const lunchAccount = accounts.get(family.familyKey) || { balance: 0 };
      const fosEntries = data.fosEntries.filter((entry) => entry.familyKey === family.familyKey);
      const access = accessMap.get(family.familyKey);
      const fos = calculateFosBalance(fosEntries, access || {});
      const unpaidIncidentals = incidentalInvoices.filter((invoice) => !String(invoice.paymentStatus || "").toLowerCase().includes("paid"));
      const pendingFos = fosEntries.filter((entry) => entry.status === "Pending");
      return {
        ...family,
        access,
        incidentalInvoices,
        tuitionInvoices,
        lunchOrders,
        lunchAccount,
        fosEntries,
        fos,
        unpaidIncidentals,
        pendingFos,
        searchText: `${family.familyName} ${family.parents.map((parent) => `${parent.name} ${parent.email}`).join(" ")} ${family.students.map((student) => `${student.name} ${student.grade}`).join(" ")}`.toLowerCase(),
      };
    });
  }, [data]);

  const filteredFamilies = familySummaries
    .filter((family) => {
      if (savedView === "unpaid" && !family.unpaidIncidentals.length) return false;
      if (savedView === "fos" && family.fos.remainingBalance <= 0 && !family.pendingFos.length) return false;
      if (savedView === "lunch" && Number(family.lunchAccount.balance || 0) >= 0) return false;
      if (savedView === "portal" && family.access?.lastParentLoginAt) return false;
      return !search.trim() || family.searchText.includes(search.trim().toLowerCase());
    })
    .sort((a, b) => a.familyName.localeCompare(b.familyName, undefined, { sensitivity: "base" }));

  const selectedFamily = familySummaries.find((family) => family.familyKey === selectedFamilyKey) || filteredFamilies[0] || null;
  const timeline = selectedFamily
    ? [
        ...selectedFamily.incidentalInvoices.map((invoice) => ({
          id: `incidental-${invoice.id}`,
          type: "Incidental",
          title: `${invoice.status || "Invoice"} · ${invoice.paymentStatus || "Unpaid"}`,
          detail: invoice.sentTo?.length ? `Sent to ${invoice.sentTo.join(", ")}` : "Invoice record",
          at: invoice.sentAt || invoice.updatedAt || invoice.createdAt,
        })),
        ...selectedFamily.tuitionInvoices.map((invoice) => ({
          id: `tuition-${invoice.id}`,
          type: "Tuition",
          title: `${invoice.schoolYear || "School year"} tuition breakdown`,
          detail: invoice.sentTo?.length ? `Sent to ${invoice.sentTo.join(", ")}` : invoice.status || "Draft",
          at: invoice.sentAt || invoice.updatedAt || invoice.createdAt,
        })),
        ...selectedFamily.lunchOrders.slice(0, 80).map((order) => ({
          id: `lunch-${order.id}`,
          type: "Lunch",
          title: `${order.studentName} · ${order.itemName}`,
          detail: `${order.status} on ${formatShortDate(order.orderDate)}`,
          at: order.createdAt || order.orderDate,
        })),
        ...selectedFamily.fosEntries.map((entry) => ({
          id: `fos-${entry.id}`,
          type: "FOS",
          title: `${entry.status} · ${entry.activity}`,
          detail: `${entry.approvedHours || entry.submittedHours} hour(s)`,
          at: entry.reviewedAt || entry.submittedAt,
        })),
        ...data.audit.filter((event) => event.familyKey === selectedFamily.familyKey).map((event) => ({
          id: `audit-${event.id}`,
          type: "Activity",
          title: event.eventType.replaceAll("_", " "),
          detail: event.actorEmail || event.recipientEmails?.join(", ") || "Recorded activity",
          at: event.createdAt,
        })),
      ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 18)
    : [];

  return (
    <section className="mx-auto max-w-[1500px] px-5 py-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Office & Finance</div>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Family Records</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">A unified family view for contacts, students, invoices, lunch, FOS, portal access, and recent activity.</p>
        </div>
        <button type="button" onClick={() => loadData("Family records refreshed.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {data.error && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{data.error}</div>}
      {data.loading && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading family records...</div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[330px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500" placeholder="Search families, parents, students" />
          </div>
          {savedView !== "all" && (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-900">
              Showing {savedViewLabels[savedView] || "filtered families"}.
              <button type="button" onClick={() => setSavedView("all")} className="ml-2 font-black underline-offset-4 hover:underline">
                Show all
              </button>
            </div>
          )}
          <div className="mt-3 max-h-[640px] overflow-auto pr-1">
            {filteredFamilies.map((family) => (
              <button key={family.familyKey} type="button" onClick={() => setSelectedFamilyKey(family.familyKey)} className={`mb-2 w-full rounded-lg border p-3 text-left transition ${selectedFamily?.familyKey === family.familyKey ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}>
                <div className="truncate text-sm font-bold text-slate-950">{family.familyName}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{family.students.map((student) => `${student.name}${student.grade ? ` (${student.grade})` : ""}`).join(", ")}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {family.unpaidIncidentals.length > 0 && <StatusPill tone="rose">{family.unpaidIncidentals.length} unpaid</StatusPill>}
                  {family.pendingFos.length > 0 && <StatusPill tone="amber">{family.pendingFos.length} FOS pending</StatusPill>}
                  {Number(family.lunchAccount.balance || 0) < 0 && <StatusPill tone="amber">Lunch {money(family.lunchAccount.balance)}</StatusPill>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {selectedFamily && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-950">{selectedFamily.familyName}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFamily.parents.map((parent) => (
                      <span key={`${parent.email}-${parent.name}`} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        <Mail size={12} />
                        {parent.name || "Parent"} {parent.email ? `· ${parent.email}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                  <div className="font-bold text-slate-900">Portal Access</div>
                  <div className="mt-1">Last login: {formatDate(selectedFamily.access?.lastParentLoginAt)}</div>
                  {selectedFamily.access?.lastParentLoginEmail && <div>User: {selectedFamily.access.lastParentLoginEmail}</div>}
                </div>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><DollarSign size={14} />Incidentals</div><div className="mt-2 text-2xl font-black text-slate-950">{money(selectedFamily.unpaidIncidentals.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0))}</div><div className="text-xs text-slate-500">{selectedFamily.unpaidIncidentals.length} unpaid invoice(s)</div></div>
              <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><Utensils size={14} />Lunch</div><div className="mt-2 text-2xl font-black text-slate-950">{money(selectedFamily.lunchAccount.balance)}</div><div className="text-xs text-slate-500">Current lunch account balance</div></div>
              <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><ShieldCheck size={14} />FOS</div><div className="mt-2 text-2xl font-black text-slate-950">{money(selectedFamily.fos.remainingBalance)}</div><div className="text-xs text-slate-500">{selectedFamily.fos.approvedHours} approved hour(s), {selectedFamily.pendingFos.length} pending</div></div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><Users size={14} />Students</div>
                <div className="mt-2 text-lg font-black text-slate-950">{selectedFamily.students.length} {selectedFamily.students.length === 1 ? "student" : "students"}</div>
                <div className="mt-2 grid gap-1">
                  {selectedFamily.students.slice(0, 4).map((student) => (
                    <div key={student.studentId || student.name} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                      <span className="truncate font-semibold text-slate-800">{student.name || "Student"}</span>
                      <span className="shrink-0 font-bold text-slate-500">{student.grade ? `Grade ${student.grade}` : "No grade"}</span>
                    </div>
                  ))}
                  {selectedFamily.students.length > 4 && <div className="text-xs font-semibold text-slate-500">+ {selectedFamily.students.length - 4} more student(s)</div>}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><FileText size={16} className="text-sky-600" />Invoices</div>
                <div className="mt-3 grid gap-2">
                  {[...selectedFamily.incidentalInvoices, ...selectedFamily.tuitionInvoices].slice(0, 10).map((invoice) => (
                    <div key={invoice.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-900">{invoice.invoice?.title || invoice.schoolYear || invoice.familyName}</div>
                          <div className="mt-1 text-xs text-slate-500">{formatDate(invoice.sentAt || invoice.updatedAt || invoice.createdAt)}</div>
                        </div>
                        <StatusPill tone={paymentTone(invoice)}>{invoice.paymentStatus || invoice.status || "Draft"}</StatusPill>
                      </div>
                    </div>
                  ))}
                  {!selectedFamily.incidentalInvoices.length && !selectedFamily.tuitionInvoices.length && <div className="text-sm text-slate-500">No invoice records yet.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><History size={16} className="text-sky-600" />Recent Activity</div>
                <div className="mt-3 grid gap-2">
                  {timeline.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-700">{event.type}</div>
                          <div className="mt-1 text-sm font-bold text-slate-900">{event.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{event.detail}</div>
                        </div>
                        <div className="shrink-0 text-right text-[11px] font-semibold text-slate-500">{formatDate(event.at)}</div>
                      </div>
                    </div>
                  ))}
                  {!timeline.length && <div className="text-sm text-slate-500">No activity records yet.</div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function OfficeRolloverModule({ embedded = false }) {
  const checklist = [
    "Import or replace the new student roster after final enrollment is ready.",
    "Confirm family portal access for returning families and invite new families individually.",
    "Archive old permission slip campaigns and keep signed PDFs available for records.",
    "Create the new FOS school year and review custom family liability amounts.",
    "Publish the first lunch menu for the new school year after prices are confirmed.",
    "Review unpaid incidental balances before carrying balances forward.",
  ];

  const Wrapper = embedded ? "div" : "section";
  return (
    <Wrapper className={embedded ? "" : "mx-auto max-w-[1500px] px-5 py-5"}>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-sky-700"><Clock size={15} />Yearly Rollover</div>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">School Year Rollover Checklist</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          This is a safe planning area for the {FOS_SCHOOL_YEAR} data cycle. Nothing here changes records yet; it keeps the rollover steps visible before we add one-click archive/promote actions.
        </p>
        <div className="mt-5 grid gap-3">
          {checklist.map((item, index) => (
            <div key={item} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-xs font-black text-sky-700">{index + 1}</div>
              <div className="text-sm font-semibold text-slate-800">{item}</div>
            </div>
          ))}
        </div>
      </div>
    </Wrapper>
  );
}

export function OfficeFinanceSettingsModule() {
  return (
    <section className="mx-auto max-w-[1500px] px-5 py-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Office & Finance</div>
        <h2 className="mt-1 text-2xl font-bold text-slate-950">Settings</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-600">Smaller office tools and setup areas live here so the main Office & Finance toolbar stays focused on daily work.</p>
      </div>
      <div className="mt-4">
        <OfficeRolloverModule embedded />
      </div>
    </section>
  );
}

export default FamilyRecordsModule;
