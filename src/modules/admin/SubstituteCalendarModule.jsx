import { useEffect, useMemo, useState } from "react";
import html2pdf from "html2pdf.js";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, FileText, Pencil, Plus, Trash2, UserCheck } from "lucide-react";
import {
  deleteSubstituteAbsence,
  fetchSubstituteAbsences,
  saveSubstituteAbsence,
} from "../../lib/substituteCalendarData.js";
import warriorHeadNew from "../../assets/warrior-head-new.png";

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

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function getPrintMonthDays(monthKey) {
  const days = getMonthDays(monthKey);
  const trailingCount = days.length % 7 === 0 ? 0 : 7 - (days.length % 7);
  return [
    ...days,
    ...Array.from({ length: trailingCount }, (_, index) => ({ key: `print-blank-${index}`, date: "", inMonth: false })),
  ];
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

function formatPeriodRange(periods = []) {
  const sorted = [...new Set(periods)].sort((a, b) => a - b);
  if (!sorted.length) return "No periods";
  const ranges = [];
  let start = sorted[0];
  let previous = sorted[0];

  sorted.slice(1).forEach((period) => {
    if (period === previous + 1) {
      previous = period;
      return;
    }
    ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = period;
    previous = period;
  });
  ranges.push(start === previous ? `${start}` : `${start}-${previous}`);
  return ranges.join(", ");
}

function getCoveredPeriods(absence) {
  return [...new Set((absence.coverage || []).flatMap((item) => item.periods || []))].sort((a, b) => a - b);
}

function getUncoveredPeriods(absence) {
  const covered = new Set(getCoveredPeriods(absence));
  return (absence.periods || []).filter((period) => !covered.has(period));
}

function getSubstituteCalendarPdfFileName(monthKey) {
  return `wvcs-substitute-calendar-${monthKey}.pdf`;
}

function buildPdfAbsenceLine(absence) {
  const uncovered = getUncoveredPeriods(absence);
  const substituteText = (absence.coverage || []).length
    ? (absence.coverage || [])
      .map((coverage) => `${coverage.substituteName} P${formatPeriodRange(coverage.periods)}`)
      .join("; ")
    : "No substitute";
  return `
    <div class="entry ${uncovered.length ? "needs" : "covered"}">
      <div class="teacher">${escapeHtml(absence.staffName)}</div>
      <div class="periods">Absent P${escapeHtml(formatPeriodRange(absence.periods))}</div>
      <div class="sub">${escapeHtml(substituteText)}</div>
      ${uncovered.length ? `<div class="uncovered">Needs P${escapeHtml(formatPeriodRange(uncovered))}</div>` : ""}
    </div>
  `;
}

async function generateSubstituteCalendarPdfBlob({ monthKey, absencesByDate, monthAbsences }) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#ffffff";
  const printableDays = getPrintMonthDays(monthKey);
  const uncoveredCount = monthAbsences.filter((absence) => getUncoveredPeriods(absence).length).length;
  const monthTitle = monthFormatter.format(new Date(`${monthKey}-01T12:00:00`));

  host.innerHTML = `
    <div class="sub-calendar-pdf">
      <style>
        .sub-calendar-pdf {
          width: 1040px;
          min-height: 760px;
          box-sizing: border-box;
          padding: 22px 24px 18px;
          color: #0f172a;
          background: #ffffff;
          font-family: Arial, Helvetica, sans-serif;
          position: relative;
          overflow: hidden;
        }
        .sub-calendar-pdf .watermark {
          position: absolute;
          left: 50%;
          top: 55%;
          width: 420px;
          transform: translate(-50%, -50%);
          opacity: 0.045;
          z-index: 0;
        }
        .sub-calendar-pdf .content {
          position: relative;
          z-index: 1;
        }
        .sub-calendar-pdf header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          border: 1px solid #cbd5e1;
          border-bottom: 4px solid #475569;
          background: #f8fafc;
          border-radius: 8px 8px 0 0;
          padding: 10px 14px;
        }
        .sub-calendar-pdf .brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .sub-calendar-pdf .logo {
          width: 54px;
          height: 54px;
          object-fit: contain;
        }
        .sub-calendar-pdf .school {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.5px;
          text-transform: uppercase;
          color: #64748b;
        }
        .sub-calendar-pdf h1 {
          margin: 3px 0 0;
          font-size: 24px;
          color: #020617;
        }
        .sub-calendar-pdf .meta {
          text-align: right;
          font-size: 10px;
          line-height: 1.35;
          color: #475569;
        }
        .sub-calendar-pdf .stats {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 8px;
          font-size: 10px;
        }
        .sub-calendar-pdf .stat {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #ffffff;
          padding: 7px 9px;
        }
        .sub-calendar-pdf .stat strong {
          display: block;
          margin-top: 2px;
          font-size: 15px;
          color: #020617;
        }
        .sub-calendar-pdf .weekday-row,
        .sub-calendar-pdf .calendar {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
        }
        .sub-calendar-pdf .weekday-row {
          margin-top: 10px;
          border: 1px solid #cbd5e1;
          border-bottom: 0;
          background: #e2e8f0;
          color: #334155;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1px;
          text-align: center;
          text-transform: uppercase;
        }
        .sub-calendar-pdf .weekday-row div {
          padding: 5px 3px;
          border-right: 1px solid #cbd5e1;
        }
        .sub-calendar-pdf .weekday-row div:last-child {
          border-right: 0;
        }
        .sub-calendar-pdf .calendar {
          border-left: 1px solid #cbd5e1;
          border-top: 1px solid #cbd5e1;
        }
        .sub-calendar-pdf .day {
          height: ${printableDays.length > 35 ? "86px" : "103px"};
          border-right: 1px solid #cbd5e1;
          border-bottom: 1px solid #cbd5e1;
          background: rgba(255, 255, 255, 0.92);
          padding: 4px;
          box-sizing: border-box;
          overflow: hidden;
        }
        .sub-calendar-pdf .day.blank {
          background: rgba(241, 245, 249, 0.72);
        }
        .sub-calendar-pdf .date {
          margin-bottom: 2px;
          font-size: 10px;
          font-weight: 800;
          color: #0f172a;
        }
        .sub-calendar-pdf .entry {
          margin-top: 2px;
          border: 1px solid #cbd5e1;
          border-left-width: 3px;
          border-radius: 4px;
          background: #f8fafc;
          padding: 3px 4px 4px;
          font-size: 7.6px;
          line-height: 1.16;
          overflow: hidden;
        }
        .sub-calendar-pdf .entry.covered {
          border-left-color: #16a34a;
        }
        .sub-calendar-pdf .entry.needs {
          border-left-color: #e11d48;
          background: #fff1f2;
        }
        .sub-calendar-pdf .teacher {
          display: block;
          max-width: 100%;
          overflow: hidden;
          line-height: 1.12;
          overflow-wrap: anywhere;
          font-weight: 800;
        }
        .sub-calendar-pdf .periods {
          display: block;
          margin-top: 1px;
          font-weight: 800;
          color: #334155;
        }
        .sub-calendar-pdf .sub {
          margin-top: 1px;
          color: #475569;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .sub-calendar-pdf .uncovered {
          margin-top: 1px;
          color: #be123c;
          font-weight: 800;
        }
        .sub-calendar-pdf footer {
          margin-top: 8px;
          display: flex;
          justify-content: space-between;
          color: #64748b;
          font-size: 8.5px;
        }
      </style>
      <img class="watermark" src="${warriorHeadNew}" alt="">
      <div class="content">
        <header>
          <div class="brand">
            <img class="logo" src="${warriorHeadNew}" alt="WVCS">
            <div>
              <div class="school">Willamette Valley Christian School</div>
              <h1>Substitute Calendar</h1>
            </div>
          </div>
          <div class="meta">
            <strong>${escapeHtml(monthTitle)}</strong><br>
            9075 Pueblo Ave NE, Brooks, OR 97305<br>
            TEL: 503-393-5236
          </div>
        </header>

        <section class="stats">
          <div class="stat">Staff Absences<strong>${monthAbsences.length}</strong></div>
          <div class="stat">Uncovered Needs<strong>${uncoveredCount}</strong></div>
          <div class="stat">Generated<strong>${escapeHtml(formatDate(getTodayKey()))}</strong></div>
        </section>

        <div class="weekday-row">
          ${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => `<div>${day}</div>`).join("")}
        </div>
        <section class="calendar">
          ${printableDays.map((day) => {
            const dayAbsences = day.date ? absencesByDate[day.date] || [] : [];
            return `
              <div class="day ${day.inMonth ? "" : "blank"}">
                ${day.inMonth ? `<div class="date">${Number(day.date.slice(-2))}</div>` : ""}
                ${dayAbsences.map(buildPdfAbsenceLine).join("")}
              </div>
            `;
          }).join("")}
        </section>
        <footer>
          <span>Compact monthly view. Full notes remain available inside WVCS School Hub.</span>
          <span>Covered entries are green; uncovered needs are red.</span>
        </footer>
      </div>
    </div>
  `;

  document.body.appendChild(host);
  const blob = await html2pdf()
    .set({
      margin: [10, 10, 10, 10],
      filename: getSubstituteCalendarPdfFileName(monthKey),
      html2canvas: { scale: 2 },
      jsPDF: { unit: "pt", format: "letter", orientation: "landscape" },
      pagebreak: { mode: ["css", "legacy"] },
    })
    .from(host.firstElementChild)
    .outputPdf("blob");
  host.remove();
  return blob;
}

