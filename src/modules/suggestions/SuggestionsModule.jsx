import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Lightbulb, MessageSquareText, Plus, Trash2 } from "lucide-react";
import {
  deleteSuggestion,
  fetchSuggestions,
  saveSuggestion,
  updateSuggestionStatus,
} from "../../lib/suggestionsData.js";

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
                      <span>{suggestion.anonymous ? "Anonymous to staff" : suggestion.submitterEmail}</span>
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
