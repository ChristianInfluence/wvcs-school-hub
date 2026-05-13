import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  History,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";
import html2pdf from "html2pdf.js";
import {
  deleteRecessEntry,
  fetchRecessAttendance,
  fetchRecessEntries,
  saveRecessAttendanceRecord,
  saveRecessEntry,
  subscribeToRecessDataChanges,
  updateRecessEntryStatus,
} from "../../lib/recessData.js";

const STORE_KEY = "wvcs-structured-recess-v1";
const ATTENDANCE_STORE_KEY = "wvcs-recess-attendance-v1";
const ROSTER_SHEET_ID = "1E47sLmoHmz7Cc68DDaYP1YEgBrg2QJAwOB_w-Pas1nI";
const ROSTER_CSV_URL = `https://docs.google.com/spreadsheets/d/${ROSTER_SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const ROSTER_URLS = [
  ROSTER_CSV_URL,
  `https://api.allorigins.win/raw?url=${encodeURIComponent(ROSTER_CSV_URL)}`,
  `https://docs.google.com/spreadsheets/d/${ROSTER_SHEET_ID}/export?format=csv&gid=0`,
];

const attendanceRecesses = {
  early: {
    label: "Early Recess",
    accent: "sky",
    slots: [
      { id: "early-k1", label: "K/1", description: "Kindergarten and Grade 1", grades: ["Kindergarten", "Grade 1"] },
      { id: "early-23", label: "2/3", description: "Grades 2 and 3", grades: ["Grade 2", "Grade 3"] },
      { id: "early-45", label: "4/5", description: "Grades 4 and 5", grades: ["Grade 4", "Grade 5"] },
    ],
  },
  lunch: {
    label: "Lunch Recess",
    accent: "amber",
    slots: [
      { id: "lunch-k12", label: "K/1/2", description: "Kindergarten, Grade 1, and Grade 2", grades: ["Kindergarten", "Grade 1", "Grade 2"] },
      { id: "lunch-345", label: "3/4/5", description: "Grades 3, 4, and 5", grades: ["Grade 3", "Grade 4", "Grade 5"] },
      { id: "lunch-ms", label: "Middle School", description: "Grades 6, 7, and 8", grades: ["Grade 6", "Grade 7", "Grade 8"] },
    ],
  },
};

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
    reason: "Extra support with recess expectations.",
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

