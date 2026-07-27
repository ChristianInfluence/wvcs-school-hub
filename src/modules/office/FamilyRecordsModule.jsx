import { useEffect, useMemo, useState } from "react";
import { Bell, ClipboardCheck, Clock, DollarSign, ExternalLink, FileText, History, Info, Mail, RefreshCw, Save, Search, ShieldCheck, Utensils, Users } from "lucide-react";
import { createDriverAttachmentUrl, fetchFamilyPortalAccessRecords, fetchFosAuditEvents, fetchFosEntries, fetchVolunteerDriverApplications, calculateFosBalance, FOS_SCHOOL_YEAR, reviewVolunteerDriverApplication, sendFamilyPortalInvite } from "../../lib/familyPortalData.js";
import { DEFAULT_FAMILY_PORTAL_SETTINGS, fetchFamilyPortalSettings, saveFamilyPortalSettings } from "../../lib/officeFinanceSettingsData.js";
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
  const directTotal = Number(invoice.total || invoice.invoice?.total || invoice.invoice?.amount || invoice.invoice?.balanceDue || 0);
  if (Number.isFinite(directTotal) && directTotal) return directTotal;
  if (Array.isArray(invoice.invoice?.charges)) {
    return invoice.invoice.charges.reduce((total, charge) => {
      const amount = Number(charge.amount || 0);
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }
  if (Array.isArray(invoice.invoice?.students)) {
    const studentTotal = invoice.invoice.students.reduce((total, student) => {
      const discounts = Array.isArray(student.discounts)
        ? student.discounts.reduce((sum, discount) => sum + Number(discount.amount || 0), 0)
        : 0;
      const discountedTuition = Math.max(Number(student.tuition || 0) - discounts, 0);
      const earlyPayDiscount = discountedTuition * 0.05;
      return total + Math.max(discountedTuition - earlyPayDiscount, 0) + Number(student.comprehensiveFee || 0);
    }, 0);
    return studentTotal + (invoice.invoice.registrationFeePaid ? 0 : Number(invoice.invoice.registrationFee || 0));
  }
  return 0;
}

function invoiceCategory(invoice) {
  const charges = Array.isArray(invoice.invoice?.charges) ? invoice.invoice.charges : [];
  if (charges.length) {
    const labels = charges
      .map((charge) => (charge.category === "Other" ? charge.description : charge.category) || charge.description || "Other")
      .filter(Boolean);
    const unique = [...new Set(labels)];
    if (unique.length <= 2) return unique.join(", ");
    return `${unique[0]} + ${unique.length - 1} more`;
  }
  if (Array.isArray(invoice.invoice?.students)) return "Full-pay Tuition";
  return invoice.invoice?.category || invoice.category || "Invoice";
}

function paymentTone(invoice) {
  const status = String(invoice.paymentStatus || invoice.status || "").toLowerCase();
  if (status.includes("paid")) return "emerald";
  if (status.includes("void") || status.includes("refund")) return "slate";
  if (status.includes("partial")) return "amber";
  return "rose";
}

function normalizeFamilyName(value) {
  return String(value || "").trim().replace(/\s+Family$/i, "").toLowerCase();
}

function familyNamesMatch(a, b) {
  const first = normalizeFamilyName(a);
  const second = normalizeFamilyName(b);
  return Boolean(first && second && first === second);
}

function isVerifiedDriver(application) {
  return application?.status === "Verified" && (!application.expiresAt || application.expiresAt.slice(0, 10) >= today);
}

function driverTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "verified") return "emerald";
  if (value === "denied" || value === "expired") return "rose";
  if (value === "pending") return "amber";
  return "slate";
}

