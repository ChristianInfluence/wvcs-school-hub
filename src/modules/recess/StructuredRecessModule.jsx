import { useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  History,
  Plus,
  Trash2,
  Users,
} from "lucide-react";

const STORE_KEY = "wvcs-structured-recess-v1";

const recessOptions = {
  early: {
    label: "Early Recess",
    durations: [5, 10, 15, "ALL"],
    tone: "border-sky-400 bg-sky-500/15 text-sky-100",
  },
  both: {
    label: "Both Recesses",
    durations: [5, 10, 15, "ALL"],
    tone: "border-emerald-400 bg-emerald-500/15 text-emerald-100",
  },
  lunch: {
    label: "Lunch Recess",
    durations: [5, 10, 15, "ALL"],
    tone: "border-amber-400 bg-amber-500/15 text-amber-100",
  },
};

const defaultEntries = [
  {
    id: "sr-demo-1",
    date: getTodayKey(),
    studentName: "Sample Student",
    teacherName: "Mrs. Teacher",
    recessType: "early",
    duration: 10,
    notes: "Stay with aide near benches.",
    status: "active",
    createdAt: new Date().toISOString(),
  },
];

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function loadEntries() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return saved ? JSON.parse(saved) : defaultEntries;
  } catch {
    return defaultEntries;
  }
}

function saveEntries(entries) {
  localStorage.setItem(STORE_KEY, JSON.stringify(entries));
}

function formatDuration(duration) {
  return duration === "ALL" ? "ALL" : `${duration} minutes`;
}

function EmptyState({ children }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-400">
      {children}
    </div>
  );
}

