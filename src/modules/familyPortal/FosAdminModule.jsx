import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, RefreshCw, Search, XCircle } from "lucide-react";
import { fetchOfficeFamilyDirectory } from "../../lib/tuitionBillingData.js";
import { calculateFosBalance, ensureFamilyPortalAccess, fetchFosEntries, reviewFosEntry } from "../../lib/familyPortalData.js";

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
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

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall back for browsers that block async clipboard writes.
    }
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.left = "-9999px";
  textArea.style.top = "0";
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(textArea);
  }
  return copied;
}

export default function FosAdminModule({ currentUserEmail = "" }) {
  const [entries, setEntries] = useState([]);
  const [families, setFamilies] = useState([]);
  const [status, setStatus] = useState("Loading FOS records...");
  const [filter, setFilter] = useState("Pending");
  const [familySearch, setFamilySearch] = useState("");
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [portalLinks, setPortalLinks] = useState({});

  async function loadData() {
    try {
      const [entryResult, familyResult] = await Promise.all([fetchFosEntries(), fetchOfficeFamilyDirectory()]);
      setEntries(entryResult.entries || []);
      setFamilies(familyResult.families || []);
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
  const selectedBalance = calculateFosBalance(selectedFamilyEntries);

  async function copyPortalLink(family) {
    try {
      setStatus(`Generating family portal link for ${family.familyName}...`);
      const result = await ensureFamilyPortalAccess(family, currentUserEmail);
      const url = `${window.location.origin}/#/family-portal/${encodeURIComponent(result.access.publicToken)}`;
      setPortalLinks((current) => ({ ...current, [family.familyKey]: url }));
      const copied = await copyTextToClipboard(url);
      setStatus(
        copied
          ? `Family portal link copied for ${family.familyName}.`
          : `Family portal link generated for ${family.familyName}. Select the link below to copy it.`
      );
    } catch (error) {
      setStatus(`Unable to copy family portal link: ${error.message}`);
    }
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

  return (
    <section className="mx-auto max-w-[1500px] px-5 py-5 text-slate-100">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Friends of School</div>
          <h1 className="mt-2 text-2xl font-bold text-white">FOS Tracking</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Families owe 50 volunteer hours or a $500 balance. Each approved hour reduces the balance by $10.
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
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="text-sm font-bold text-white">Family Portal Links</div>
            <label className="relative mt-3 block">
              <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-500" />
              <Input value={familySearch} onChange={(event) => setFamilySearch(event.target.value)} placeholder="Search family" className="pl-9" />
            </label>
            <div className="mt-3 max-h-[520px] overflow-y-auto rounded-lg border border-slate-800 bg-slate-950">
              {familyResults.map((family) => (
                <button
                  key={family.familyKey}
                  type="button"
                  onClick={() => setSelectedFamily(family)}
                  className={`block w-full border-b border-slate-800 px-3 py-2 text-left last:border-b-0 hover:bg-slate-800 ${
                    selectedFamily?.familyKey === family.familyKey ? "text-sky-200" : "text-slate-200"
                  }`}
                >
                  <span className="block truncate text-sm font-bold">{family.familyName}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {(family.students || []).map((student) => student.name).join(", ")}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {selectedFamily && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-sm font-bold text-white">{selectedFamily.familyName}</div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-semibold">
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-emerald-100">
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-emerald-300/70">Approved</span>
                  {selectedBalance.approvedHours}
                </div>
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-amber-100">
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-amber-300/70">Remaining</span>
                  {selectedBalance.remainingHours}
                </div>
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-2 text-sky-100">
                  <span className="block text-[10px] uppercase tracking-[0.12em] text-sky-300/70">Balance</span>
                  {money(selectedBalance.remainingBalance)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyPortalLink(selectedFamily)}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
              >
                <Copy size={16} />
                Copy Family Portal Link
              </button>
              {portalLinks[selectedFamily.familyKey] && (
                <input
                  readOnly
                  onFocus={(event) => event.target.select()}
                  value={portalLinks[selectedFamily.familyKey]}
                  className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-400"
                />
              )}
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
      </div>
    </section>
  );
}
