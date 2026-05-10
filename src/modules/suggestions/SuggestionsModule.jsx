import { useEffect, useMemo, useState } from "react";
import html2pdf from "html2pdf.js";
import { CheckCircle2, FileText, Lightbulb, Loader2, Mail, MessageSquareText, Plus, Send, Trash2 } from "lucide-react";
import {
  deleteSuggestion,
  fetchSuggestions,
  saveSuggestion,
  updateSuggestionStatus,
} from "../../lib/suggestionsData.js";
import { sendSuggestionEmail } from "../../lib/suggestionNotifications.js";
import warriorHeadNew from "../../assets/warrior-head-new.png";

const categories = ["General", "Facilities", "Student Life", "Operations", "Curriculum", "Technology"];

const statusLabels = {
  new: "New",
  reviewing: "Reviewing",
  planned: "Planned",
  resolved: "Resolved",
  declined: "Not moving forward",
};

const statusStyles = {
  new: "border-sky-400/50 bg-sky-500/15 text-sky-100",
  reviewing: "border-amber-400/50 bg-amber-500/15 text-amber-100",
  planned: "border-lime-400/50 bg-lime-500/15 text-lime-100",
  resolved: "border-emerald-400/50 bg-emerald-500/15 text-emerald-100",
  declined: "border-slate-600 bg-slate-800 text-slate-200",
};