function RecessBadge({ type }) {
  const option = recessOptions[type];
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${option.tone}`}>
      {option.label}
    </span>
  );
}

function EntryCard({ entry, onComplete, onDelete }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{entry.studentName}</div>
          <div className="mt-1 text-sm text-slate-400">Placed by {entry.teacherName}</div>
        </div>
        <RecessBadge type={entry.recessType} />
      </div>

      <div className="mt-4 grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
          <Clock size={15} className="text-sky-300" />
          {formatDuration(entry.duration)}
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
          <CalendarDays size={15} className="text-sky-300" />
          {formatDate(entry.date)}
        </div>
      </div>

      {entry.notes && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
          {entry.notes}
        </div>
      )}

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
        {entry.status !== "complete" && (
          <button
            type="button"
            onClick={() => onComplete(entry.id)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-400 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
          >
            <CheckCircle2 size={14} />
            Mark Complete
          </button>
        )}
        <button
          type="button"
          onClick={() => onDelete(entry.id)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-200"
        >
          <Trash2 size={14} />
          Remove
        </button>
      </div>
    </div>
  );
}

function AideCompactRow({ entry, staged, onStageChange }) {
  return (
    <div
      className={`grid gap-3 border-b border-slate-800 px-3 py-2 text-sm transition last:border-b-0 md:grid-cols-[32px_1fr_76px] md:items-center ${
        staged ? "bg-emerald-500/10 text-slate-300" : "bg-slate-950 hover:bg-slate-900"
      }`}
    >
      <input
        type="checkbox"
        checked={staged}
        onChange={(event) => onStageChange(entry.id, event.target.checked)}
        className="mt-1 h-5 w-5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-400 md:mt-0"
        aria-label={`Select ${entry.studentName} for completion`}
      />
      <div>
        <div className={`font-semibold ${staged ? "text-emerald-100" : "text-white"}`}>{entry.studentName}</div>
        <div className="text-xs text-slate-500">
          {entry.teacherName}
          {entry.notes ? ` • ${entry.notes}` : ""}
        </div>
      </div>
      <div className="text-right text-sm font-bold text-slate-100">{formatDuration(entry.duration)}</div>
    </div>
  );
}

function AideRecessColumn({ type, entries, stagedCompleteIds, onStageChange }) {
  const sortedEntries = [...entries].sort((a, b) => a.studentName.localeCompare(b.studentName));
  const option = recessOptions[type];

  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className={`border-b px-4 py-3 ${option.tone}`}>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-bold text-white">{option.label}</h3>
          <span className="text-sm font-semibold">{entries.length}</span>
        </div>
      </div>
      {sortedEntries.length ? (
        sortedEntries.map((entry) => (
          <AideCompactRow
            key={entry.id}
            entry={entry}
            staged={stagedCompleteIds.includes(entry.id)}
            onStageChange={onStageChange}
          />
        ))
      ) : (
        <div className="p-4 text-sm text-slate-500">No students listed.</div>
      )}
    </section>
  );
}

function AideCompactView({ entries, stagedCompleteIds, onStageChange, onConfirmComplete }) {
  const groupedEntries = {
    early: entries.filter((entry) => entry.recessType === "early"),
    both: entries.filter((entry) => entry.recessType === "both"),
    lunch: entries.filter((entry) => entry.recessType === "lunch"),
  };

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-800 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <CheckCircle2 size={16} className="text-emerald-300" />
            Aide View
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Compact checklist for today&apos;s structured recess students.
          </p>
        </div>
        <div className="text-sm font-semibold text-slate-300">
          {entries.length} active student{entries.length === 1 ? "" : "s"}
        </div>
      </div>

      {entries.length ? (
        <>
          <div className="grid gap-4 p-4 xl:grid-cols-3">
            {["early", "both", "lunch"].map((type) => (
              <AideRecessColumn
                key={type}
                type={type}
                entries={groupedEntries[type]}
                stagedCompleteIds={stagedCompleteIds}
                onStageChange={onStageChange}
              />
            ))}
          </div>
          <div className="flex flex-col gap-2 border-t border-slate-800 bg-slate-900 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-slate-400">
              {stagedCompleteIds.length} selected for completion.
            </div>
            <button
              type="button"
              disabled={!stagedCompleteIds.length}
              onClick={onConfirmComplete}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-400 bg-emerald-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 size={16} />
              Confirm Complete
            </button>
          </div>
        </>
      ) : (
        <div className="p-4">
          <EmptyState>No active structured recess students for today.</EmptyState>
        </div>
      )}
    </div>
  );
}

export default function StructuredRecessModule({ initialView = "full" }) {
  const [entries, setEntries] = useState(loadEntries);
  const [historyDate, setHistoryDate] = useState(getTodayKey());
  const [stagedCompleteIds, setStagedCompleteIds] = useState([]);
  const [viewMode, setViewMode] = useState(initialView);
  const [draft, setDraft] = useState({
    studentName: "",
    teacherName: "",
    recessType: "early",
    duration: 10,
    notes: "",
  });

  const today = getTodayKey();
  const todayEntries = useMemo(
    () => entries.filter((entry) => entry.date === today && entry.status !== "complete"),
    [entries, today]
  );
  const historyEntries = useMemo(
    () => entries.filter((entry) => entry.date === historyDate),
    [entries, historyDate]
  );
  const earlyEntries = todayEntries.filter((entry) => entry.recessType === "early");
  const bothEntries = todayEntries.filter((entry) => entry.recessType === "both");
  const lunchEntries = todayEntries.filter((entry) => entry.recessType === "lunch");
  const logDates = [...new Set(entries.map((entry) => entry.date))].sort().reverse();
  const durationOptions = recessOptions[draft.recessType].durations;

  function persist(nextEntries) {
    setEntries(nextEntries);
    saveEntries(nextEntries);
  }

  function addEntry() {
    if (!draft.studentName.trim() || !draft.teacherName.trim()) return;
    const entry = {
      id: crypto.randomUUID(),
      date: today,
      studentName: draft.studentName.trim(),
      teacherName: draft.teacherName.trim(),
      recessType: draft.recessType,
      duration: draft.duration === "ALL" ? "ALL" : Number(draft.duration),
      notes: draft.notes.trim(),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    persist([entry, ...entries]);
    setHistoryDate(today);
    setDraft((current) => ({ ...current, studentName: "", notes: "" }));
  }

  function updateStatus(entryId, status) {
    persist(entries.map((entry) => (entry.id === entryId ? { ...entry, status } : entry)));
    if (status === "complete") {
      setStagedCompleteIds((current) => current.filter((id) => id !== entryId));
    }
  }

  function stageCompletion(entryId, staged) {
    setStagedCompleteIds((current) =>
      staged ? [...new Set([...current, entryId])] : current.filter((id) => id !== entryId)
    );
  }

  function confirmStagedComplete() {
    if (!stagedCompleteIds.length) return;
    persist(
      entries.map((entry) =>
        stagedCompleteIds.includes(entry.id) ? { ...entry, status: "complete" } : entry
      )
    );
    setStagedCompleteIds([]);
  }

  function removeEntry(entryId) {
    persist(entries.filter((entry) => entry.id !== entryId));
  }

  function setRecessType(recessType) {
    const nextDurations = recessOptions[recessType].durations;
    setDraft((current) => ({
      ...current,
      recessType,
      duration: nextDurations.includes(current.duration) || nextDurations.includes(Number(current.duration))
        ? current.duration
        : nextDurations[0],
    }));
  }

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              Elementary Recess
            </div>
            <h1 className="mt-2 text-2xl font-bold text-white">Structured Recess Board</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Teachers can add students for today. Recess aides can see who needs structured recess, which recess, and for how long.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-4 gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-center">
              <div>
                <div className="text-2xl font-bold text-white">{todayEntries.length}</div>
                <div className="text-xs text-slate-500">Current</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-sky-200">{earlyEntries.length}</div>
                <div className="text-xs text-slate-500">Early</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-emerald-200">{bothEntries.length}</div>
                <div className="text-xs text-slate-500">Both</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-amber-200">{lunchEntries.length}</div>
                <div className="text-xs text-slate-500">Lunch</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setViewMode(viewMode === "aide" ? "full" : "aide")}
              className="rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/25"
            >
              {viewMode === "aide" ? "Show Full Structured Recess Board" : "Open Aide View Only"}
            </button>
          </div>
        </div>

        {viewMode === "aide" ? (
          <AideCompactView
            entries={todayEntries}
            stagedCompleteIds={stagedCompleteIds}
            onStageChange={stageCompletion}
            onConfirmComplete={confirmStagedComplete}
          />
        ) : (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Plus size={16} className="text-sky-300" />
                  Add Student for Today
                </div>
              </div>
              <div className="space-y-4 p-4">
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Student Name
                  <input
                    value={draft.studentName}
                    onChange={(event) => setDraft({ ...draft, studentName: event.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                </label>

                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Teacher Placing Student
                  <input
                    value={draft.teacherName}
                    onChange={(event) => setDraft({ ...draft, teacherName: event.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                </label>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-200">Structured Recess</div>
                  <div className="grid gap-2">
                    {Object.entries(recessOptions).map(([id, option]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setRecessType(id)}
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                          draft.recessType === id
                            ? option.tone
                            : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Length
                  <select
                    value={draft.duration}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        duration: event.target.value === "ALL" ? "ALL" : Number(event.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  >
                    {durationOptions.map((duration) => (
                      <option key={duration} value={duration}>
                        {formatDuration(duration)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Notes for Aide
                  <textarea
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                </label>

                <button
                  type="button"
                  onClick={addEntry}
                  disabled={!draft.studentName.trim() || !draft.teacherName.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={16} />
                  Add to Today&apos;s Board
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                <History size={16} className="text-sky-300" />
                Past Day Logs
              </div>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                View Date
                <select
                  value={historyDate}
                  onChange={(event) => setHistoryDate(event.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                >
                  {[today, ...logDates.filter((date) => date !== today)].map((date) => (
                    <option key={date} value={date}>
                      {formatDate(date)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-3 text-sm text-slate-400">
                {historyEntries.length} entr{historyEntries.length === 1 ? "y" : "ies"} logged for this date.
              </div>
            </div>
          </aside>

          <main className="space-y-5">
            <AideCompactView
              entries={todayEntries}
              stagedCompleteIds={stagedCompleteIds}
              onStageChange={stageCompletion}
              onConfirmComplete={confirmStagedComplete}
            />

            <div className="rounded-lg border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Users size={16} className="text-sky-300" />
                  Current Structured Recess: {formatDate(today)}
                </div>
              </div>

              <div className="grid gap-4 p-4 xl:grid-cols-3">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Early Recess</h2>
                    <span className="text-sm text-slate-500">{earlyEntries.length} students</span>
                  </div>
                  {earlyEntries.length ? (
                    earlyEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        onComplete={(id) => updateStatus(id, "complete")}
                        onDelete={removeEntry}
                      />
                    ))
                  ) : (
                    <EmptyState>No students currently listed for early recess.</EmptyState>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Both Recesses</h2>
                    <span className="text-sm text-slate-500">{bothEntries.length} students</span>
                  </div>
                  {bothEntries.length ? (
                    bothEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        onComplete={(id) => updateStatus(id, "complete")}
                        onDelete={removeEntry}
                      />
                    ))
                  ) : (
                    <EmptyState>No students currently listed for both recesses.</EmptyState>
                  )}
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Lunch Recess</h2>
                    <span className="text-sm text-slate-500">{lunchEntries.length} students</span>
                  </div>
                  {lunchEntries.length ? (
                    lunchEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        onComplete={(id) => updateStatus(id, "complete")}
                        onDelete={removeEntry}
                      />
                    ))
                  ) : (
                    <EmptyState>No students currently listed for lunch recess.</EmptyState>
                  )}
                </section>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <History size={16} className="text-sky-300" />
                  Log for {formatDate(historyDate)}
                </div>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {historyEntries.length ? (
                  historyEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onComplete={(id) => updateStatus(id, "complete")}
                      onDelete={removeEntry}
                    />
                  ))
                ) : (
                  <div className="md:col-span-2">
                    <EmptyState>No structured recess entries logged for this date.</EmptyState>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
        )}
      </div>
    </section>
  );
}
