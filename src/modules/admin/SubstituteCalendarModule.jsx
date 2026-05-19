import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, Plus, Trash2, UserCheck } from "lucide-react";
import {
  deleteSubstituteAbsence,
  fetchSubstituteAbsences,
  saveSubstituteAbsence,
} from "../../lib/substituteCalendarData.js";

const STORE_KEY = "wvcs-substitute-calendar-v1";
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const monthFormatter = new Intl.DateTimeFormat([], { month: "long", year: "numeric" });
const dayFormatter = new Intl.DateTimeFormat([], { weekday: "short" });

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getMonthKey(value = getTodayKey()) {
  return value.slice(0, 7);
}

function formatDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function loadLocalAbsences() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveLocalAbsences(absences) {
  localStorage.setItem(STORE_KEY, JSON.stringify(absences));
}

function getMonthDays(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const leadingDays = first.getDay();
  const days = [];

  for (let index = 0; index < leadingDays; index += 1) {
    days.push({ key: `blank-${index}`, date: "", inMonth: false });
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(year, month - 1, day);
    days.push({
      key: date.toISOString().slice(0, 10),
      date: date.toISOString().slice(0, 10),
      inMonth: true,
    });
  }

  return days;
}

function shiftMonth(monthKey, amount) {
  const [year, month] = monthKey.split("-").map(Number);
  const next = new Date(year, month - 1 + amount, 1);
  return next.toISOString().slice(0, 7);
}

function togglePeriod(periods, period) {
  return periods.includes(period)
    ? periods.filter((item) => item !== period)
    : [...periods, period].sort((a, b) => a - b);
}

function getCoveredPeriods(absence) {
  return [...new Set((absence.coverage || []).flatMap((item) => item.periods || []))].sort((a, b) => a - b);
}

function getUncoveredPeriods(absence) {
  const covered = new Set(getCoveredPeriods(absence));
  return (absence.periods || []).filter((period) => !covered.has(period));
}

function PeriodCheckboxes({ selected, onToggle, disabledPeriods = [] }) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {PERIODS.map((period) => {
        const disabled = disabledPeriods.includes(period);
        return (
          <label
            key={period}
            className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-2 text-sm font-semibold ${
              selected.includes(period)
                ? "border-sky-400 bg-sky-500/20 text-sky-100"
                : "border-slate-700 bg-slate-950 text-slate-300"
            } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
          >
            <input
              type="checkbox"
              checked={selected.includes(period)}
              disabled={disabled}
              onChange={() => onToggle(period)}
              className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
            />
            P{period}
          </label>
        );
      })}
    </div>
  );
}