function PeriodCheckboxes({ selected, onToggle, disabledPeriods = [] }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {PERIODS.map((period) => {
        const disabled = disabledPeriods.includes(period);
        return (
          <label
            key={period}
            className={`flex items-center justify-center gap-2 rounded-lg border px-2 py-1.5 text-sm font-semibold ${
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

function AbsenceCard({ absence, onAddCoverage, onEdit, onEditCoverage, onRemoveCoverage, onDelete }) {
  const uncovered = getUncoveredPeriods(absence);
  const covered = getCoveredPeriods(absence);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{absence.staffName}</div>
          <div className="mt-1 text-xs text-slate-500">
            Gone: P{formatPeriodRange(absence.periods)}
          </div>
        </div>
        {uncovered.length ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-1 text-xs font-bold text-rose-100">
            <AlertTriangle size={12} />
            Needs P{formatPeriodRange(uncovered)}
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
                <span className="text-slate-500"> · P{formatPeriodRange(coverage.periods)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onEditCoverage(absence, coverage)}
                  className="text-slate-500 transition hover:text-sky-200"
                  aria-label="Edit substitute coverage"
                >
                  <Pencil size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveCoverage(absence.id, coverage.id)}
                  className="text-slate-500 transition hover:text-rose-200"
                  aria-label="Remove substitute coverage"
                >
                  <Trash2 size={13} />
                </button>
              </div>
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
          onClick={() => onEdit(absence)}
          className="inline-flex items-center gap-1 rounded-lg border border-sky-400/60 bg-sky-500/10 px-2.5 py-1.5 text-xs font-bold text-sky-100 hover:bg-sky-500/20"
        >
          <Pencil size={13} />
          Edit
        </button>
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

function CompactAbsenceButton({ absence, selected, onSelect }) {
  const uncovered = getUncoveredPeriods(absence);
  return (
    <button
      type="button"
      onClick={() => onSelect(absence.id)}
      className={`w-full rounded-md border px-2 py-1 text-left text-xs transition ${
        selected
          ? "border-sky-300 bg-sky-500/20"
          : uncovered.length
            ? "border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20"
            : "border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20"
      }`}
    >
      <div className="flex min-w-0 items-center justify-between gap-1">
        <span className="min-w-0 truncate font-bold text-white">{absence.staffName}</span>
        {uncovered.length ? <AlertTriangle size={12} className="shrink-0 text-rose-200" /> : null}
      </div>
      <div className={uncovered.length ? "mt-0.5 font-semibold text-rose-100" : "mt-0.5 font-semibold text-emerald-100"}>
        P{formatPeriodRange(absence.periods)}
      </div>
    </button>
  );
}

export default function SubstituteCalendarModule() {
  const [absences, setAbsences] = useState(loadLocalAbsences);
  const [monthKey, setMonthKey] = useState(getMonthKey());
  const [status, setStatus] = useState("Loading substitute calendar...");
  const [draft, setDraft] = useState({
    staffName: "",
    selectedDates: [getTodayKey()],
    dateToAdd: getTodayKey(),
    periods: [],
    notes: "",
  });
  const [editDraft, setEditDraft] = useState(null);
  const [coverageDraft, setCoverageDraft] = useState(null);
  const [selectedAbsenceId, setSelectedAbsenceId] = useState("");
  const [pdfStatus, setPdfStatus] = useState("");

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
  const selectedAbsence = absences.find((absence) => absence.id === selectedAbsenceId) || null;

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

  function addDraftDate() {
    if (!draft.dateToAdd) return;
    setDraft((current) => ({
      ...current,
      selectedDates: [...new Set([...current.selectedDates, current.dateToAdd])].sort(),
    }));
  }

  function removeDraftDate(date) {
    setDraft((current) => ({
      ...current,
      selectedDates: current.selectedDates.filter((item) => item !== date),
    }));
  }

  async function addAbsence() {
    if (!draft.staffName.trim() || !draft.selectedDates.length || !draft.periods.length) {
      setStatus("Enter a staff member, at least one date, and at least one period.");
      return;
    }

    const createdAt = new Date().toISOString();
    const newAbsences = draft.selectedDates.map((absenceDate) => ({
      id: crypto.randomUUID(),
      staffName: draft.staffName.trim(),
      absenceDate,
      periods: draft.periods,
      notes: draft.notes.trim(),
      coverage: [],
      createdAt,
      updatedAt: createdAt,
    }));
    const nextAbsences = [...absences, ...newAbsences].sort((a, b) => a.absenceDate.localeCompare(b.absenceDate) || a.staffName.localeCompare(b.staffName));
    persist(nextAbsences);
    setMonthKey(getMonthKey(newAbsences[0].absenceDate));
    setSelectedAbsenceId(newAbsences[0].id);
    setDraft({ staffName: "", selectedDates: [draft.dateToAdd], dateToAdd: draft.dateToAdd, periods: [], notes: "" });

    try {
      const results = await Promise.all(newAbsences.map((absence) => saveSubstituteAbsence(absence)));
      if (results.some((result) => result.saved)) setStatus(`${newAbsences.length} absence${newAbsences.length === 1 ? "" : "s"} saved to shared calendar.`);
    } catch (error) {
      setStatus(`Saved locally. Shared save failed: ${error.message}`);
    }
  }

  function beginCoverage(absence, defaultPeriods) {
    setSelectedAbsenceId(absence.id);
    setEditDraft(null);
    setCoverageDraft({
      absenceId: absence.id,
      coverageId: "",
      substituteName: "",
      periods: defaultPeriods || [],
      notes: "",
    });
  }

  function beginEditCoverage(absence, coverage) {
    setSelectedAbsenceId(absence.id);
    setEditDraft(null);
    setCoverageDraft({
      absenceId: absence.id,
      coverageId: coverage.id,
      substituteName: coverage.substituteName || "",
      periods: coverage.periods || [],
      notes: coverage.notes || "",
    });
  }

  function beginEdit(absence) {
    setSelectedAbsenceId(absence.id);
    setCoverageDraft(null);
    setEditDraft({
      id: absence.id,
      staffName: absence.staffName || "",
      absenceDate: absence.absenceDate || getTodayKey(),
      periods: absence.periods || [],
      notes: absence.notes || "",
    });
  }

  async function saveEdit() {
    if (!editDraft?.staffName.trim() || !editDraft.absenceDate || !editDraft.periods.length) {
      setStatus("Enter a staff member, date, and at least one period.");
      return;
    }

    const nextAbsences = absences
      .map((absence) => (
        absence.id === editDraft.id
          ? {
              ...absence,
              staffName: editDraft.staffName.trim(),
              absenceDate: editDraft.absenceDate,
              periods: editDraft.periods,
              notes: editDraft.notes.trim(),
              updatedAt: new Date().toISOString(),
            }
          : absence
      ))
      .sort((a, b) => a.absenceDate.localeCompare(b.absenceDate) || a.staffName.localeCompare(b.staffName));
    persist(nextAbsences);
    setMonthKey(getMonthKey(editDraft.absenceDate));
    setSelectedAbsenceId(editDraft.id);
    setEditDraft(null);
    const updatedAbsence = nextAbsences.find((absence) => absence.id === editDraft.id);

    try {
      const result = await saveSubstituteAbsence(updatedAbsence);
      if (result.saved) setStatus("Absence updated.");
    } catch (error) {
      setStatus(`Saved locally. Shared update failed: ${error.message}`);
    }
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
        coverage: coverageDraft.coverageId
          ? (absence.coverage || []).map((coverage) => (
              coverage.id === coverageDraft.coverageId
                ? {
                    ...coverage,
                    substituteName: coverageDraft.substituteName.trim(),
                    periods: coverageDraft.periods,
                    notes: coverageDraft.notes.trim(),
                  }
                : coverage
            ))
          : [
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
      if (result.saved) setStatus(coverageDraft.coverageId ? "Substitute coverage updated." : "Substitute coverage saved.");
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
    if (selectedAbsenceId === absenceId) setSelectedAbsenceId("");
    if (editDraft?.id === absenceId) setEditDraft(null);
    try {
      const result = await deleteSubstituteAbsence(absenceId);
      if (result.saved) setStatus("Absence deleted.");
    } catch (error) {
      setStatus(`Deleted locally. Shared delete failed: ${error.message}`);
    }
  }

  async function viewPdf() {
    const pdfWindow = window.open("", "_blank", "noopener,noreferrer");
    try {
      setPdfStatus("Preparing PDF...");
      const blob = await generateSubstituteCalendarPdfBlob({ monthKey, absencesByDate, monthAbsences });
      const url = URL.createObjectURL(blob);
      if (pdfWindow) {
        pdfWindow.location.href = url;
      } else {
        window.location.href = url;
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      setPdfStatus("PDF opened.");
    } catch (error) {
      if (pdfWindow) pdfWindow.close();
      setPdfStatus(`PDF failed: ${error.message}`);
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={viewPdf}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-400/60 bg-sky-500/10 px-3 py-2 text-sm font-bold text-sky-100 hover:bg-sky-500/20"
            >
              <FileText size={16} />
              View PDF
            </button>
            <div className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
              {pdfStatus || status}
            </div>
          </div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="space-y-4">
            {editDraft && (
              <div className="rounded-lg border border-sky-400/50 bg-sky-500/10 p-4">
                <div className="mb-4 flex items-center gap-2 text-sm font-bold text-sky-100">
                  <Pencil size={16} />
                  Edit Staff Absence
                </div>
                <div className="space-y-4">
                  <label className="space-y-1 text-sm font-medium text-sky-50">
                    Staff Member
                    <input
                      value={editDraft.staffName}
                      onChange={(event) => setEditDraft({ ...editDraft, staffName: event.target.value })}
                      placeholder="Teacher or staff name"
                      className="w-full rounded-lg border border-sky-400/40 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-300"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-sky-50">
                    Date
                    <input
                      type="date"
                      value={editDraft.absenceDate}
                      onChange={(event) => setEditDraft({ ...editDraft, absenceDate: event.target.value })}
                      className="w-full rounded-lg border border-sky-400/40 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-300"
                    />
                  </label>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-sky-50">Periods Needing Coverage</div>
                      <button
                        type="button"
                        onClick={() => setEditDraft({ ...editDraft, periods: PERIODS })}
                        className="rounded-md border border-sky-400/40 bg-slate-950 px-2 py-1 text-xs font-bold text-sky-100 hover:bg-sky-500/20"
                      >
                        All Day
                      </button>
                    </div>
                    <PeriodCheckboxes
                      selected={editDraft.periods}
                      onToggle={(period) => setEditDraft({ ...editDraft, periods: togglePeriod(editDraft.periods, period) })}
                    />
                  </div>
                  <label className="space-y-1 text-sm font-medium text-sky-50">
                    Notes
                    <textarea
                      value={editDraft.notes}
                      onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })}
                      placeholder="Optional room, class, or preparation notes"
                      className="min-h-20 w-full rounded-lg border border-sky-400/40 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-300"
                    />
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={saveEdit} className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-bold text-white hover:bg-sky-400">
                      Save Changes
                    </button>
                    <button type="button" onClick={() => setEditDraft(null)} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

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
                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-200">Dates</div>
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <input
                      type="date"
                      value={draft.dateToAdd}
                      onChange={(event) => setDraft({ ...draft, dateToAdd: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    />
                    <button
                      type="button"
                      onClick={addDraftDate}
                      className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-100 hover:bg-slate-800"
                    >
                      Add Date
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {draft.selectedDates.map((date) => (
                      <button
                        key={date}
                        type="button"
                        onClick={() => removeDraftDate(date)}
                        className="rounded-full border border-sky-400/40 bg-sky-500/10 px-2.5 py-1 text-xs font-bold text-sky-100 hover:bg-sky-500/20"
                        title="Remove date"
                      >
                        {formatDate(date)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium text-slate-200">Periods Needing Coverage</div>
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, periods: PERIODS })}
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-xs font-bold text-slate-200 hover:bg-slate-800"
                    >
                      All Day
                    </button>
                  </div>
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
                  {coverageDraft.coverageId ? "Edit Substitute Coverage" : "Add Substitute Coverage"}
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
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-emerald-50">Periods Covered</div>
                      <button
                        type="button"
                        onClick={() => setCoverageDraft({ ...coverageDraft, periods: PERIODS })}
                        className="rounded-md border border-emerald-400/40 bg-slate-950 px-2 py-1 text-xs font-bold text-emerald-100 hover:bg-emerald-500/20"
                      >
                        All Day
                      </button>
                    </div>
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
                      {coverageDraft.coverageId ? "Save Changes" : "Save Coverage"}
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
                    className={`min-h-[112px] border-b border-r border-slate-800 p-2 last:border-r-0 ${
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
                        <div className="space-y-1">
                          {dayAbsences.map((absence) => (
                            <CompactAbsenceButton
                              key={absence.id}
                              absence={absence}
                              selected={selectedAbsenceId === absence.id}
                              onSelect={setSelectedAbsenceId}
                            />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="border-t border-slate-800 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
                <UserCheck size={16} className="text-sky-300" />
                Absence Details
              </div>
              {selectedAbsence ? (
                <AbsenceCard
                  absence={selectedAbsence}
                  onAddCoverage={beginCoverage}
                  onEdit={beginEdit}
                  onEditCoverage={beginEditCoverage}
                  onRemoveCoverage={removeCoverage}
                  onDelete={removeAbsence}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
                  Select an absence on the calendar to view notes and substitute coverage.
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