function loadAttendance() {
  try {
    const saved = localStorage.getItem(ATTENDANCE_STORE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveAttendance(attendance) {
  localStorage.setItem(ATTENDANCE_STORE_KEY, JSON.stringify(attendance));
}

function formatDuration(duration) {
  return duration === "ALL" ? "ALL" : `${duration} minutes`;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"' && inQuotes && nextChar === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

function buildRosterFromCsv(csvText) {
  if (/sign in to your google account|<!doctype html|<html/i.test(csvText)) {
    throw new Error("Google is requiring sign-in for the roster sheet.");
  }

  const rows = parseCsv(csvText);
  const headers = rows[0]?.map((header, index) => header.trim() || `Grade ${index}`).filter(Boolean) || [];
  if (headers.length < 6) throw new Error("The roster sheet needs grade headers starting in A1.");

  return headers.map((grade, columnIndex) => ({
    grade,
    students: rows
      .slice(1)
      .map((row) => row[columnIndex]?.trim())
      .filter(Boolean),
  }));
}

async function fetchRosterFromSheet() {
  const errors = [];

  for (const url of ROSTER_URLS) {
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (!response.ok) throw new Error(`Google returned ${response.status}`);
      return buildRosterFromCsv(text);
    } catch (error) {
      errors.push(error.message);
    }
  }

  throw new Error([...new Set(errors)].join(" "));
}

function getAttendanceKey(recessId, slotId, grade, studentName) {
  return `${recessId}::${slotId}::${grade}::${studentName}`;
}

function getLegacyAttendanceKey(grade, studentName) {
  return `${grade}::${studentName}`;
}

function getAttendanceRecord(attendance, date, recessId, slotId, grade, studentName) {
  const dateRecords = attendance[date] || {};
  return (
    dateRecords[getAttendanceKey(recessId, slotId, grade, studentName)] ||
    dateRecords[getLegacyAttendanceKey(grade, studentName)] ||
    { status: "", note: "" }
  );
}

function flattenAttendanceRecords(attendance) {
  return Object.entries(attendance).flatMap(([date, dateRecords]) =>
    Object.values(dateRecords).map((record) => ({
      date,
      recessId: record.recessId,
      slotId: record.slotId,
      grade: record.grade,
      studentName: record.studentName,
      status: record.status || "",
      note: record.note || "",
    }))
  ).filter((record) => record.recessId && record.slotId && record.grade && record.studentName);
}

function getAttendanceDates(attendance, today) {
  return [...new Set([today, ...Object.keys(attendance)])].sort().reverse();
}

function getSlotGroups(roster, slot) {
  return slot.grades
    .map((grade) => roster.find((group) => group.grade === grade))
    .filter(Boolean);
}

function getAttendanceSummary(groups, attendance, date, recessId, slotId) {
  return groups.reduce(
    (summary, group) => {
      group.students.forEach((studentName) => {
        const record = getAttendanceRecord(attendance, date, recessId, slotId, group.grade, studentName);
        summary.students += 1;
        if (record.status === "present") summary.present += 1;
        if (record.status === "absent") summary.absent += 1;
      });
      return summary;
    },
    { students: 0, present: 0, absent: 0 }
  );
}

function getRecessAttendanceSummary(roster, attendance, date, recessId) {
  return attendanceRecesses[recessId].slots.reduce(
    (summary, slot) => {
      const slotSummary = getAttendanceSummary(getSlotGroups(roster, slot), attendance, date, recessId, slot.id);
      summary.students += slotSummary.students;
      summary.present += slotSummary.present;
      summary.absent += slotSummary.absent;
      return summary;
    },
    { students: 0, present: 0, absent: 0 }
  );
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getAttendancePdfFileName(date, recessId) {
  return `recess-attendance-${recessId}-${date}.pdf`;
}

function buildAttendancePdfHtml(roster, attendance, date, recessId) {
  const recess = attendanceRecesses[recessId];
  const summary = getRecessAttendanceSummary(roster, attendance, date, recessId);
  const slotSections = recess.slots
    .map((slot) => {
      const gradeSections = getSlotGroups(roster, slot)
        .map((group) => {
          const rows = group.students
            .map((studentName) => {
              const record = getAttendanceRecord(attendance, date, recessId, slot.id, group.grade, studentName);
              const status = record.status === "present" ? "P" : record.status === "absent" ? "A" : "";
              return `
                <tr>
                  <td>${escapeHtml(studentName)}</td>
                  <td class="status">${escapeHtml(status)}</td>
                  <td>${escapeHtml(record.note)}</td>
                </tr>
              `;
            })
            .join("");

          return `
            <section class="grade">
              <h3>${escapeHtml(group.grade)}</h3>
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Status</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>
            </section>
          `;
        })
        .join("");

      return `
        <section class="slot">
          <h2>${escapeHtml(slot.label)} <span>${escapeHtml(slot.description)}</span></h2>
          ${gradeSections}
        </section>
      `;
    })
    .join("");

  return `
    <div class="attendance-pdf">
      <style>
        .attendance-pdf {
          box-sizing: border-box;
          width: 7.5in;
          min-height: 9.8in;
          background: #ffffff;
          color: #111827;
          font-family: Arial, sans-serif;
          padding: 0;
        }
        .attendance-pdf header {
          border-bottom: 2px solid #0f172a;
          margin-bottom: 14px;
          padding-bottom: 10px;
        }
        .attendance-pdf h1 {
          font-size: 20px;
          margin: 0 0 5px;
        }
        .attendance-pdf .meta {
          color: #475569;
          font-size: 11px;
        }
        .attendance-pdf .summary {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 8px;
          margin: 12px 0 14px;
        }
        .attendance-pdf .summary div {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 7px;
          font-size: 10px;
        }
        .attendance-pdf .summary strong {
          display: block;
          color: #0f172a;
          font-size: 15px;
        }
        .attendance-pdf .slot {
          break-inside: avoid;
          margin-bottom: 14px;
        }
        .attendance-pdf h2 {
          background: #0f172a;
          border-radius: 6px;
          color: #ffffff;
          font-size: 13px;
          margin: 0;
          padding: 7px 9px;
        }
        .attendance-pdf h2 span {
          color: #cbd5e1;
          font-size: 10px;
          font-weight: 400;
          margin-left: 6px;
        }
        .attendance-pdf h3 {
          background: #e2e8f0;
          border: 1px solid #cbd5e1;
          border-radius: 6px 6px 0 0;
          color: #0f172a;
          font-size: 12px;
          margin: 8px 0 0;
          padding: 5px 8px;
        }
        .attendance-pdf table {
          border-collapse: collapse;
          width: 100%;
        }
        .attendance-pdf th,
        .attendance-pdf td {
          border: 1px solid #cbd5e1;
          font-size: 10px;
          padding: 5px 6px;
          text-align: left;
          vertical-align: top;
        }
        .attendance-pdf th {
          background: #f8fafc;
          color: #334155;
          font-size: 9px;
          text-transform: uppercase;
        }
        .attendance-pdf .status {
          font-weight: 700;
          text-align: center;
          width: 46px;
        }
      </style>
      <header>
        <h1>Recess Attendance Log</h1>
        <div class="meta">${escapeHtml(recess.label)} • ${escapeHtml(formatDate(date))}</div>
      </header>
      <div class="summary">
        <div><strong>${summary.students}</strong>Students</div>
        <div><strong>${summary.present}</strong>Present</div>
        <div><strong>${summary.absent}</strong>Absent</div>
        <div><strong>${summary.students - summary.present - summary.absent}</strong>Unmarked</div>
      </div>
      ${slotSections}
    </div>
  `;
}

async function exportAttendancePdf(roster, attendance, date, recessId) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#ffffff";
  host.innerHTML = buildAttendancePdfHtml(roster, attendance, date, recessId);
  document.body.appendChild(host);

  await html2pdf()
    .set({
      margin: [28, 36, 28, 36],
      filename: getAttendancePdfFileName(date, recessId),
      html2canvas: { scale: 2 },
      jsPDF: { unit: "pt", format: "letter", orientation: "portrait" },
    })
    .from(host.firstElementChild)
    .save();

  host.remove();
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

      {(entry.reason || entry.notes) && (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-300">
          {entry.reason && (
            <div>
              <span className="font-semibold text-slate-100">Reason:</span> {entry.reason}
            </div>
          )}
          {entry.notes && (
            <div className={entry.reason ? "mt-1" : ""}>
              <span className="font-semibold text-slate-100">Aide notes:</span> {entry.notes}
            </div>
          )}
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
          {entry.reason ? ` • Reason: ${entry.reason}` : ""}
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

function AttendanceStatusButton({ active, tone, children, onClick }) {
  const toneClass =
    tone === "present"
      ? active
        ? "border-emerald-300 bg-emerald-500 text-white"
        : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20"
      : active
        ? "border-rose-300 bg-rose-500 text-white"
        : "border-rose-400/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-8 w-8 rounded-md border text-xs font-black transition ${toneClass}`}
    >
      {children}
    </button>
  );
}

function AttendanceStudentRow({ date, recessId, slotId, grade, studentName, record, onUpdate }) {
  return (
    <div className="grid gap-2 border-b border-slate-800 px-3 py-2 last:border-b-0 md:grid-cols-[1fr_76px_minmax(120px,190px)] md:items-center">
      <div className="text-sm font-semibold text-white">{studentName}</div>
      <div className="flex gap-2">
        <AttendanceStatusButton
          active={record.status === "present"}
          tone="present"
          onClick={() =>
            onUpdate(date, recessId, slotId, grade, studentName, {
              status: record.status === "present" ? "" : "present",
            })
          }
        >
          P
        </AttendanceStatusButton>
        <AttendanceStatusButton
          active={record.status === "absent"}
          tone="absent"
          onClick={() =>
            onUpdate(date, recessId, slotId, grade, studentName, {
              status: record.status === "absent" ? "" : "absent",
            })
          }
        >
          A
        </AttendanceStatusButton>
      </div>
      <input
        value={record.note || ""}
        onChange={(event) => onUpdate(date, recessId, slotId, grade, studentName, { note: event.target.value })}
        placeholder="Note"
        className="h-8 rounded-md border border-slate-700 bg-slate-950 px-2 text-xs text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400"
      />
    </div>
  );
}

function AttendanceGradeCard({ date, recessId, slotId, group, attendance, collapsed, onToggleCollapsed, onUpdate }) {
  const presentCount = group.students.filter(
    (studentName) => getAttendanceRecord(attendance, date, recessId, slotId, group.grade, studentName).status === "present"
  ).length;
  const absentCount = group.students.filter(
    (studentName) => getAttendanceRecord(attendance, date, recessId, slotId, group.grade, studentName).status === "absent"
  ).length;

  return (
    <section className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 bg-slate-950 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => onToggleCollapsed(group.grade)}
            className="flex min-w-0 items-center gap-2 text-left text-base font-bold text-white"
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={17} className="text-slate-400" /> : <ChevronDown size={17} className="text-slate-400" />}
            <span>{group.grade}</span>
          </button>
          <div className="flex shrink-0 gap-2 text-xs font-semibold">
            <span className="rounded-full border border-slate-600 bg-slate-900 px-2 py-1 text-slate-300">
              {group.students.length}
            </span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-emerald-100">
              P {presentCount}
            </span>
            <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-rose-100">
              A {absentCount}
            </span>
          </div>
        </div>
      </div>
      {collapsed ? (
        <div className="p-3 text-xs text-slate-500">
          {presentCount} present, {absentCount} absent, {group.students.length - presentCount - absentCount} unmarked.
        </div>
      ) : group.students.length ? (
        group.students.map((studentName) => (
          <AttendanceStudentRow
            key={`${group.grade}-${studentName}`}
            date={date}
            recessId={recessId}
            slotId={slotId}
            grade={group.grade}
            studentName={studentName}
            record={getAttendanceRecord(attendance, date, recessId, slotId, group.grade, studentName)}
            onUpdate={onUpdate}
          />
        ))
      ) : (
        <div className="p-4 text-sm text-slate-500">No students listed for this grade.</div>
      )}
    </section>
  );
}

function RecessAttendanceBoard({
  date,
  selectedRecessId,
  roster,
  attendance,
  attendanceDates,
  collapsedGrades,
  expandedSlots,
  isLoading,
  error,
  onDateChange,
  onRecessChange,
  onRefreshRoster,
  onToggleSlot,
  onToggleGrade,
  onUpdateAttendance,
}) {
  const recess = attendanceRecesses[selectedRecessId];
  const totals = getRecessAttendanceSummary(roster, attendance, date, selectedRecessId);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-800 p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Users size={16} className="text-sky-300" />
            Recess Attendance
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Choose a recess, then work through each time slot in order for {formatDate(date)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100">
            <CalendarDays size={14} className="text-sky-300" />
            <input
              type="date"
              value={date}
              onChange={(event) => onDateChange(event.target.value)}
              className="bg-transparent text-xs text-white outline-none"
            />
          </label>
          <select
            value={date}
            onChange={(event) => onDateChange(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 outline-none"
            aria-label="Saved attendance logs"
          >
            {attendanceDates.map((savedDate) => (
              <option key={savedDate} value={savedDate}>
                {formatDate(savedDate)}
              </option>
            ))}
          </select>
          <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
            {recess.label}
          </span>
          <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
            {totals.students} students
          </span>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-100">
            P {totals.present}
          </span>
          <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-100">
            A {totals.absent}
          </span>
          <button
            type="button"
            onClick={onRefreshRoster}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh Roster
          </button>
          <button
            type="button"
            onClick={() => exportAttendancePdf(roster, attendance, date, selectedRecessId)}
            disabled={!roster.length}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download size={14} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid gap-2 border-b border-slate-800 p-4 sm:grid-cols-2">
        {Object.entries(attendanceRecesses).map(([id, option]) => {
          const selected = selectedRecessId === id;
          const optionSummary = getRecessAttendanceSummary(roster, attendance, date, id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => onRecessChange(id)}
              className={`rounded-lg border px-4 py-3 text-left transition ${
                selected
                  ? "border-sky-300 bg-sky-500/20 text-white"
                  : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold">{option.label}</div>
                <div className="text-xs font-semibold text-slate-400">
                  P {optionSummary.present} / A {optionSummary.absent}
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {option.slots.map((slot) => slot.label).join(" • ")}
              </div>
            </button>
          );
        })}
      </div>

      {error && (
        <div className="m-4 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
          <AlertCircle size={17} className="mt-0.5 shrink-0" />
          <div>
            The attendance roster could not be loaded from Google Sheets.
            <div className="mt-1 text-xs text-amber-200/80">
              Share the sheet so anyone with the link can view it, or publish it to the web, then refresh the roster.
            </div>
            <div className="mt-1 text-xs text-amber-200/70">{error}</div>
          </div>
        </div>
      )}

      {isLoading && !roster.length ? (
        <div className="p-4">
          <EmptyState>Loading the K-5 attendance roster...</EmptyState>
        </div>
      ) : roster.length ? (
        <div className="space-y-4 p-4">
          {recess.slots.map((slot, slotIndex) => {
            const slotKey = `${selectedRecessId}-${slot.id}`;
            const expanded = Boolean(expandedSlots[slotKey]);
            const slotGroups = getSlotGroups(roster, slot);
            const slotSummary = getAttendanceSummary(slotGroups, attendance, date, selectedRecessId, slot.id);
            return (
              <section key={slot.id} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                <div
                  className={`flex flex-col gap-2 border-b border-slate-800 px-4 py-3 md:flex-row md:items-center md:justify-between ${
                    recess.accent === "amber" ? "bg-amber-500/10" : "bg-sky-500/10"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onToggleSlot(slotKey)}
                    className="flex min-w-0 items-start gap-3 text-left"
                    aria-expanded={expanded}
                  >
                    <span className="mt-6 text-slate-400">
                      {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                    </span>
                    <span>
                      <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Time Slot {slotIndex + 1}
                      </span>
                      <span className="mt-1 block text-xl font-bold text-white">{slot.label}</span>
                      <span className="mt-1 block text-sm text-slate-400">{slot.description}</span>
                    </span>
                  </button>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
                      {slotSummary.students} students
                    </span>
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-emerald-100">
                      P {slotSummary.present}
                    </span>
                    <span className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-1 text-rose-100">
                      A {slotSummary.absent}
                    </span>
                    <button
                      type="button"
                      onClick={() => onToggleSlot(slotKey)}
                      className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-200 transition hover:bg-slate-800"
                    >
                      {expanded ? "Minimize" : "Expand"}
                    </button>
                  </div>
                </div>
                {expanded ? (
                  <div className="grid gap-4 p-4 xl:grid-cols-2 2xl:grid-cols-3">
                    {slotGroups.map((group) => {
                      const collapseKey = `${selectedRecessId}-${slot.id}-${group.grade}`;
                      return (
                        <AttendanceGradeCard
                          key={collapseKey}
                          date={date}
                          recessId={selectedRecessId}
                          slotId={slot.id}
                          group={group}
                          attendance={attendance}
                          collapsed={Boolean(collapsedGrades[collapseKey])}
                          onToggleCollapsed={() => onToggleGrade(collapseKey)}
                          onUpdate={onUpdateAttendance}
                        />
                      );
                    })}
                  </div>
                ) : (
                  <div className="border-t border-slate-800 px-4 py-3 text-sm text-slate-400">
                    {slotSummary.present} present, {slotSummary.absent} absent,{" "}
                    {slotSummary.students - slotSummary.present - slotSummary.absent} unmarked.
                  </div>
                )}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="p-4">
          <EmptyState>No attendance roster loaded yet.</EmptyState>
        </div>
      )}
    </div>
  );
}

export default function StructuredRecessModule({ initialView = "full", currentUserEmail = "" }) {
  const [entries, setEntries] = useState(loadEntries);
  const [attendance, setAttendance] = useState(loadAttendance);
  const [roster, setRoster] = useState([]);
  const [rosterError, setRosterError] = useState("");
  const [isLoadingRoster, setIsLoadingRoster] = useState(false);
  const [sharedDataStatus, setSharedDataStatus] = useState("Connecting to shared database...");
  const [attendanceDate, setAttendanceDate] = useState(getTodayKey());
  const [selectedAttendanceRecess, setSelectedAttendanceRecess] = useState("early");
  const [collapsedGrades, setCollapsedGrades] = useState({});
  const [expandedAttendanceSlots, setExpandedAttendanceSlots] = useState({});
  const [historyDate, setHistoryDate] = useState(getTodayKey());
  const [stagedCompleteIds, setStagedCompleteIds] = useState([]);
  const [viewMode, setViewMode] = useState(initialView);
  const refreshTimerRef = useRef(null);
  const [draft, setDraft] = useState({
    studentName: "",
    teacherName: currentUserEmail,
    recessType: "early",
    duration: 10,
    reason: "",
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
  const attendanceDates = getAttendanceDates(attendance, today);
  const durationOptions = recessOptions[draft.recessType].durations;

  useEffect(() => {
    const timeoutId = window.setTimeout(refreshRoster, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(loadSharedRecessData, 0);
    return () => window.clearTimeout(timeoutId);
    // Load once on mount so any existing local records can seed the shared database safely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const subscription = subscribeToRecessDataChanges(() => {
      window.clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = window.setTimeout(refreshSharedRecessData, 250);
    });

    if (subscription.subscribed) {
      setSharedDataStatus("Shared database connected. Live updates enabled.");
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        refreshSharedRecessData();
      }
    }

    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearTimeout(refreshTimerRef.current);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      subscription.unsubscribe();
    };
  }, []);

  async function refreshSharedRecessData() {
    try {
      const [entriesResult, attendanceResult] = await Promise.all([
        fetchRecessEntries(),
        fetchRecessAttendance(),
      ]);

      if (entriesResult.loaded) {
        setEntries(entriesResult.entries);
        saveEntries(entriesResult.entries);
      }

      if (attendanceResult.loaded) {
        setAttendance(attendanceResult.attendance);
        saveAttendance(attendanceResult.attendance);
      }

      if (entriesResult.loaded || attendanceResult.loaded) {
        setSharedDataStatus("Shared database synced across devices.");
      }
    } catch (error) {
      setSharedDataStatus(`Live sync paused. Shared refresh failed: ${error.message}`);
    }
  }

  async function loadSharedRecessData() {
    try {
      const [entriesResult, attendanceResult] = await Promise.all([
        fetchRecessEntries(),
        fetchRecessAttendance(),
      ]);

      if (entriesResult.loaded) {
        const localEntriesToSync = entries.filter((entry) => entry.id !== "sr-demo-1");
        const nextEntries = entriesResult.entries.length ? entriesResult.entries : localEntriesToSync;
        if (!entriesResult.entries.length && localEntriesToSync.length) {
          await Promise.all(localEntriesToSync.map((entry) => saveRecessEntry(entry)));
        }
        setEntries(nextEntries);
        saveEntries(nextEntries);
      }
      if (attendanceResult.loaded) {
        const localAttendanceRecords = flattenAttendanceRecords(attendance);
        const hasSharedAttendance = Object.keys(attendanceResult.attendance).length > 0;
        const nextAttendance = hasSharedAttendance ? attendanceResult.attendance : attendance;
        if (!hasSharedAttendance && localAttendanceRecords.length) {
          await Promise.all(localAttendanceRecords.map((record) => saveRecessAttendanceRecord(record)));
        }
        setAttendance(nextAttendance);
        saveAttendance(nextAttendance);
      }

      setSharedDataStatus(entriesResult.loaded || attendanceResult.loaded
        ? "Shared database connected."
        : "Using local browser storage until Supabase is configured.");
    } catch (error) {
      setSharedDataStatus(`Using local browser storage. Supabase sync failed: ${error.message}`);
    }
  }

  function persist(nextEntries) {
    setEntries(nextEntries);
    saveEntries(nextEntries);
  }

  function noteSharedSaveError(error) {
    setSharedDataStatus(`Saved locally, but shared database sync failed: ${error.message}`);
  }

  async function refreshRoster() {
    setIsLoadingRoster(true);
    setRosterError("");
    try {
      const nextRoster = await fetchRosterFromSheet();
      setRoster(nextRoster);
    } catch (error) {
      setRosterError(error.message || "Unable to load the roster.");
    } finally {
      setIsLoadingRoster(false);
    }
  }

  function updateAttendance(date, recessId, slotId, grade, studentName, patch) {
    const key = getAttendanceKey(recessId, slotId, grade, studentName);
    const dateRecords = attendance[date] || {};
    const record = dateRecords[key] || { recessId, slotId, grade, studentName, status: "", note: "" };
    const nextAttendance = {
      ...attendance,
      [date]: {
        ...dateRecords,
        [key]: {
          ...record,
          ...patch,
          recessId,
          slotId,
          grade,
          studentName,
          updatedAt: new Date().toISOString(),
        },
      },
    };
    setAttendance(nextAttendance);
    saveAttendance(nextAttendance);
    saveRecessAttendanceRecord({
      date,
      recessId,
      slotId,
      grade,
      studentName,
      status: nextAttendance[date][key].status,
      note: nextAttendance[date][key].note,
    })
      .then((result) => {
        if (result.saved) setSharedDataStatus("Shared database connected.");
      })
      .catch(noteSharedSaveError);
  }

  function toggleGradeCollapsed(grade) {
    setCollapsedGrades((current) => ({ ...current, [grade]: !current[grade] }));
  }

  function toggleAttendanceSlot(slotKey) {
    setExpandedAttendanceSlots((current) => ({ ...current, [slotKey]: !current[slotKey] }));
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
      reason: draft.reason.trim(),
      notes: draft.notes.trim(),
      status: "active",
      createdAt: new Date().toISOString(),
    };
    persist([entry, ...entries]);
    saveRecessEntry(entry)
      .then((result) => {
        if (result.saved) setSharedDataStatus("Shared database connected.");
      })
      .catch(noteSharedSaveError);
    setHistoryDate(today);
    setDraft((current) => ({ ...current, studentName: "", reason: "", notes: "" }));
  }

  function updateStatus(entryId, status) {
    persist(entries.map((entry) => (entry.id === entryId ? { ...entry, status } : entry)));
    updateRecessEntryStatus(entryId, status)
      .then((result) => {
        if (result.saved) setSharedDataStatus("Shared database connected.");
      })
      .catch(noteSharedSaveError);
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
    Promise.all(stagedCompleteIds.map((entryId) => updateRecessEntryStatus(entryId, "complete")))
      .then(() => setSharedDataStatus("Shared database connected."))
      .catch(noteSharedSaveError);
    setStagedCompleteIds([]);
  }

  function removeEntry(entryId) {
    persist(entries.filter((entry) => entry.id !== entryId));
    deleteRecessEntry(entryId)
      .then((result) => {
        if (result.saved) setSharedDataStatus("Shared database connected.");
      })
      .catch(noteSharedSaveError);
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
            <div className="mt-3 inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
              {sharedDataStatus}
            </div>
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
          <div className="space-y-5">
            <AideCompactView
              entries={todayEntries}
              stagedCompleteIds={stagedCompleteIds}
              onStageChange={stageCompletion}
              onConfirmComplete={confirmStagedComplete}
            />
            <RecessAttendanceBoard
              date={attendanceDate}
              selectedRecessId={selectedAttendanceRecess}
              roster={roster}
              attendance={attendance}
              attendanceDates={attendanceDates}
              collapsedGrades={collapsedGrades}
              expandedSlots={expandedAttendanceSlots}
              isLoading={isLoadingRoster}
              error={rosterError}
              onDateChange={setAttendanceDate}
              onRecessChange={setSelectedAttendanceRecess}
              onRefreshRoster={refreshRoster}
              onToggleSlot={toggleAttendanceSlot}
              onToggleGrade={toggleGradeCollapsed}
              onUpdateAttendance={updateAttendance}
            />
          </div>
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
                  Reason <span className="text-xs font-normal text-slate-500">(optional)</span>
                  <input
                    value={draft.reason}
                    onChange={(event) => setDraft({ ...draft, reason: event.target.value })}
                    placeholder="Example: needs support with safe play expectations"
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-sky-400"
                  />
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
