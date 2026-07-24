import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Mail, RefreshCw, Search, XCircle } from "lucide-react";
import { fetchOfficeFamilyDirectory } from "../../lib/tuitionBillingData.js";
import {
  DEFAULT_FOS_REMINDER_TEMPLATE,
  FOS_BUYOUT_AMOUNT,
  FOS_HOUR_VALUE,
  calculateFosBalance,
  ensureFamilyPortalAccess,
  fetchFosAuditEvents,
  fetchFamilyPortalAccessRecords,
  fetchFosReminderTemplate,
  fetchFosEntries,
  reviewFosEntry,
  saveFosReminderTemplate,
  sendFamilyFosReminder,
  sendFamilyPortalInvite,
  updateFamilyFosSettings,
} from "../../lib/familyPortalData.js";

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function dateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400 ${props.className || ""}`}
    />
  );
}

function Textarea(props) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400 ${props.className || ""}`}
    />
  );
}

function familyMatches(family, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    family.familyName,
    ...(family.parents || []).flatMap((parent) => [parent.name, parent.email]),
    ...(family.students || []).flatMap((student) => [student.name, student.grade]),
  ].join(" ").toLowerCase().includes(needle);
}

export default function FosAdminModule({ currentUserEmail = "" }) {
  const [entries, setEntries] = useState([]);
  const [families, setFamilies] = useState([]);
  const [status, setStatus] = useState("Loading FOS records...");
  const [filter, setFilter] = useState("Pending");
  const [familySearch, setFamilySearch] = useState("");
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [portalLoadingKey, setPortalLoadingKey] = useState("");
  const [portalAccess, setPortalAccess] = useState({});
  const [liabilityDrafts, setLiabilityDrafts] = useState({});
  const [inviteDrafts, setInviteDrafts] = useState({});
  const [bulkSelectedKeys, setBulkSelectedKeys] = useState([]);
  const [bulkSending, setBulkSending] = useState(false);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [reminderTemplate, setReminderTemplate] = useState(DEFAULT_FOS_REMINDER_TEMPLATE);
  const [familyFilter, setFamilyFilter] = useState("all");
  const [auditEvents, setAuditEvents] = useState([]);
  const [liabilitySaveState, setLiabilitySaveState] = useState("");

  async function loadData({ quiet = false } = {}) {
    try {
      const [entryResult, familyResult, accessResult, templateResult, auditResult] = await Promise.all([
        fetchFosEntries(),
        fetchOfficeFamilyDirectory(),
        fetchFamilyPortalAccessRecords(),
        fetchFosReminderTemplate(),
        fetchFosAuditEvents(),
      ]);
      setEntries(entryResult.entries || []);
      setFamilies(familyResult.families || []);
      const accessMap = {};
      const draftMap = {};
      const inviteMap = {};
      (accessResult.access || []).forEach((access) => {
        accessMap[access.familyKey] = access;
        draftMap[access.familyKey] = String(access.liabilityAmount ?? FOS_BUYOUT_AMOUNT);
        inviteMap[access.familyKey] = access.contactEmails || [];
      });
      setPortalAccess(accessMap);
      setLiabilityDrafts((current) => ({ ...current, ...draftMap }));
      setInviteDrafts((current) => ({ ...inviteMap, ...current }));
      setReminderTemplate(templateResult.template || DEFAULT_FOS_REMINDER_TEMPLATE);
      setAuditEvents(auditResult.events || []);
      if (!quiet) setStatus("FOS records loaded.");
    } catch (error) {
      setStatus(`Unable to load FOS records: ${error.message}`);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => filter === "All" || entry.status === filter),
    [entries, filter]
  );
  function balanceForFamily(family) {
    const access = portalAccess[family.familyKey] || {};
    const familyEntries = entries.filter((entry) => entry.familyKey === family.familyKey);
    const liabilityDraft = liabilityDrafts[family.familyKey];
    return calculateFosBalance(familyEntries, {
      liabilityAmount: liabilityDraft !== undefined ? liabilityDraft : access.liabilityAmount ?? FOS_BUYOUT_AMOUNT,
      hourValue: access.hourValue ?? FOS_HOUR_VALUE,
    });
  }

  const familyResults = useMemo(
    () =>
      families.filter((family) => {
        if (!familyMatches(family, familySearch)) return false;
        const access = portalAccess[family.familyKey];
        const balance = balanceForFamily(family);
        if (familyFilter === "balance") return balance.remainingBalance > 0;
        if (familyFilter === "no-login") return !access?.lastParentLoginAt;
        if (familyFilter === "no-access") return !(access?.contactEmails || []).length;
        if (familyFilter === "reminded") return Boolean(access?.lastFosReminderSentAt);
        return true;
      }),
    [families, familySearch, familyFilter, portalAccess, entries]
  );
  const selectedFamilyEntries = useMemo(
    () => (selectedFamily ? entries.filter((entry) => entry.familyKey === selectedFamily.familyKey) : []),
    [entries, selectedFamily]
  );
  const selectedAccess = selectedFamily ? portalAccess[selectedFamily.familyKey] : null;
  const selectedLiabilityDraft = selectedFamily ? liabilityDrafts[selectedFamily.familyKey] : undefined;
  const selectedLiabilityAmount = Number(selectedLiabilityDraft !== undefined ? selectedLiabilityDraft : selectedAccess?.liabilityAmount ?? FOS_BUYOUT_AMOUNT);
  const selectedBalance = calculateFosBalance(selectedFamilyEntries, {
    liabilityAmount: selectedLiabilityAmount,
    hourValue: selectedAccess?.hourValue ?? FOS_HOUR_VALUE,
  });
  const bulkSelectedFamilies = useMemo(
    () => families.filter((family) => bulkSelectedKeys.includes(family.familyKey)),
    [families, bulkSelectedKeys]
  );
  const bulkEligibleFamilies = useMemo(
    () => bulkSelectedFamilies.filter((family) => (portalAccess[family.familyKey]?.contactEmails || []).length),
    [bulkSelectedFamilies, portalAccess]
  );
  const bulkRecipientCount = useMemo(
    () => bulkEligibleFamilies.reduce((total, family) => total + (portalAccess[family.familyKey]?.contactEmails || []).length, 0),
    [bulkEligibleFamilies, portalAccess]
  );

  async function ensureAccessForFamily(family) {
    try {
      setPortalLoadingKey(family.familyKey);
      setStatus(`Preparing secure family portal access for ${family.familyName}...`);
      const result = await ensureFamilyPortalAccess(family, currentUserEmail);
      setPortalAccess((current) => ({ ...current, [family.familyKey]: result.access }));
      setLiabilityDrafts((current) => ({
        ...current,
        [family.familyKey]: current[family.familyKey] ?? String(result.access.liabilityAmount ?? FOS_BUYOUT_AMOUNT),
      }));
      setInviteDrafts((current) => ({
        ...current,
        [family.familyKey]: current[family.familyKey] || result.access.contactEmails || [],
      }));
      setStatus(`Secure family portal access is ready for ${family.familyName}.`);
      return result.access;
    } catch (error) {
      setStatus(`Unable to prepare family portal access: ${error.message}`);
      return null;
    } finally {
      setPortalLoadingKey("");
    }
  }

  async function sendInvite(family) {
    try {
      const recipients = inviteDrafts[family.familyKey] || [];
      if (!recipients.length) {
        setStatus("Select at least one parent email to invite and authorize.");
        return;
      }
      setPortalLoadingKey(family.familyKey);
      setStatus(`Sending family portal invite for ${family.familyName}...`);
      const result = await sendFamilyPortalInvite(family, currentUserEmail, recipients);
      setStatus(`Family portal invite sent to ${result.recipients.join(", ")}.`);
      await loadData();
    } catch (error) {
      setStatus(`Unable to send family portal invite: ${error.message}`);
    } finally {
      setPortalLoadingKey("");
    }
  }

  async function sendReminder(family) {
    try {
      const recipients = inviteDrafts[family.familyKey] || [];
      if (!recipients.length) {
        setStatus("Select at least one authorized parent email for the reminder.");
        return;
      }
      setPortalLoadingKey(family.familyKey);
      setStatus(`Sending FOS reminder for ${family.familyName}...`);
      const result = await sendFamilyFosReminder(family.familyKey, recipients);
      const sentRecipients = result.results?.[0]?.recipients || result.recipients || [];
      setStatus(`FOS reminder sent to ${sentRecipients.join(", ")}.`);
      await loadData();
    } catch (error) {
      setStatus(`Unable to send FOS reminder: ${error.message}`);
    } finally {
      setPortalLoadingKey("");
    }
  }

  async function sendBulkReminders() {
    const familyKeys = bulkEligibleFamilies.map((family) => family.familyKey);
    if (!familyKeys.length) {
      setStatus("Select at least one family with authorized parent portal access.");
      return;
    }
    const confirmed = window.confirm(
      `Send FOS balance reminders to ${bulkRecipientCount} authorized recipient${bulkRecipientCount === 1 ? "" : "s"} across ${familyKeys.length} famil${familyKeys.length === 1 ? "y" : "ies"}?`
    );
    if (!confirmed) return;

    try {
      setBulkSending(true);
      setStatus(`Sending FOS reminders to ${familyKeys.length} families...`);
      const recipientsByFamily = Object.fromEntries(
        bulkEligibleFamilies.map((family) => [family.familyKey, portalAccess[family.familyKey]?.contactEmails || []])
      );
      const result = await sendFamilyFosReminder(familyKeys, recipientsByFamily);
      const failed = (result.results || []).filter((item) => !item.sent);
      setStatus(
        failed.length
          ? `FOS reminders sent to ${result.sentCount || 0} recipients. ${failed.length} families were skipped because they need authorized portal access.`
          : `FOS reminders sent to ${result.sentCount || 0} recipients.`
      );
      await loadData();
    } catch (error) {
      setStatus(`Unable to send bulk FOS reminders: ${error.message}`);
    } finally {
      setBulkSending(false);
    }
  }

  async function viewAsFamily(family) {
    await ensureAccessForFamily(family);
    window.open(`${window.location.origin}/#/family-portal-preview/${encodeURIComponent(family.familyKey)}`, "_blank", "noopener,noreferrer");
  }

  function selectFamily(family) {
    setSelectedFamily(family);
    setLiabilitySaveState("");
    setInviteDrafts((current) => {
      if (current[family.familyKey]) return current;
      const existingEmails = portalAccess[family.familyKey]?.contactEmails || [];
      return { ...current, [family.familyKey]: existingEmails };
    });
    if (!portalAccess[family.familyKey]) ensureAccessForFamily(family);
  }

  function toggleInviteRecipient(email) {
    if (!selectedFamily || !email) return;
    setInviteDrafts((current) => {
      const selected = current[selectedFamily.familyKey] || [];
      const exists = selected.includes(email);
      return {
        ...current,
        [selectedFamily.familyKey]: exists ? selected.filter((item) => item !== email) : [...selected, email],
      };
    });
  }

  function toggleBulkFamily(familyKey) {
    setBulkSelectedKeys((current) => (current.includes(familyKey) ? current.filter((key) => key !== familyKey) : [...current, familyKey]));
  }

  function selectAllVisibleFamilies() {
    setBulkSelectedKeys((current) => Array.from(new Set([...current, ...familyResults.map((family) => family.familyKey)])));
  }

  function clearBulkFamilies() {
    setBulkSelectedKeys([]);
  }

  async function review(entry, action) {
    const draft = reviewDrafts[entry.id] || {};
    try {
      setStatus(`Recording ${action} for ${entry.familyName}...`);
      await reviewFosEntry(entry.id, {
        action,
        approvedHours: action === "deny" ? 0 : draft.approvedHours || entry.submittedHours,
        officeNote: draft.officeNote || "",
      });
      setStatus("FOS review recorded and family email sent.");
      await loadData();
    } catch (error) {
      setStatus(`Unable to review FOS entry: ${error.message}`);
    }
  }

  function updateDraft(entryId, patch) {
    setReviewDrafts((current) => ({ ...current, [entryId]: { ...(current[entryId] || {}), ...patch } }));
  }

  async function saveLiability() {
    if (!selectedFamily) return;
    const liabilityAmount = Number(liabilityDrafts[selectedFamily.familyKey] || FOS_BUYOUT_AMOUNT);
    if (!Number.isFinite(liabilityAmount) || liabilityAmount < 0) {
      setStatus("Enter a valid FOS liability amount.");
      return;
    }
    try {
      setLiabilitySaveState("Saving...");
      setStatus(`Saving FOS liability for ${selectedFamily.familyName}...`);
      let access = portalAccess[selectedFamily.familyKey];
      if (!access) {
        const result = await ensureFamilyPortalAccess(selectedFamily, currentUserEmail);
        access = result.access;
      }
      const result = await updateFamilyFosSettings(selectedFamily.familyKey, {
        liabilityAmount,
        hourValue: access?.hourValue || FOS_HOUR_VALUE,
      });
      setPortalAccess((current) => ({ ...current, [selectedFamily.familyKey]: result.access }));
      setLiabilityDrafts((current) => ({ ...current, [selectedFamily.familyKey]: String(result.access.liabilityAmount) }));
      setLiabilitySaveState(`Saved ${money(result.access.liabilityAmount)}.`);
      setStatus(`FOS liability saved for ${selectedFamily.familyName}.`);
      await loadData({ quiet: true });
    } catch (error) {
      setLiabilitySaveState("Unable to save.");
      setStatus(`Unable to save FOS liability: ${error.message}`);
    }
  }

  async function saveReminderTemplate() {
    if (!reminderTemplate.subject.trim() || !reminderTemplate.heading.trim() || !reminderTemplate.body.trim()) {
      setStatus("The reminder template needs a subject, heading, and body.");
      return;
    }
    try {
      setStatus("Saving FOS reminder email template...");
      const result = await saveFosReminderTemplate(reminderTemplate, currentUserEmail);
      setReminderTemplate(result.template);
      setStatus("FOS reminder email template saved.");
    } catch (error) {
      setStatus(`Unable to save FOS reminder template: ${error.message}`);
    }
  }

  return (
    <section className="mx-auto max-w-[1500px] px-5 py-5 text-slate-100">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Friends of School</div>
          <h1 className="mt-2 text-2xl font-bold text-white">FOS Tracking</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Families normally owe 50 volunteer hours or a $500 amount. Each approved hour reduces the amount owed by $10, and the annual amount can be adjusted for individual families.
          </p>
        </div>
        <button
          type="button"
          onClick={loadData}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
        >
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {status && <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">{status}</div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          {selectedFamily && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-sm font-bold text-white">{selectedFamily.familyName}</div>
              <div className="mt-2 text-xs text-slate-500">
                Parents sign in at <span className="font-semibold text-slate-300">wvcshub.org/#/family-login</span> using roster-linked email addresses.
              </div>
              <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                selectedAccess?.lastParentLoginAt
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-100"
                  : "border-slate-800 bg-slate-950 text-slate-500"
              }`}>
                {selectedAccess?.lastParentLoginAt ? (
                  <>
                    <span className="font-semibold">Last parent login:</span> {dateTime(selectedAccess.lastParentLoginAt)}
                    {selectedAccess.lastParentLoginEmail ? ` by ${selectedAccess.lastParentLoginEmail}` : ""}
                  </>
                ) : (
                  "No parent login has been recorded for this family yet."
                )}
              </div>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">FOS Settings</div>
                    {liabilitySaveState && (
                      <div className={`mt-1 text-xs ${liabilitySaveState.startsWith("Saved") ? "text-emerald-300" : "text-amber-300"}`}>
                        {liabilitySaveState}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={saveLiability}
                    className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20"
                  >
                    Save
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-semibold">
                  <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-100">
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-emerald-300/70">Approved</span>
                    {selectedBalance.approvedHours}
                  </div>
                  <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-amber-100">
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-amber-300/70">Remain</span>
                    {selectedBalance.remainingHours}
                  </div>
                  <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-2 text-rose-100">
                    <span className="block text-[10px] uppercase tracking-[0.12em] text-rose-300/70">Owed</span>
                    {money(selectedBalance.remainingBalance)}
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-2 text-xs text-slate-400">
                  <span>Annual liability</span>
                  <Input
                    inputMode="decimal"
                    value={liabilityDrafts[selectedFamily.familyKey] ?? String(selectedAccess?.liabilityAmount ?? FOS_BUYOUT_AMOUNT)}
                    onChange={(event) => {
                      setLiabilitySaveState("");
                      setLiabilityDrafts((current) => ({ ...current, [selectedFamily.familyKey]: event.target.value }));
                    }}
                    className="py-1.5 text-xs"
                  />
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Parent Portal Access</div>
                <div className="mt-2 space-y-2">
                  {(selectedFamily.parents || []).filter((parent) => parent.email).map((parent) => {
                    const email = parent.email.toLowerCase();
                    const checked = (inviteDrafts[selectedFamily.familyKey] || []).includes(email);
                    return (
                      <label key={email} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInviteRecipient(email)}
                          className="mt-1 h-4 w-4 accent-sky-500"
                        />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-white">{parent.name || "Parent / Guardian"}</span>
                          <span className="block truncate text-xs text-slate-500">{email}</span>
                        </span>
                      </label>
                    );
                  })}
                  {!(selectedFamily.parents || []).some((parent) => parent.email) && (
                    <div className="text-sm text-slate-500">No parent emails are attached to this family in the roster.</div>
                  )}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Only checked emails will be authorized for this family portal after the invite is sent.
                </div>
              </div>
              <div className="mt-3 grid gap-2">
                <button
                  type="button"
                  onClick={() => sendInvite(selectedFamily)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                >
                  <Mail size={16} />
                  {portalLoadingKey === selectedFamily.familyKey ? "Working..." : "Send Invite to Selected"}
                </button>
                <button
                  type="button"
                  onClick={() => sendReminder(selectedFamily)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20"
                >
                  <Mail size={16} />
                  Send FOS Reminder
                </button>
                <button
                  type="button"
                  onClick={() => viewAsFamily(selectedFamily)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                >
                  <ExternalLink size={16} />
                  View as Family
                </button>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="text-sm font-bold text-white">Family Portal Access</div>
            <label className="relative mt-3 block">
              <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-500" />
              <Input value={familySearch} onChange={(event) => setFamilySearch(event.target.value)} placeholder="Search family" className="pl-9" />
            </label>
            <select
              value={familyFilter}
              onChange={(event) => setFamilyFilter(event.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
            >
              <option value="all">All families</option>
              <option value="balance">Balance owed</option>
              <option value="no-login">No portal login</option>
              <option value="no-access">No authorized access</option>
              <option value="reminded">Reminder sent</option>
            </select>
            <div className="mt-3 max-h-[520px] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950">
              {familyResults.map((family) => (
                <button
                  key={family.familyKey}
                  type="button"
                  onClick={() => selectFamily(family)}
                  className={`flex w-full items-start gap-2 border-b border-slate-800 px-3 py-2 text-left last:border-b-0 hover:bg-slate-800 ${
                    selectedFamily?.familyKey === family.familyKey ? "text-sky-200" : "text-slate-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={bulkSelectedKeys.includes(family.familyKey)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggleBulkFamily(family.familyKey)}
                    className="mt-1 h-4 w-4 shrink-0 accent-amber-500"
                    aria-label={`Select ${family.familyName} for FOS reminder`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-bold">
                      <span className="block min-w-0 flex-1 truncate">{family.familyName}</span>
                      {portalAccess[family.familyKey]?.lastParentLoginAt ? (
                        <span
                          title={`Last login: ${dateTime(portalAccess[family.familyKey].lastParentLoginAt)}${portalAccess[family.familyKey].lastParentLoginEmail ? ` by ${portalAccess[family.familyKey].lastParentLoginEmail}` : ""}`}
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                        >
                          <CheckCircle2 size={12} />
                        </span>
                      ) : (
                        <span
                          title="No parent login recorded yet"
                          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-[10px] font-bold text-slate-500"
                        >
                          -
                        </span>
                      )}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {(family.students || []).map((student) => student.name).join(", ")}
                    </span>
                    <span className="mt-1 flex flex-wrap gap-1 text-[11px]">
                      <span className="rounded border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-rose-100">
                        {money(balanceForFamily(family).remainingBalance)} owed
                      </span>
                      <span className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-slate-400">
                        {portalAccess[family.familyKey]?.lastFosReminderSentAt ? `Reminded ${shortDate(portalAccess[family.familyKey].lastFosReminderSentAt)}` : "No reminder"}
                      </span>
                    </span>
                  </span>
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={selectAllVisibleFamilies}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                Select Visible
              </button>
              <button
                type="button"
                onClick={clearBulkFamilies}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
              >
                Clear
              </button>
            </div>
          </div>

        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="text-sm font-bold text-white">FOS Reminder Center</div>
                <div className="mt-1 text-sm text-slate-400">
                  {bulkSelectedKeys.length} selected family{bulkSelectedKeys.length === 1 ? "" : "ies"} | {bulkEligibleFamilies.length} ready | {bulkRecipientCount} authorized recipient{bulkRecipientCount === 1 ? "" : "s"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setShowTemplateEditor((value) => !value)}
                  className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                >
                  {showTemplateEditor ? "Hide Template" : "Edit Template"}
                </button>
                <button
                  type="button"
                  onClick={sendBulkReminders}
                  disabled={bulkSending || bulkRecipientCount === 0}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Mail size={16} />
                  {bulkSending ? "Sending..." : "Send Bulk Reminders"}
                </button>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
              Bulk reminders only send to parent emails already authorized for the secure family portal. Families without authorized access are skipped until an invite is sent.
            </div>
            {showTemplateEditor && (
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Subject
                    <Input
                      value={reminderTemplate.subject}
                      onChange={(event) => setReminderTemplate((current) => ({ ...current, subject: event.target.value }))}
                      className="mt-1 normal-case tracking-normal"
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    Email Heading
                    <Input
                      value={reminderTemplate.heading}
                      onChange={(event) => setReminderTemplate((current) => ({ ...current, heading: event.target.value }))}
                      className="mt-1 normal-case tracking-normal"
                    />
                  </label>
                </div>
                <label className="mt-3 block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                  Message Body
                  <Textarea
                    rows={8}
                    value={reminderTemplate.body}
                    onChange={(event) => setReminderTemplate((current) => ({ ...current, body: event.target.value }))}
                    className="mt-1 normal-case tracking-normal"
                  />
                </label>
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                      <input
                        type="checkbox"
                        checked={Boolean(reminderTemplate.schedule?.enabled)}
                        onChange={(event) =>
                          setReminderTemplate((current) => ({
                            ...current,
                            schedule: { ...(current.schedule || DEFAULT_FOS_REMINDER_TEMPLATE.schedule), enabled: event.target.checked },
                          }))
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      Save automatic reminder plan
                    </label>
                    <div className="text-xs text-slate-500">Saved only; a background scheduler can be connected later.</div>
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-4">
                    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Frequency
                      <select
                        value={reminderTemplate.schedule?.frequency || "monthly"}
                        onChange={(event) =>
                          setReminderTemplate((current) => ({
                            ...current,
                            schedule: { ...(current.schedule || DEFAULT_FOS_REMINDER_TEMPLATE.schedule), frequency: event.target.value },
                          }))
                        }
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-sky-400"
                      >
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Day
                      <Input
                        inputMode="numeric"
                        value={reminderTemplate.schedule?.dayOfMonth || 1}
                        onChange={(event) =>
                          setReminderTemplate((current) => ({
                            ...current,
                            schedule: { ...(current.schedule || DEFAULT_FOS_REMINDER_TEMPLATE.schedule), dayOfMonth: event.target.value },
                          }))
                        }
                        className="mt-1 normal-case tracking-normal"
                      />
                    </label>
                    <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Skip Days
                      <Input
                        inputMode="numeric"
                        value={reminderTemplate.schedule?.skipRecentlyRemindedDays || 14}
                        onChange={(event) =>
                          setReminderTemplate((current) => ({
                            ...current,
                            schedule: { ...(current.schedule || DEFAULT_FOS_REMINDER_TEMPLATE.schedule), skipRecentlyRemindedDays: event.target.value },
                          }))
                        }
                        className="mt-1 normal-case tracking-normal"
                      />
                    </label>
                    <label className="flex items-center gap-2 self-end rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                      <input
                        type="checkbox"
                        checked={reminderTemplate.schedule?.onlyWithBalance !== false}
                        onChange={(event) =>
                          setReminderTemplate((current) => ({
                            ...current,
                            schedule: { ...(current.schedule || DEFAULT_FOS_REMINDER_TEMPLATE.schedule), onlyWithBalance: event.target.checked },
                          }))
                        }
                        className="h-4 w-4 accent-amber-500"
                      />
                      Balance only
                    </label>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-xs text-slate-500">
                    Variables: {"{familyName}"}, {"{amountOwed}"}, {"{approvedHours}"}, {"{remainingHours}"}, {"{portalLoginUrl}"}
                  </div>
                  <button
                    type="button"
                    onClick={saveReminderTemplate}
                    className="inline-flex items-center justify-center rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                  >
                    Save Template
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-bold text-white">FOS Submissions</div>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
            >
              <option>Pending</option>
              <option>Approved</option>
              <option>Adjusted</option>
              <option>Denied</option>
              <option>All</option>
            </select>
          </div>
          <div className="mt-4 space-y-3">
            {visibleEntries.map((entry) => {
              const draft = reviewDrafts[entry.id] || {};
              return (
                <div key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="grid gap-3 lg:grid-cols-[1fr_110px_100px_110px] lg:items-start">
                    <div>
                      <div className="font-bold text-white">{entry.familyName}</div>
                      <div className="mt-1 text-sm text-slate-300">{entry.activity}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {shortDate(entry.activityDate)} | Submitted by {entry.parentName || entry.parentEmail || "Family"}
                      </div>
                      {entry.notes && <div className="mt-2 text-xs text-slate-400">{entry.notes}</div>}
                    </div>
                    <div className="text-sm text-slate-300">
                      <span className="block text-xs uppercase tracking-[0.12em] text-slate-500">Submitted</span>
                      {entry.submittedHours} hrs
                    </div>
                    <div className="text-sm font-semibold text-sky-200">{entry.status}</div>
                    <Input
                      inputMode="decimal"
                      value={draft.approvedHours ?? (entry.approvedHours || entry.submittedHours)}
                      onChange={(event) => updateDraft(entry.id, { approvedHours: event.target.value })}
                    />
                  </div>
                  <div className="mt-3 grid gap-2 lg:grid-cols-[1fr_auto_auto_auto]">
                    <Input
                      value={draft.officeNote || ""}
                      onChange={(event) => updateDraft(entry.id, { officeNote: event.target.value })}
                      placeholder="Office note for family email"
                    />
                    <button
                      type="button"
                      onClick={() => review(entry, "approve")}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                    >
                      <CheckCircle2 size={16} />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => review(entry, "adjust")}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                    >
                      Adjust
                    </button>
                    <button
                      type="button"
                      onClick={() => review(entry, "deny")}
                      className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/20"
                    >
                      <XCircle size={16} />
                      Deny
                    </button>
                  </div>
                </div>
              );
            })}
            {!visibleEntries.length && <div className="rounded-lg border border-slate-800 bg-slate-950 p-6 text-sm text-slate-500">No FOS submissions match this filter.</div>}
          </div>
        </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-white">FOS Audit History</div>
                <div className="mt-1 text-xs text-slate-500">Recent reminder sends and office review actions.</div>
              </div>
              <button
                type="button"
                onClick={loadData}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                <RefreshCw size={16} />
                Refresh
              </button>
            </div>
            <div className="mt-3 max-h-[280px] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950">
              {auditEvents.map((event) => (
                <div key={event.id} className="border-b border-slate-800 px-3 py-2 text-sm last:border-b-0">
                  <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:justify-between">
                    <div className="font-semibold text-white">{event.familyName || "Family"}</div>
                    <div className="text-xs text-slate-500">{dateTime(event.createdAt)}</div>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {event.eventType === "fos_reminder_sent" ? "Reminder sent" : "Hours reviewed"} by {event.actorEmail || "office"}
                  </div>
                  {!!event.recipientEmails.length && (
                    <div className="mt-1 truncate text-xs text-slate-500">Recipients: {event.recipientEmails.join(", ")}</div>
                  )}
                </div>
              ))}
              {!auditEvents.length && <div className="p-4 text-sm text-slate-500">No FOS audit events have been recorded yet.</div>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