function AbsenceCard({ absence, onAddCoverage, onRemoveCoverage, onDelete }) {
  const uncovered = getUncoveredPeriods(absence);
  const covered = getCoveredPeriods(absence);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{absence.staffName}</div>
          <div className="mt-1 text-xs text-slate-500">
            Gone: {(absence.periods || []).map((period) => `P${period}`).join(", ")}
          </div>
        </div>
        {uncovered.length ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-xs font-bold text-rose-100">
            <AlertTriangle size={12} />
            Needs P{uncovered.join(", P")}
          </span>
        ) : (
          <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-100">
            Covered
          </span>
        )}
      </div>

      {absence.notes && <div className="mt-2 text-xs text-slate-400">{absence.notes}</div>}

      <div className="mt-3 space-y-2">
        {(absence.coverage || []).length ? (
          absence.coverage.map((coverage) => (
            <div key={coverage.id} className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5 text-xs">
              <div>
                <span className="font-bold text-slate-100">{coverage.substituteName}</span>
                <span className="text-slate-500"> · {(coverage.periods || []).map((period) => `P${period}`).join(", ")}</span>
              </div>
              <button
                type="button"
                onClick={() => onRemoveCoverage(absence.id, coverage.id)}
                className="text-slate-500 transition hover:text-rose-200"
                aria-label="Remove substitute coverage"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-rose-500/40 bg-rose-500/10 px-2 py-1.5 text-xs font-semibold text-rose-100">
            No substitute assigned.
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
        <button
          type="button"
          onClick={() => onAddCoverage(absence, uncovered.length ? uncovered : absence.periods)}
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/60 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-bold text-emerald-100 hover:bg-emerald-500/20"
        >
          <UserCheck size={13} />
          Add Substitute
        </button>
        <button
          type="button"
          onClick={() => onDelete(absence.id)}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:border-rose-400 hover:text-rose-200"
        >
          <Trash2 size={13} />
          Delete
        </button>
      </div>

      {covered.length > (absence.periods || []).length && (
        <div className="mt-2 text-xs text-amber-100">Some substitute periods are outside the absence periods.</div>
      )}
    </div>
  );
}

export default function SubstituteCalendarModule() {
  const [absences, setAbsences] = useState(loadLocalAbsences);
  const [monthKey, setMonthKey] = useState(getMonthKey());
  const [status, setStatus] = useState("Loading substitute calendar...");
  const [draft, setDraft] = useState({
    staffName: "",
    absenceDate: getTodayKey(),
    periods: [],
    notes: "",
  });
  const [coverageDraft, setCoverageDraft] = useState(null);

  const monthDays = useMemo(() => getMonthDays(monthKey), [monthKey]);
  const absencesByDate = useMemo(
    () => absences.reduce((map, absence) => {
      map[absence.absenceDate] = [...(map[absence.absenceDate] || []), absence];
      return map;
    }, {}),
    [absences]
  );
  const monthAbsences = absences.filter((absence) => absence.absenceDate.startsWith(monthKey));
  const uncoveredCount = monthAbsences.filter((absence) => getUncoveredPeriods(absence).length).length;

  useEffect(() => {
    async function load() {
      try {
        const result = await fetchSubstituteAbsences();
        if (!result.loaded) {
          setStatus(result.reason);
          return;
        }
        setAbsences(result.absences);
        saveLocalAbsences(result.absences);
        setStatus("Shared substitute calendar loaded.");
      } catch (error) {
        setStatus(`Using local substitute calendar. Shared load failed: ${error.message}`);
      }
    }
    const timeoutId = window.setTimeout(load, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function persist(nextAbsences) {
    setAbsences(nextAbsences);
    saveLocalAbsences(nextAbsences);
  }

  async function addAbsence() {
    if (!draft.staffName.trim() || !draft.absenceDate || !draft.periods.length) {
      setStatus("Enter a staff member, date, and at least one period.");
      return;
    }

    const absence = {
      id: crypto.randomUUID(),
      staffName: draft.staffName.trim(),
      absenceDate: draft.absenceDate,
      periods: draft.periods,
      notes: draft.notes.trim(),
      coverage: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const nextAbsences = [...absences, absence].sort((a, b) => a.absenceDate.localeCompare(b.absenceDate) || a.staffName.localeCompare(b.staffName));
    persist(nextAbsences);
    setMonthKey(getMonthKey(absence.absenceDate));
    setDraft({ staffName: "", absenceDate: draft.absenceDate, periods: [], notes: "" });

    try {
      const result = await saveSubstituteAbsence(absence);
      if (result.saved) setStatus("Absence saved to shared calendar.");
    } catch (error) {
      setStatus(`Saved locally. Shared save failed: ${error.message}`);
    }
  }

  function beginCoverage(absence, defaultPeriods) {
    setCoverageDraft({
      absenceId: absence.id,
      substituteName: "",
      periods: defaultPeriods || [],
      notes: "",
    });
  }

  async function saveCoverage() {
    if (!coverageDraft?.substituteName.trim() || !coverageDraft.periods.length) {
      setStatus("Enter a substitute name and at least one covered period.");
      return;
    }

    const nextAbsences = absences.map((absence) => {
      if (absence.id !== coverageDraft.absenceId) return absence;
      return {
        ...absence,
        coverage: [
          ...(absence.coverage || []),
          {
            id: crypto.randomUUID(),
            substituteName: coverageDraft.substituteName.trim(),
            periods: coverageDraft.periods,
            notes: coverageDraft.notes.trim(),
          },
        ],
        updatedAt: new Date().toISOString(),
      };
    });
    persist(nextAbsences);
    setCoverageDraft(null);
    const updatedAbsence = nextAbsences.find((absence) => absence.id === coverageDraft.absenceId);
    try {
      const result = await saveSubstituteAbsence(updatedAbsence);
      if (result.saved) setStatus("Substitute coverage saved.");
    } catch (error) {
      setStatus(`Saved locally. Shared coverage save failed: ${error.message}`);
    }
  }

  async function removeCoverage(absenceId, coverageId) {
    if (!window.confirm("Remove this substitute coverage?")) return;
    const nextAbsences = absences.map((absence) =>
      absence.id === absenceId
        ? { ...absence, coverage: (absence.coverage || []).filter((coverage) => coverage.id !== coverageId), updatedAt: new Date().toISOString() }
        : absence
    );
    persist(nextAbsences);
    const updatedAbsence = nextAbsences.find((absence) => absence.id === absenceId);
    try {
      const result = await saveSubstituteAbsence(updatedAbsence);
      if (result.saved) setStatus("Substitute coverage removed.");
    } catch (error) {
      setStatus(`Removed locally. Shared update failed: ${error.message}`);
    }
  }

  async function removeAbsence(absenceId) {
    const absence = absences.find((item) => item.id === absenceId);
    if (!window.confirm(`Delete absence for ${absence?.staffName || "this staff member"} on ${absence ? formatDate(absence.absenceDate) : "this date"}?`)) return;
    persist(absences.filter((item) => item.id !== absenceId));
    try {
      const result = await deleteSubstituteAbsence(absenceId);
      if (result.saved) setStatus("Absence deleted.");
    } catch (error) {
      setStatus(`Deleted locally. Shared delete failed: ${error.message}`);
    }
  }

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Administration</div>
            <h1 className="mt-2 text-2xl font-bold text-white">Substitute Calendar</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Track staff absences by school period, assign one or more substitutes, and spot uncovered needs by month.
            </p>
          </div>
          <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
            {status}
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center gap-2 text-sm font-bold text-white">
                <Plus size={16} className="text-sky-300" />
                Add Staff Absence
              </div>
              <div className="space-y-4">
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Staff Member
                  <input
                    value={draft.staffName}
                    onChange={(event) => setDraft({ ...draft, staffName: event.target.value })}
                    placeholder="Teacher or staff name"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Date
                  <input
                    type="date"
                    value={draft.absenceDate}
                    onChange={(event) => setDraft({ ...draft, absenceDate: event.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                  />
                </label>
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-200">Periods Needing Coverage</div>
                  <PeriodCheckboxes
                    selected={draft.periods}
                    onToggle={(period) => setDraft({ ...draft, periods: togglePeriod(draft.periods, period) })}
                  />
                </div>
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Notes
                  <textarea
                    value={draft.notes}
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    placeholder="Optional room, class, or preparation notes"
                    className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400"
                  />
                </label>
                <button
                  type="button"
                  onClick={addAbsence}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-400"
                >
                  <Plus size={16} />
                  Add to Calendar
                </button>
              </div>
            </div>

            {coverageDraft && (
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-emerald-100">
                  <UserCheck size={16} />
                  Add Substitute Coverage
                </div>
                <div className="space-y-4">
                  <label className="space-y-1 text-sm font-medium text-emerald-50">
                    Substitute
                    <input
                      value={coverageDraft.substituteName}
                      onChange={(event) => setCoverageDraft({ ...coverageDraft, substituteName: event.target.value })}
                      placeholder="Substitute name"
                      className="w-full rounded-lg border border-emerald-400/40 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300"
                    />
                  </label>
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-emerald-50">Periods Covered</div>
                    <PeriodCheckboxes
                      selected={coverageDraft.periods}
                      onToggle={(period) => setCoverageDraft({ ...coverageDraft, periods: togglePeriod(coverageDraft.periods, period) })}
                    />
                  </div>
                  <label className="space-y-1 text-sm font-medium text-emerald-50">
                    Notes
                    <input
                      value={coverageDraft.notes}
                      onChange={(event) => setCoverageDraft({ ...coverageDraft, notes: event.target.value })}
                      placeholder="Optional"
                      className="w-full rounded-lg border border-emerald-400/40 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-300"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={saveCoverage} className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-400">
                      Save Coverage
                    </button>
                    <button type="button" onClick={() => setCoverageDraft(null)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </aside>

          <main className="min-w-0 rounded-lg border border-slate-800 bg-slate-900">
            <div className="flex flex-col gap-3 border-b border-slate-800 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-lg font-bold text-white">
                <CalendarDays size={18} className="text-sky-300" />
                {monthFormatter.format(new Date(`${monthKey}-01T12:00:00`))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {uncoveredCount > 0 && (
                  <div className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-100">
                    <AlertTriangle size={14} />
                    {uncoveredCount} uncovered
                  </div>
                )}
                <button type="button" onClick={() => setMonthKey(shiftMonth(monthKey, -1))} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200 hover:bg-slate-800" aria-label="Previous month">
                  <ChevronLeft size={16} />
                </button>
                <button type="button" onClick={() => setMonthKey(getMonthKey())} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">
                  Today
                </button>
                <button type="button" onClick={() => setMonthKey(shiftMonth(monthKey, 1))} className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-200 hover:bg-slate-800" aria-label="Next month">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 border-b border-slate-800 bg-slate-950 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                <div key={day} className="border-r border-slate-800 px-2 py-2 last:border-r-0">{day}</div>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-7">
              {monthDays.map((day) => {
                const dayAbsences = day.date ? absencesByDate[day.date] || [] : [];
                const dayNeedsCoverage = dayAbsences.some((absence) => getUncoveredPeriods(absence).length);
                return (
                  <div
                    key={day.key}
                    className={`min-h-[180px] border-b border-r border-slate-800 p-2 last:border-r-0 ${
                      day.inMonth ? "bg-slate-900" : "hidden bg-slate-950/40 md:block"
                    }`}
                  >
                    {day.inMonth && (
                      <>
                        <div className="mb-2 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-bold text-white">{Number(day.date.slice(-2))}</div>
                            <div className="text-[11px] font-semibold text-slate-500 md:hidden">{dayFormatter.format(new Date(`${day.date}T12:00:00`))}</div>
                          </div>
                          {dayNeedsCoverage && <AlertTriangle size={15} className="text-rose-300" />}
                        </div>
                        <div className="space-y-2">
                          {dayAbsences.map((absence) => (
                            <AbsenceCard
                              key={absence.id}
                              absence={absence}
                              onAddCoverage={beginCoverage}
                              onRemoveCoverage={removeCoverage}
                              onDelete={removeAbsence}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
