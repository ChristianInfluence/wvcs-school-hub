import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ExternalLink, Mail, RefreshCw, Search, XCircle } from "lucide-react";
import { fetchOfficeFamilyDirectory } from "../../lib/tuitionBillingData.js";
import {
  FOS_BUYOUT_AMOUNT,
  FOS_HOUR_VALUE,
  calculateFosBalance,
  ensureFamilyPortalAccess,
  fetchFamilyPortalAccessRecords,
  fetchFosEntries,
  reviewFosEntry,
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

  async function loadData() {
    try {
      const [entryResult, familyResult, accessResult] = await Promise.all([fetchFosEntries(), fetchOfficeFamilyDirectory(), fetchFamilyPortalAccessRecords()]);
      setEntries(entryResult.entries || []);
      setFamilies(familyResult.families || []);
      const accessMap = {};
      const draftMap = {};
      const inviteMap = {};
      (accessResult.access || []).forEach((access) => {
        accessMap[access.familyKey] = access;
        draftMap[access.familyKey] = String(access.liabilityAmount || FOS_BUYOUT_AMOUNT);
        inviteMap[access.familyKey] = access.contactEmails || [];
      });
      setPortalAccess(accessMap);
      setLiabilityDrafts((current) => ({ ...draftMap, ...current }));
      setInviteDrafts((current) => ({ ...inviteMap, ...current }));
      setStatus("FOS records loaded.");
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
  const familyResults = useMemo(() => families.filter((family) => familyMatches(family, familySearch)), [families, familySearch]);
  const selectedFamilyEntries = useMemo(
    () => (selectedFamily ? entries.filter((entry) => entry.familyKey === selectedFamily.familyKey) : []),
    [entries, selectedFamily]
  );
  const selectedAccess = selectedFamily ? portalAccess[selectedFamily.familyKey] : null;
  const selectedLiabilityAmount = Number(liabilityDrafts[selectedFamily?.familyKey] || selectedAccess?.liabilityAmount || FOS_BUYOUT_AMOUNT);
  const selectedBalance = calculateFosBalance(selectedFamilyEntries, {
    liabilityAmount: selectedLiabilityAmount,
    hourValue: selectedAccess?.hourValue || FOS_HOUR_VALUE,
  });

  async function ensureAccessForFamily(family) {
    try {
      setPortalLoadingKey(family.familyKey);
      setStatus(`Preparing secure family portal access for ${family.familyName}...`);
      const result = await ensureFamilyPortalAccess(family, currentUserEmail);
      setPortalAccess((current) => ({ ...current, [family.familyKey]: result.access }));
      setLiabilityDrafts((current) => ({
        ...current,
        [family.familyKey]: current[family.familyKey] || String(result.access.liabilityAmount || FOS_BUYOUT_AMOUNT),
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
      setStatus(`FOS reminder sent to ${result.recipients.join(", ")}.`);
    } catch (error) {
      setStatus(`Unable to send FOS reminder: ${error.message}`);
    } finally {
      setPortalLoadingKey("");
    }
  }

  async function viewAsFamily(family) {
    await ensureAccessForFamily(family);
    window.open(`${window.location.origin}/#/family-portal-preview/${encodeURIComponent(family.familyKey)}`, "_blank", "noopener,noreferrer");
  }

  function selectFamily(family) {
    setSelectedFamily(family);
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
      setStatus(`FOS liability saved for ${selectedFamily.familyName}.`);
    } catch (error) {
      setStatus(`Unable to save FOS liability: ${error.message}`);
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
        <div className="space-y-4">
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
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">FOS Settings</div>
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
                    value={liabilityDrafts[selectedFamily.familyKey] ?? String(selectedAccess?.liabilityAmount || FOS_BUYOUT_AMOUNT)}
                    onChange={(event) => setLiabilityDrafts((current) => ({ ...current, [selectedFamily.familyKey]: event.target.value }))}
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
            <div className="mt-3 max-h-[520px] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950">
              {familyResults.map((family) => (
                <button
                  key={family.familyKey}
                  type="button"
                  onClick={() => selectFamily(family)}
                  className={`block w-full border-b border-slate-800 px-3 py-2 text-left last:border-b-0 hover:bg-slate-800 ${
                    selectedFamily?.familyKey === family.familyKey ? "text-sky-200" : "text-slate-200"
                  }`}
                >
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
                </button>
              ))}
            </div>
          </div>

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
      </div>
    </section>
  );
}