function formatDate(value) {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function parseEmailList(value) {
  return String(value || "")
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function getSuggestionPdfFileName(suggestion) {
  const title = String(suggestion.title || "suggestion")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `staff-suggestion-${title || suggestion.id}.pdf`;
}

async function blobToBase64(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return String(dataUrl).split(",")[1];
}

async function generateSuggestionPdfBlob(suggestion, note = "") {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#ffffff";
  host.innerHTML = `
    <div style="width: 709px; padding: 24px 30px 34px; box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; color: #020617; background: #ffffff; position: relative; overflow: hidden;">
      <img src="${warriorHeadNew}" alt="" style="position:absolute; left:50%; top:55%; width:360px; transform:translate(-50%, -50%); opacity:0.055; z-index:0;" />
      <div style="position:relative; z-index:1;">
        <header style="display:flex; align-items:center; gap:14px; border-bottom:3px solid #4d7c0f; background:#f8fafc; border-radius:7px 7px 0 0; border:1px solid #cbd5e1; padding:12px 14px;">
          <img src="${warriorHeadNew}" alt="WVCS" style="width:58px; height:58px; object-fit:contain;" />
          <div>
            <div style="font-size:9px; font-weight:700; letter-spacing:1.8px; text-transform:uppercase; color:#64748b;">Willamette Valley Christian School</div>
            <h1 style="margin:4px 0 0; font-size:21px; color:#020617;">Staff Suggestion</h1>
            <div style="margin-top:2px; font-size:11px; color:#475569;">Generated from WVCS School Hub</div>
          </div>
        </header>

        <section style="margin-top:16px; display:grid; grid-template-columns:1fr 1fr; gap:10px; font-size:11px;">
          <div style="border:1px solid #cbd5e1; border-radius:6px; padding:9px; background:#f8fafc;">
            <div style="font-size:8.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b;">Title</div>
            <div style="margin-top:4px; font-size:14px; font-weight:700;">${escapeHtml(suggestion.title)}</div>
          </div>
          <div style="border:1px solid #cbd5e1; border-radius:6px; padding:9px; background:#f8fafc;">
            <div style="font-size:8.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b;">Status</div>
            <div style="margin-top:4px; font-size:14px; font-weight:700;">${escapeHtml(statusLabels[suggestion.status] || suggestion.status)}</div>
          </div>
          <div style="border:1px solid #cbd5e1; border-radius:6px; padding:9px; background:#ffffff;">
            <div style="font-size:8.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b;">Category</div>
            <div style="margin-top:4px;">${escapeHtml(suggestion.category)}</div>
          </div>
          <div style="border:1px solid #cbd5e1; border-radius:6px; padding:9px; background:#ffffff;">
            <div style="font-size:8.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b;">Submitted</div>
            <div style="margin-top:4px;">${escapeHtml(formatDate(suggestion.createdAt))}</div>
          </div>
          <div style="grid-column:1 / -1; border:1px solid #cbd5e1; border-radius:6px; padding:9px; background:#ffffff;">
            <div style="font-size:8.5px; font-weight:700; letter-spacing:1px; text-transform:uppercase; color:#64748b;">Submitted By</div>
            <div style="margin-top:4px;">${escapeHtml(suggestion.submitterEmail || "Unknown")}${suggestion.anonymous ? " (anonymous to staff)" : ""}</div>
          </div>
        </section>

        <section style="margin-top:16px;">
          <h2 style="margin:0; padding-bottom:6px; border-bottom:1px solid #cbd5e1; font-size:15px;">Suggestion</h2>
          <div style="margin-top:8px; min-height:90px; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:11.5px; line-height:1.45; white-space:pre-wrap;">${escapeHtml(suggestion.body)}</div>
        </section>

        <section style="margin-top:16px;">
          <h2 style="margin:0; padding-bottom:6px; border-bottom:1px solid #cbd5e1; font-size:15px;">Administrative Response</h2>
          <div style="margin-top:8px; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:11.5px; line-height:1.45; white-space:pre-wrap;">${escapeHtml(suggestion.adminResponse || "No public admin response entered.")}</div>
        </section>

        <section style="margin-top:16px;">
          <h2 style="margin:0; padding-bottom:6px; border-bottom:1px solid #cbd5e1; font-size:15px;">Attached Note</h2>
          <div style="margin-top:8px; border:1px solid #cbd5e1; border-radius:6px; padding:10px; font-size:11.5px; line-height:1.45; white-space:pre-wrap;">${escapeHtml(note || "No note included.")}</div>
        </section>
      </div>
    </div>
  `;
  document.body.appendChild(host);
  const blob = await html2pdf()
    .set({
      margin: [22, 30, 28, 30],
      filename: getSuggestionPdfFileName(suggestion),
      html2canvas: { scale: 2 },
      jsPDF: { unit: "pt", format: "letter", orientation: "portrait" },
    })
    .from(host.firstElementChild)
    .outputPdf("blob");
  host.remove();
  return blob;
}

function useSuggestionStore() {
  const [suggestions, setSuggestions] = useState([]);
  const [status, setStatus] = useState("Loading suggestions...");

  async function loadSuggestions() {
    try {
      const result = await fetchSuggestions();
      if (!result.loaded) {
        setStatus(result.reason);
        return;
      }
      setSuggestions(result.suggestions);
      setStatus("Suggestions loaded.");
    } catch (error) {
      setStatus(`Unable to load suggestions: ${error.message}`);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(loadSuggestions, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return { suggestions, setSuggestions, status, setStatus, loadSuggestions };
}

function SuggestionCard({ suggestion }) {
  return (
    <article className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-sm font-semibold text-white">{suggestion.title}</div>
          <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
            <span>{suggestion.category}</span>
            <span>{formatDate(suggestion.createdAt)}</span>
            <span>{suggestion.anonymous ? "Anonymous" : suggestion.submitterEmail}</span>
          </div>
        </div>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[suggestion.status]}`}>
          {statusLabels[suggestion.status]}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-slate-300">{suggestion.body}</p>
      {suggestion.adminResponse && (
        <div className="mt-4 rounded-lg border border-lime-500/30 bg-lime-500/10 p-3 text-sm leading-6 text-lime-50">
          {suggestion.adminResponse}
        </div>
      )}
    </article>
  );
}

export default function SuggestionsModule({ currentUserEmail = "" }) {
  const { suggestions, setSuggestions, status, setStatus, loadSuggestions } = useSuggestionStore();
  const [draft, setDraft] = useState({
    title: "",
    category: "General",
    body: "",
    anonymous: false,
  });
  const visibleSuggestions = useMemo(
    () => suggestions.filter((suggestion) => suggestion.status !== "declined"),
    [suggestions]
  );

  async function submitSuggestion() {
    if (!draft.title.trim() || !draft.body.trim()) return;

    const suggestion = {
      id: crypto.randomUUID(),
      title: draft.title.trim(),
      category: draft.category,
      body: draft.body.trim(),
      submitterEmail: currentUserEmail,
      anonymous: draft.anonymous,
      status: "new",
      adminResponse: "",
    };

    try {
      setStatus("Submitting suggestion...");
      const result = await saveSuggestion(suggestion);
      if (!result.saved) {
        setStatus(result.reason);
        return;
      }
      setDraft({ title: "", category: "General", body: "", anonymous: false });
      setSuggestions((current) => [result.suggestion, ...current]);
      setStatus("Suggestion submitted. Thank you.");
      await loadSuggestions();
    } catch (error) {
      setStatus(`Unable to submit suggestion: ${error.message}`);
    }
  }

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-300">Staff Voice</div>
            <h1 className="mt-2 text-2xl font-bold text-white">Suggestions</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Share practical ideas, needs, and improvements. Administrators can review and update the status.
            </p>
          </div>
          <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
            {status}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <aside className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Lightbulb size={16} className="text-lime-300" />
                New Suggestion
              </div>
            </div>
            <div className="space-y-4 p-4">
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Title
                <input
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-lime-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Category
                <select
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-lime-400"
                >
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Suggestion
                <textarea
                  value={draft.body}
                  onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                  className="min-h-36 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-lime-400"
                />
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.anonymous}
                  onChange={(event) => setDraft({ ...draft, anonymous: event.target.checked })}
                />
                Show as anonymous to staff
              </label>
              <button
                type="button"
                onClick={submitSuggestion}
                disabled={!draft.title.trim() || !draft.body.trim()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-lime-400 bg-lime-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} />
                Submit Suggestion
              </button>
            </div>
          </aside>

          <main className="space-y-3">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <MessageSquareText size={16} className="text-lime-300" />
                Recent Suggestions
              </div>
            </div>
            {visibleSuggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} />
            ))}
            {!visibleSuggestions.length && (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900 p-8 text-center text-sm text-slate-400">
                No suggestions have been submitted yet.
              </div>
            )}
          </main>
        </div>
      </div>
    </section>
  );
}

export function AdminSuggestionsModule() {
  const { suggestions, setSuggestions, status, setStatus, loadSuggestions } = useSuggestionStore();
  const [drafts, setDrafts] = useState({});
  const [emailDrafts, setEmailDrafts] = useState({});
  const [sendingId, setSendingId] = useState("");
  const [pendingDelete, setPendingDelete] = useState(null);
  const counts = useMemo(
    () =>
      suggestions.reduce(
        (summary, suggestion) => ({
          ...summary,
          [suggestion.status]: (summary[suggestion.status] || 0) + 1,
        }),
        {}
      ),
    [suggestions]
  );

  async function saveAdminUpdate(suggestion) {
    const patch = drafts[suggestion.id] || {
      status: suggestion.status,
      adminResponse: suggestion.adminResponse,
    };

    try {
      setStatus("Saving suggestion update...");
      const result = await updateSuggestionStatus(suggestion.id, patch);
      if (!result.saved) {
        setStatus(result.reason);
        return;
      }
      setSuggestions((current) => current.map((item) => (item.id === suggestion.id ? result.suggestion : item)));
      setStatus("Suggestion updated.");
      await loadSuggestions();
    } catch (error) {
      setStatus(`Unable to update suggestion: ${error.message}`);
    }
  }

  async function removeSuggestion(suggestion) {
    try {
      await deleteSuggestion(suggestion.id);
      setSuggestions((current) => current.filter((item) => item.id !== suggestion.id));
      setPendingDelete(null);
      setStatus("Suggestion deleted.");
    } catch (error) {
      setStatus(`Unable to delete suggestion: ${error.message}`);
    }
  }

  function getDraft(suggestion) {
    return drafts[suggestion.id] || {
      status: suggestion.status,
      adminResponse: suggestion.adminResponse,
    };
  }

  function getEmailDraft(suggestion) {
    return emailDrafts[suggestion.id] || {
      recipients: "",
      note: "",
    };
  }

  async function emailSuggestion(suggestion) {
    const emailDraft = getEmailDraft(suggestion);
    const recipients = parseEmailList(emailDraft.recipients);
    if (!recipients.length) {
      setStatus("Enter at least one recipient email before sending the suggestion.");
      return;
    }

    setSendingId(suggestion.id);
    try {
      setStatus("Generating suggestion PDF...");
      const pdfBlob = await generateSuggestionPdfBlob(suggestion, emailDraft.note);
      const attachment = {
        filename: getSuggestionPdfFileName(suggestion),
        mimeType: "application/pdf",
        contentBase64: await blobToBase64(pdfBlob),
      };

      setStatus("Sending suggestion email...");
      const result = await sendSuggestionEmail({
        recipients,
        note: emailDraft.note.trim(),
        suggestion: {
          ...suggestion,
          statusLabel: statusLabels[suggestion.status] || suggestion.status,
          createdAt: formatDate(suggestion.createdAt),
        },
        attachment,
      });

      if (!result.sent) {
        throw new Error(result.reason || "Email function did not send the suggestion.");
      }

      setEmailDrafts((current) => ({
        ...current,
        [suggestion.id]: { recipients: "", note: "" },
      }));
      setStatus("Suggestion email sent.");
    } catch (error) {
      setStatus(`Unable to email suggestion: ${error.message}`);
    } finally {
      setSendingId("");
    }
  }

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-lime-300">Administration</div>
          <h1 className="mt-2 text-2xl font-bold text-white">Suggestions</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Review staff suggestions, set a status, and optionally add a short response that staff can see.
          </p>
        </div>

        <div className="mb-5 grid gap-3 md:grid-cols-5">
          {Object.entries(statusLabels).map(([id, label]) => (
            <div key={id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-2xl font-bold text-white">{counts[id] || 0}</div>
              <div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-lime-100">
          {status}
        </div>

        <div className="mt-5 space-y-3">
          {suggestions.map((suggestion) => {
            const draft = getDraft(suggestion);
            return (
              <article key={suggestion.id} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-bold text-white">{suggestion.title}</h2>
                      <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyles[suggestion.status]}`}>
                        {statusLabels[suggestion.status]}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-500">
                      <span>{suggestion.category}</span>
                      <span>{formatDate(suggestion.createdAt)}</span>
                      <span>{suggestion.anonymous ? "Anonymous to staff" : "Visible to staff"}</span>
                      <span>Submitted by: {suggestion.submitterEmail || "Unknown"}</span>
                    </div>
                    <p className="mt-4 text-sm leading-6 text-slate-300">{suggestion.body}</p>
                  </div>

                  <div className="space-y-3">
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      Status
                      <select
                        value={draft.status}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [suggestion.id]: { ...draft, status: event.target.value },
                          }))
                        }
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-lime-400"
                      >
                        {Object.entries(statusLabels).map(([id, label]) => (
                          <option key={id} value={id}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      Admin Response
                      <textarea
                        value={draft.adminResponse}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [suggestion.id]: { ...draft, adminResponse: event.target.value },
                          }))
                        }
                        className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-lime-400"
                      />
                    </label>
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                        <Mail size={15} className="text-lime-300" />
                        Email Suggestion
                      </div>
                      <label className="space-y-1 text-xs font-semibold text-slate-300">
                        Send To
                        <input
                          type="text"
                          value={getEmailDraft(suggestion).recipients}
                          onChange={(event) =>
                            setEmailDrafts((current) => ({
                              ...current,
                              [suggestion.id]: { ...getEmailDraft(suggestion), recipients: event.target.value },
                            }))
                          }
                          placeholder="recipient@wvcs.org"
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-lime-400"
                        />
                        <span className="block text-[11px] font-normal text-slate-500">
                          Separate multiple emails with commas.
                        </span>
                      </label>
                      <label className="mt-3 block space-y-1 text-xs font-semibold text-slate-300">
                        Attached Note
                        <textarea
                          value={getEmailDraft(suggestion).note}
                          onChange={(event) =>
                            setEmailDrafts((current) => ({
                              ...current,
                              [suggestion.id]: { ...getEmailDraft(suggestion), note: event.target.value },
                            }))
                          }
                          placeholder="Optional note to include in the email and PDF."
                          className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-lime-400"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => emailSuggestion(suggestion)}
                        disabled={sendingId === suggestion.id || !parseEmailList(getEmailDraft(suggestion).recipients).length}
                        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-lime-400 bg-lime-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-lime-400 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {sendingId === suggestion.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        {sendingId === suggestion.id ? "Sending..." : "Send PDF Email"}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveAdminUpdate(suggestion)}
                        className="inline-flex items-center gap-2 rounded-lg border border-lime-400 bg-lime-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-lime-400"
                      >
                        <CheckCircle2 size={14} />
                        Save
                      </button>
                      {pendingDelete?.id === suggestion.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => removeSuggestion(suggestion)}
                            className="rounded-lg border border-rose-400 bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-400"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(null)}
                            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setPendingDelete(suggestion)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-200"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          const pdfBlob = await generateSuggestionPdfBlob(suggestion, getEmailDraft(suggestion).note);
                          const url = URL.createObjectURL(pdfBlob);
                          window.open(url, "_blank", "noopener,noreferrer");
                          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                      >
                        <FileText size={14} />
                        Preview PDF
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
          {!suggestions.length && (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900 p-8 text-center text-sm text-slate-400">
              No suggestions have been submitted yet.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
