import { useEffect, useMemo, useState } from "react";
import { Archive, Download, Eye, FileText, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import {
  deleteLookOfWeekIssue,
  fetchLookOfWeekIssues,
  uploadLookOfWeekIssue,
} from "../../lib/lookOfWeekData.js";

function formatDate(value) {
  if (!value) return "Undated";
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSize(size) {
  if (!size) return "PDF";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function useLookOfWeekStore() {
  const [issues, setIssues] = useState([]);
  const [status, setStatus] = useState("Loading Look of the Week...");

  async function loadIssues() {
    try {
      const result = await fetchLookOfWeekIssues();
      if (!result.loaded) {
        setStatus(result.reason);
        return;
      }
      setIssues(result.issues);
      setStatus("Look of the Week loaded.");
    } catch (error) {
      setStatus(`Unable to load Look of the Week: ${error.message}`);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(loadIssues, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return { issues, setIssues, status, setStatus, loadIssues };
}

export default function LookOfWeekModule() {
  const { issues, status } = useLookOfWeekStore();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const currentIssue = issues[0];
  const archivedIssues = useMemo(() => issues.slice(1), [issues]);

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">Weekly Brief</div>
            <h1 className="mt-2 text-2xl font-bold text-white">Look of the Week</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              View the current weekly events PDF, download a copy, or quietly browse previous weeks.
            </p>
          </div>
          <div className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
            {status}
          </div>
        </div>

        {currentIssue ? (
          <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
            <main className="rounded-lg border border-slate-800 bg-slate-900">
              <div className="flex flex-col gap-3 border-b border-slate-800 p-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xl font-bold text-white">{currentIssue.title}</div>
                  <div className="mt-1 text-sm font-semibold text-orange-200">Week of {formatDate(currentIssue.weekOf)}</div>
                  {currentIssue.notes && <p className="mt-2 text-sm text-slate-400">{currentIssue.notes}</p>}
                </div>
                <a
                  href={currentIssue.pdfUrl}
                  download={currentIssue.fileName}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-orange-400 bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400"
                >
                  <Download size={16} />
                  Download PDF
                </a>
              </div>
              <iframe
                title={currentIssue.title}
                src={currentIssue.pdfUrl}
                className="min-h-[720px] w-full rounded-b-lg border-0 bg-white"
              />
            </main>

            <aside className="space-y-3">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Sparkles size={16} className="text-orange-300" />
                  Current Issue
                </div>
                <div className="mt-4 grid gap-2 text-sm text-slate-400">
                  <div>{currentIssue.fileName}</div>
                  <div>{formatSize(currentIssue.fileSize)}</div>
                  <div>Published {formatDate(currentIssue.weekOf)}</div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900">
                <button
                  type="button"
                  onClick={() => setArchiveOpen((current) => !current)}
                  className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold text-white"
                >
                  <span className="inline-flex items-center gap-2">
                    <Archive size={16} className="text-slate-400" />
                    Archive
                  </span>
                  <span className="text-xs text-slate-500">{archivedIssues.length} previous</span>
                </button>
                {archiveOpen && (
                  <div className="border-t border-slate-800 p-2">
                    {archivedIssues.map((issue) => (
                      <a
                        key={issue.id}
                        href={issue.pdfUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mb-2 block rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm hover:border-orange-400/60"
                      >
                        <div className="font-semibold text-white">{issue.title}</div>
                        <div className="mt-1 text-xs text-slate-500">Week of {formatDate(issue.weekOf)}</div>
                      </a>
                    ))}
                    {!archivedIssues.length && (
                      <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
                        No archived weeks yet.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900 p-8 text-center">
            <FileText size={42} className="mx-auto text-slate-500" />
            <div className="mt-3 text-lg font-semibold text-white">No Look of the Week uploaded yet</div>
            <p className="mt-2 text-sm text-slate-400">Administrators can upload the weekly PDF from Admin.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function AdminLookOfWeekModule() {
  const { issues, setIssues, status, setStatus, loadIssues } = useLookOfWeekStore();
  const [draft, setDraft] = useState({
    title: "",
    weekOf: new Date().toISOString().slice(0, 10),
    notes: "",
    file: null,
  });
  const [pendingDelete, setPendingDelete] = useState(null);

  async function uploadIssue() {
    if (!draft.title.trim() || !draft.weekOf || !draft.file) return;
    try {
      setStatus("Uploading Look of the Week...");
      const result = await uploadLookOfWeekIssue({
        title: draft.title.trim(),
        weekOf: draft.weekOf,
        notes: draft.notes.trim(),
        file: draft.file,
      });

      if (!result.saved) {
        setStatus(result.reason);
        return;
      }

      setDraft({ title: "", weekOf: new Date().toISOString().slice(0, 10), notes: "", file: null });
      setIssues((current) => [result.issue, ...current].sort((a, b) => b.weekOf.localeCompare(a.weekOf)));
      setStatus("Look of the Week uploaded.");
      await loadIssues();
    } catch (error) {
      setStatus(`Unable to upload Look of the Week: ${error.message}`);
    }
  }

  async function removeIssue(issue) {
    try {
      await deleteLookOfWeekIssue(issue);
      setIssues((current) => current.filter((item) => item.id !== issue.id));
      setPendingDelete(null);
      setStatus("Look of the Week removed.");
    } catch (error) {
      setStatus(`Unable to remove Look of the Week: ${error.message}`);
    }
  }

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-300">Administration</div>
          <h1 className="mt-2 text-2xl font-bold text-white">Look of the Week</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Upload the official weekly PDF. The newest week appears first for staff, and older PDFs stay archived.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <aside className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Upload size={16} className="text-orange-300" />
                Upload Weekly PDF
              </div>
            </div>
            <div className="space-y-4 p-4">
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Title
                <input
                  value={draft.title}
                  placeholder="Look of the Week"
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Week Of
                <input
                  type="date"
                  value={draft.weekOf}
                  onChange={(event) => setDraft({ ...draft, weekOf: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Notes
                <textarea
                  value={draft.notes}
                  onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                  className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-orange-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                PDF
                <div className="relative">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    onChange={(event) => setDraft({ ...draft, file: event.target.files?.[0] || null })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                  />
                  <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                    <FileText size={15} />
                    <span className="truncate">{draft.file?.name || "Choose PDF"}</span>
                  </div>
                </div>
              </label>
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-orange-100">
                {status}
              </div>
              <button
                type="button"
                onClick={uploadIssue}
                disabled={!draft.title.trim() || !draft.weekOf || !draft.file}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-orange-400 bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} />
                Publish Look of the Week
              </button>
            </div>
          </aside>

          <main className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Archive size={16} className="text-orange-300" />
                Published Weeks
              </div>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {issues.map((issue, index) => (
                <div key={issue.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{issue.title}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {index === 0 ? "Current" : "Archived"} • Week of {formatDate(issue.weekOf)}
                      </div>
                    </div>
                    <FileText size={18} className="text-slate-500" />
                  </div>
                  <p className="mt-3 min-h-10 text-sm text-slate-400">{issue.notes || issue.fileName}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={issue.pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                    >
                      <Eye size={14} />
                      View
                    </a>
                    <a
                      href={issue.pdfUrl}
                      download={issue.fileName}
                      className="inline-flex items-center gap-2 rounded-lg border border-orange-500/60 bg-orange-500/15 px-3 py-2 text-xs font-semibold text-orange-100 hover:bg-orange-500/25"
                    >
                      <Download size={14} />
                      Download
                    </a>
                    {pendingDelete?.id === issue.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => removeIssue(issue)}
                          className="rounded-lg border border-rose-400 bg-rose-500 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-400"
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(null)}
                          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setPendingDelete(issue)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-200"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {!issues.length && (
                <div className="md:col-span-2 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-center text-sm text-slate-400">
                  No weekly PDFs uploaded yet.
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