function FamilyRecordsModule({ initialSavedView = "all", currentUserEmail = "" }) {
  const [data, setData] = useState({ loading: true, families: [], tuition: [], incidentals: [], lunch: null, fosEntries: [], access: [], audit: [], driverApplications: [], error: "" });
  const [search, setSearch] = useState("");
  const [selectedFamilyKey, setSelectedFamilyKey] = useState("");
  const [savedView, setSavedView] = useState(initialSavedView || "all");
  const [inviteDrafts, setInviteDrafts] = useState({});
  const [portalLoadingKey, setPortalLoadingKey] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [driverReviewDrafts, setDriverReviewDrafts] = useState({});
  const [driverReviewingId, setDriverReviewingId] = useState("");
  const savedViewLabels = {
    unpaid: "families with unpaid incidental invoices",
    fos: "families with FOS balances or pending FOS hours",
    lunch: "families with negative lunch balances",
    portal: "families without a recorded portal login",
  };

  async function loadData(message = "") {
    setData((current) => ({ ...current, loading: true, error: message }));
    try {
      const [directoryResult, tuitionResult, incidentalResult, lunchResult, fosResult, accessResult, auditResult, driverResult] = await Promise.all([
        fetchOfficeFamilyDirectory(),
        fetchTuitionInvoices(),
        fetchIncidentalInvoices(),
        fetchLunchAdminData(),
        fetchFosEntries(),
        fetchFamilyPortalAccessRecords(),
        fetchFosAuditEvents(120),
        fetchVolunteerDriverApplications(),
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
        driverApplications: driverResult.applications || [],
        error: directoryResult.reason || tuitionResult.reason || incidentalResult.reason || lunchResult.reason || fosResult.reason || accessResult.reason || auditResult.reason || driverResult.reason || "",
      });
      const inviteMap = {};
      (accessResult.access || []).forEach((access) => {
        inviteMap[access.familyKey] = access.contactEmails || [];
      });
      setInviteDrafts((current) => ({ ...inviteMap, ...current }));
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
      const incidentalInvoices = data.incidentals.filter((invoice) => invoice.familyKey === family.familyKey || familyNamesMatch(invoice.familyName, family.familyName));
      const tuitionInvoices = data.tuition.filter((invoice) => invoice.familyKey === family.familyKey || invoice.invoice?.familyKey === family.familyKey || familyNamesMatch(invoice.familyName || invoice.invoice?.familyName, family.familyName));
      const lunchOrders = (data.lunch?.orders || []).filter((order) => order.familyKey === family.familyKey);
      const lunchAccount = accounts.get(family.familyKey) || { balance: 0 };
      const fosEntries = data.fosEntries.filter((entry) => entry.familyKey === family.familyKey);
      const access = accessMap.get(family.familyKey);
      const fos = calculateFosBalance(fosEntries, access || {});
      const unpaidIncidentals = incidentalInvoices.filter((invoice) => !String(invoice.paymentStatus || "").toLowerCase().includes("paid"));
      const pendingFos = fosEntries.filter((entry) => entry.status === "Pending");
      const driverApplications = data.driverApplications.filter((application) => application.familyKey === family.familyKey || familyNamesMatch(application.familyName, family.familyName));
      const verifiedDrivers = driverApplications.filter(isVerifiedDriver);
      const pendingDrivers = driverApplications.filter((application) => application.status === "Pending");
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
        driverApplications,
        verifiedDrivers,
        pendingDrivers,
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
  const selectedInviteRecipients = selectedFamily ? inviteDrafts[selectedFamily.familyKey] || selectedFamily.access?.contactEmails || [] : [];
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

  function toggleInviteRecipient(email) {
    if (!selectedFamily || !email) return;
    setInviteDrafts((current) => {
      const selected = current[selectedFamily.familyKey] || selectedFamily.access?.contactEmails || [];
      const exists = selected.includes(email);
      return {
        ...current,
        [selectedFamily.familyKey]: exists ? selected.filter((item) => item !== email) : [...selected, email],
      };
    });
    setActionStatus("");
  }

  async function sendPortalInvite(family) {
    const recipients = inviteDrafts[family.familyKey] || family.access?.contactEmails || [];
    if (!recipients.length) {
      setActionStatus("Select at least one parent or guardian email before sending a portal invite.");
      return;
    }
    const confirmed = window.confirm(`Send a family portal invite to:\n\n${recipients.join("\n")}`);
    if (!confirmed) return;

    try {
      setPortalLoadingKey(family.familyKey);
      setActionStatus(`Sending family portal invite for ${family.familyName}...`);
      const result = await sendFamilyPortalInvite(family, currentUserEmail, recipients);
      setActionStatus(`Family portal invite sent to ${result.recipients.join(", ")}.`);
      await loadData();
    } catch (error) {
      setActionStatus(`Unable to send family portal invite: ${error.message}`);
    } finally {
      setPortalLoadingKey("");
    }
  }

  async function openDriverAttachment(attachment) {
    try {
      setActionStatus("Opening driver document...");
      const url = await createDriverAttachmentUrl(attachment);
      if (!url) throw new Error("Document link could not be created.");
      window.open(url, "_blank", "noopener,noreferrer");
      setActionStatus("");
    } catch (error) {
      setActionStatus(`Unable to open driver document: ${error.message}`);
    }
  }

  async function reviewDriverApplication(application, action) {
    const confirmed = window.confirm(`${action === "verify" ? "Verify" : "Deny"} volunteer driver application for ${application.parentName || application.parentEmail}?`);
    if (!confirmed) return;
    try {
      setDriverReviewingId(application.id);
      setActionStatus(`${action === "verify" ? "Verifying" : "Denying"} volunteer driver application...`);
      const result = await reviewVolunteerDriverApplication(application.id, {
        action,
        officeNote: driverReviewDrafts[application.id] || "",
      });
      setActionStatus(`Volunteer driver application marked ${result.application?.status || "reviewed"}.`);
      await loadData();
    } catch (error) {
      setActionStatus(`Unable to review driver application: ${error.message}`);
    } finally {
      setDriverReviewingId("");
    }
  }

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
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-16 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-500" placeholder="Search families, parents, students" />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
          {selectedFamily && (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Viewing <span className="font-bold">{selectedFamily.familyName}</span>
            </div>
          )}
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
              <button
                key={family.familyKey}
                type="button"
                onClick={() => {
                  setSelectedFamilyKey(family.familyKey);
                  setSearch("");
                }}
                className={`mb-2 w-full rounded-lg border p-3 text-left transition ${selectedFamily?.familyKey === family.familyKey ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <div className="truncate text-sm font-bold text-slate-950">{family.familyName}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{family.students.map((student) => `${student.name}${student.grade ? ` (${student.grade})` : ""}`).join(", ")}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {family.unpaidIncidentals.length > 0 && <StatusPill tone="rose">{family.unpaidIncidentals.length} unpaid</StatusPill>}
                  {family.pendingFos.length > 0 && <StatusPill tone="amber">{family.pendingFos.length} FOS pending</StatusPill>}
                  {Number(family.lunchAccount.balance || 0) < 0 && <StatusPill tone="amber">Lunch {money(family.lunchAccount.balance)}</StatusPill>}
                  {family.pendingDrivers.length > 0 && <StatusPill tone="amber">{family.pendingDrivers.length} driver pending</StatusPill>}
                  {family.verifiedDrivers.length > 0 && <StatusPill tone="emerald">Driver verified</StatusPill>}
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
                    {selectedFamily.parents.map((parent) => {
                      const parentEmail = String(parent.email || "").toLowerCase();
                      const verified = selectedFamily.verifiedDrivers.find((application) => String(application.parentEmail || "").toLowerCase() === parentEmail);
                      return (
                        <span key={`${parent.email}-${parent.name}`} className="inline-flex flex-wrap items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                          <Mail size={12} />
                          {parent.name || "Parent"} {parent.email ? `· ${parent.email}` : ""}
                          {verified && (
                            <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">
                              <ShieldCheck size={11} />
                              Verified Driver
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 lg:w-[360px]">
                  <div className="font-bold text-slate-900">Portal Access</div>
                  <div className="mt-1">Last login: {formatDate(selectedFamily.access?.lastParentLoginAt)}</div>
                  {selectedFamily.access?.lastParentLoginEmail && <div>User: {selectedFamily.access.lastParentLoginEmail}</div>}
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="font-bold text-slate-900">Send Family Portal Invite</div>
                    <div className="mt-2 grid gap-2">
                      {(selectedFamily.parents || []).filter((parent) => parent.email).map((parent) => {
                        const email = parent.email.toLowerCase();
                        const checked = selectedInviteRecipients.includes(email);
                        return (
                          <label key={email} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-2">
                            <input type="checkbox" checked={checked} onChange={() => toggleInviteRecipient(email)} className="mt-0.5 h-4 w-4 accent-sky-600" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-800">{parent.name || "Parent / Guardian"}</span>
                              <span className="block truncate text-[11px] text-slate-500">{email}</span>
                            </span>
                          </label>
                        );
                      })}
                      {!(selectedFamily.parents || []).some((parent) => parent.email) && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">No parent emails are attached to this family.</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => sendPortalInvite(selectedFamily)}
                      disabled={portalLoadingKey === selectedFamily.familyKey}
                      aria-busy={portalLoadingKey === selectedFamily.familyKey}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Mail size={15} />
                      {portalLoadingKey === selectedFamily.familyKey ? "Sending..." : "Send Invite"}
                    </button>
                    <div className="mt-2 text-[11px] leading-4 text-slate-500">Only checked emails will be authorized for this family portal.</div>
                  </div>
                </div>
              </div>
            </div>
            {actionStatus && <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">{actionStatus}</div>}

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
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><ShieldCheck size={16} className="text-emerald-600" />Volunteer Drivers</div>
                <div className="mt-3 grid gap-2">
                  {selectedFamily.driverApplications.map((application) => (
                    <div key={application.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-bold text-slate-900">{application.parentName || application.parentEmail || "Driver"}</div>
                            <StatusPill tone={driverTone(application.status)}>{application.status}</StatusPill>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            Submitted {formatDate(application.submittedAt)}{application.expiresAt ? ` · Expires ${formatDate(application.expiresAt)}` : ""}
                          </div>
                          {application.officeNote && <div className="mt-1 text-xs text-slate-600">Office note: {application.officeNote}</div>}
                          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                              <div className="font-bold text-slate-900">Driving history</div>
                              <div className="mt-1">Commercial license: {application.application?.commercialLicense || "Not answered"}</div>
                              <div>Accident in last 3 years: {application.application?.accidentLastThreeYears || "Not answered"}</div>
                              <div>Moving violation in last 3 years: {application.application?.movingViolationLastThreeYears || "Not answered"}</div>
                              <div>DWI/DUI or suspension history: {application.application?.duiOrSuspensionHistory || "Not answered"}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                              <div className="font-bold text-slate-900">Driver certification</div>
                              <div className="mt-1">State license: {application.application?.stateLicense || "Not listed"}</div>
                              <div>Requirements acknowledged: {application.application?.driverRequirementsAcknowledged ? "Yes" : "No"}</div>
                              <div>Signed: {application.application?.electronicSignature || "Not signed"}</div>
                              <div>Date: {application.application?.signatureDate || "Not dated"}</div>
                            </div>
                          </div>
                          {(application.application?.accidentExplanation || application.application?.movingViolationExplanation) && (
                            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900">
                              {application.application?.accidentExplanation && <div><span className="font-bold">Accident note:</span> {application.application.accidentExplanation}</div>}
                              {application.application?.movingViolationExplanation && <div><span className="font-bold">Moving violation note:</span> {application.application.movingViolationExplanation}</div>}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(application.attachments || []).map((attachment) => (
                            <button
                              key={attachment.path || attachment.name}
                              type="button"
                              onClick={() => openDriverAttachment(attachment)}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
                            >
                              <ExternalLink size={13} />
                              {attachment.label || "Document"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {application.status === "Pending" && (
                        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 lg:grid-cols-[1fr_auto_auto]">
                          <input
                            value={driverReviewDrafts[application.id] || ""}
                            onChange={(event) => setDriverReviewDrafts((current) => ({ ...current, [application.id]: event.target.value }))}
                            placeholder="Optional office note"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-500"
                          />
                          <button
                            type="button"
                            onClick={() => reviewDriverApplication(application, "verify")}
                            disabled={driverReviewingId === application.id}
                            className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewDriverApplication(application, "deny")}
                            disabled={driverReviewingId === application.id}
                            className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!selectedFamily.driverApplications.length && <div className="text-sm text-slate-500">No volunteer driver applications yet.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><FileText size={16} className="text-sky-600" />Invoices</div>
                <div className="mt-3 grid gap-2">
                  {[...selectedFamily.incidentalInvoices, ...selectedFamily.tuitionInvoices].slice(0, 10).map((invoice) => (
                    <div key={invoice.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-900">{invoice.invoice?.title || invoice.schoolYear || invoice.familyName}</div>
                          <div className="mt-1 text-xs text-slate-500">{formatDate(invoice.sentAt || invoice.updatedAt || invoice.createdAt)}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-bold text-slate-700">{invoiceCategory(invoice)}</span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-800">{money(invoiceBalance(invoice))}</span>
                          </div>
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

function FamilyPortalSettingsPanel({ currentUserEmail = "" }) {
  const [settings, setSettings] = useState(DEFAULT_FAMILY_PORTAL_SETTINGS);
  const [status, setStatus] = useState("Loading family portal settings...");

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const result = await fetchFamilyPortalSettings();
        if (!active) return;
        setSettings(result.settings || DEFAULT_FAMILY_PORTAL_SETTINGS);
        setStatus(result.loaded ? "Family portal settings loaded." : result.reason);
      } catch (error) {
        if (active) setStatus(`Unable to load settings: ${error.message}`);
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  async function saveSettings() {
    setStatus("Saving family portal settings...");
    try {
      const result = await saveFamilyPortalSettings(settings, currentUserEmail);
      setSettings(result.settings || settings);
      setStatus(result.saved ? "Family portal settings saved." : result.reason);
    } catch (error) {
      setStatus(`Unable to save settings: ${error.message}`);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
          <Bell size={16} className="text-sky-600" />
          Family Portal Announcement
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Use this for short parent-facing notices that should appear near the top of the secure family portal.</p>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={settings.announcement.enabled}
            onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, enabled: event.target.checked } })}
            className="h-4 w-4 rounded border-slate-300"
          />
          Show announcement in family portal
        </label>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Banner title
            <input
              value={settings.announcement.title}
              onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, title: event.target.value } })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="Family Portal Announcement"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Banner message
            <textarea
              value={settings.announcement.message}
              onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, message: event.target.value } })}
              rows={4}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-sky-500"
              placeholder="Type the short parent-facing announcement here."
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <Info size={16} className="text-sky-600" />
            Need Help Box
          </div>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Office phone
              <input value={settings.help.phone} onChange={(event) => setSettings({ ...settings, help: { ...settings.help, phone: event.target.value } })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Office email
              <input value={settings.help.email} onChange={(event) => setSettings({ ...settings, help: { ...settings.help, email: event.target.value } })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Help message
              <textarea value={settings.help.message} onChange={(event) => setSettings({ ...settings, help: { ...settings.help, message: event.target.value } })} rows={3} className="rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-sky-500" />
            </label>
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <div className="font-bold">Office note</div>
          Before inviting a family, confirm the contacts in Family Records, especially if only one parent or guardian should have portal access.
        </div>
        <button type="button" onClick={saveSettings} className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700">
          <Save size={16} />
          Save Portal Settings
        </button>
        {status && <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{status}</div>}
      </div>
    </div>
  );
}

function ParentAccessAuditPanel() {
  const [state, setState] = useState({ loading: true, access: [], families: [], error: "" });
  const [search, setSearch] = useState("");

  async function loadAudit() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [accessResult, directoryResult] = await Promise.all([fetchFamilyPortalAccessRecords(), fetchOfficeFamilyDirectory()]);
      setState({
        loading: false,
        access: accessResult.access || [],
        families: directoryResult.families || [],
        error: accessResult.reason || directoryResult.reason || "",
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }

  useEffect(() => {
    loadAudit();
  }, []);

  const familyMap = useMemo(() => new Map(state.families.map((family) => [family.familyKey, family])), [state.families]);
  const rows = state.access
    .map((record) => {
      const family = familyMap.get(record.familyKey);
      return {
        ...record,
        students: family?.students || [],
        parents: family?.parents || [],
        searchText: `${record.familyName} ${(record.contactEmails || []).join(" ")} ${(family?.students || []).map((student) => `${student.name} ${student.grade}`).join(" ")}`.toLowerCase(),
      };
    })
    .filter((row) => !search.trim() || row.searchText.includes(search.trim().toLowerCase()))
    .sort((a, b) => a.familyName.localeCompare(b.familyName, undefined, { sensitivity: "base" }));

  const loggedInCount = state.access.filter((record) => record.lastParentLoginAt).length;
  const missingPortalRecordCount = Math.max(state.families.length - state.access.length, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <ClipboardCheck size={16} className="text-sky-600" />
            Parent Access Audit
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Review which families have portal access, who last signed in, and which contacts are connected.</p>
        </div>
        <button type="button" onClick={loadAudit} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Roster Families</div><div className="mt-1 text-xl font-black text-slate-950">{state.families.length}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Portal Records Created</div><div className="mt-1 text-xl font-black text-slate-950">{state.access.length}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Logged In</div><div className="mt-1 text-xl font-black text-slate-950">{loggedInCount}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Needs Portal Setup</div><div className="mt-1 text-xl font-black text-slate-950">{missingPortalRecordCount}</div></div>
      </div>

      <div className="mt-4 relative">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500" placeholder="Search family, email, student, or grade" />
      </div>
      {state.error && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{state.error}</div>}
      {state.loading && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Loading parent access records...</div>}

      <div className="mt-4 max-h-[560px] overflow-auto rounded-lg border border-slate-200">
        {rows.map((row) => (
          <div key={row.familyKey} className="grid gap-3 border-b border-slate-200 p-3 text-sm last:border-b-0 lg:grid-cols-[220px_1fr_250px]">
            <div>
              <div className="font-bold text-slate-950">{row.familyName}</div>
              <div className="mt-1 text-xs text-slate-500">{row.students.map((student) => `${student.name}${student.grade ? `, grade ${student.grade}` : ""}`).join(" | ") || "No roster students matched"}</div>
            </div>
            <div className="text-xs leading-5 text-slate-600">{(row.contactEmails || []).join(", ") || "No portal emails recorded"}</div>
            <div className="text-xs leading-5 text-slate-600">
              <div className="font-bold text-slate-900">{row.lastParentLoginAt ? "Logged in" : "No login recorded"}</div>
              <div>{formatDate(row.lastParentLoginAt)}</div>
              {row.lastParentLoginEmail && <div>{row.lastParentLoginEmail}</div>}
            </div>
          </div>
        ))}
        {!rows.length && !state.loading && <div className="p-4 text-sm text-slate-500">No parent access records match this search.</div>}
      </div>
    </div>
  );
}

export function OfficeFinanceSettingsModule({ currentUserEmail = "" }) {
  const [settingsView, setSettingsView] = useState("portal");
  const settingsViews = [
    ["portal", "Family Portal Settings"],
    ["audit", "Parent Access Audit"],
    ["rollover", "Yearly Rollover"],
  ];

  return (
    <section className="mx-auto max-w-[1500px] px-5 py-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Office & Finance</div>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Settings</h2>
          <p className="mt-1 text-sm text-slate-600">Setup, parent access review, and year-end tools.</p>
        </div>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          Settings Area
          <select value={settingsView} onChange={(event) => setSettingsView(event.target.value)} className="min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-sky-500">
            {settingsViews.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4">{settingsView === "portal" && <FamilyPortalSettingsPanel currentUserEmail={currentUserEmail} />}</div>
      <div className="mt-4">{settingsView === "audit" && <ParentAccessAuditPanel />}</div>
      <div className="mt-4">{settingsView === "rollover" && <OfficeRolloverModule embedded />}</div>
    </section>
  );
}

export default FamilyRecordsModule;
