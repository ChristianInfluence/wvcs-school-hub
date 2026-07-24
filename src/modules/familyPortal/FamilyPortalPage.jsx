import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, DollarSign, ReceiptText, RefreshCw, Send } from "lucide-react";
import { fetchFamilyPortalData, submitFosHours } from "../../lib/familyPortalData.js";

const today = new Date().toISOString().slice(0, 10);

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

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-200">
      {label}
      {children}
    </label>
  );
}

function Stat({ label, value, tone = "white" }) {
  const tones = {
    white: "text-white",
    green: "text-emerald-200",
    amber: "text-amber-200",
    sky: "text-sky-200",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${tones[tone] || tones.white}`}>{value}</div>
    </div>
  );
}

export default function FamilyPortalPage({ token = "" }) {
  const [portal, setPortal] = useState({ loading: true, error: "", data: null });
  const [draft, setDraft] = useState({ parentName: "", parentEmail: "", activityDate: today, activity: "", hours: "", notes: "" });
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function loadPortal() {
    setPortal((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await fetchFamilyPortalData(token);
      if (!result.found) {
        setPortal({ loading: false, error: "This family portal link was not found or is no longer active.", data: null });
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
    loadPortal();
  }, [token]);

  const balance = portal.data?.fos?.balance || {};
  const entries = portal.data?.fos?.entries || [];
  const invoices = useMemo(
    () => [...(portal.data?.invoices?.incidentals || []), ...(portal.data?.invoices?.tuition || [])],
    [portal.data]
  );

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
      await loadPortal();
    } catch (error) {
      setStatus(`Unable to submit hours: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-6xl px-5 py-6">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">WVCS Family Portal</div>
            <h1 className="mt-2 text-3xl font-bold text-white">{portal.data?.family?.familyName || "Family Portal"}</h1>
            <p className="mt-2 text-sm text-slate-400">View FOS progress, invoice history, and family account tools.</p>
          </div>
          <button
            type="button"
            onClick={loadPortal}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>

        {portal.loading && <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">Loading family portal...</div>}
        {portal.error && <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{portal.error}</div>}

        {portal.data && (
          <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_380px]">
            <div className="space-y-5">
              <div className="grid gap-3 md:grid-cols-3">
                <Stat label="Approved Hours" value={balance.approvedHours || 0} tone="green" />
                <Stat label="Remaining Hours" value={balance.remainingHours || 0} tone="amber" />
                <Stat label="Current FOS Balance" value={money(balance.remainingBalance)} tone="sky" />
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Clock size={16} className="text-sky-300" />
                  Submit FOS Hours
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
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
                  <ReceiptText size={16} className="text-sky-300" />
                  Invoice History
                </div>
                <div className="mt-3 space-y-2">
                  {invoices.slice(0, 8).map((invoice) => (
                    <div key={`${invoice.id}-${invoice.schoolYear || invoice.status}`} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
                      <div className="font-semibold text-white">{invoice.schoolYear || "Incidental Invoice"}</div>
                      <div className="mt-1 text-xs text-slate-500">{invoice.paymentStatus || invoice.status} {invoice.total ? `| ${money(invoice.total)}` : ""}</div>
                    </div>
                  ))}
                  {!invoices.length && <div className="text-sm text-slate-500">No invoice history is available yet.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <DollarSign size={16} className="text-emerald-300" />
                  Lunch Balance
                </div>
                <div className="mt-3 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-3 text-sm text-slate-400">
                  Lunch balance and add-funds tools will be added after the family portal and FOS workflow are stable.
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
