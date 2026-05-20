import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  History,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
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
const RECESS_POLICY_URL = "https://docs.google.com/document/d/19N3wXVuqtXZzRuugWmJNS635G2E7i4TL6xELwZ0-fMg/edit?usp=sharing";
const ROSTER_SHEET_ID = "1E47sLmoHmz7Cc68DDaYP1YEgBrg2QJAwOB_w-Pas1nI";
const ROSTER_CSV_URL = `https://docs.google.com/spreadsheets/d/${ROSTER_SHEET_ID}/gviz/tq?tqx=out:csv&gid=0`;
const ROSTER_URLS = [
  ROSTER_CSV_URL,
  `https://api.allorigins.win/raw?url=${encodeURIComponent(ROSTER_CSV_URL)}`,
  `https://docs.google.com/spreadsheets/d/${ROSTER_SHEET_ID}/export?format=csv&gid=0`,
];

const attendanceRecesses = {
  early: {
    label: "First Recess",
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
    label: "First Recess",
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
    studentGrade: "",
    studentName: "Sample Student",
    teacherName: "Mrs. Teacher",
    recessType: "early",
    duration: 10,
    needsStructuredRecess: true,
    needsWorkTime: false,
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

function formatStudentDisplayName(studentName) {
  const [lastName, ...firstParts] = String(studentName || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (!lastName || !firstParts.length) return studentName;
  return `${firstParts.join(" ")} ${lastName}`.trim();
}

function compareStudentsByFirstName(a, b) {
  return formatStudentDisplayName(a).localeCompare(formatStudentDisplayName(b), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function sortEntries(entries) {
  return [...entries].sort((a, b) =>
    b.date.localeCompare(a.date)
      || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
      || compareStudentsByFirstName(a.studentName, b.studentName)
  );
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

function getEntryTypeLabels(entry) {
  const labels = [];
  if (entry.needsStructuredRecess !== false) labels.push("Structured Recess");
  if (entry.needsWorkTime) labels.push("Finish Work");
  return labels.length ? labels : ["Structured Recess"];
}

function isEntryComplete(entry) {
  return entry.status === "complete";
}

function isEntryNotServed(entry) {
  return entry.status === "not-served";
}

function isEntryUnconfirmed(entry) {
  return !isEntryComplete(entry) && !isEntryNotServed(entry);
}

function getEntryStatusLabel(entry) {
  if (isEntryComplete(entry)) return "Served";
  if (isEntryNotServed(entry)) return "Not Served";
  return "Unconfirmed";
}

function getEntryStatusTone(entry) {
  if (isEntryComplete(entry)) return "bg-emerald-500/15 text-emerald-100";
  if (isEntryNotServed(entry)) return "bg-rose-500/15 text-rose-100";
  return "bg-amber-500/15 text-amber-100";
}

function getWorkTimeLimit(recessType) {
  return recessType === "early" ? 5 : 10;
}

function getDurationOptionsForDraft(draft) {
  const baseOptions = recessOptions[draft.recessType].durations;
  if (!draft.needsWorkTime) return baseOptions;
  const maxWorkTime = getWorkTimeLimit(draft.recessType);
  return baseOptions.filter((duration) => duration !== "ALL" && Number(duration) <= maxWorkTime);
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
      .filter(Boolean)
      .sort(compareStudentsByFirstName),
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

function isRosterLinkedEntry(entry, roster) {
  const group = roster.find((item) => item.grade === entry.studentGrade);
  return Boolean(group?.students.includes(entry.studentName));
}

function getStructuredRecessLog(entries, roster) {
  const completedStructuredEntries = entries.filter(
    (entry) => isEntryComplete(entry) && entry.needsStructuredRecess !== false && isRosterLinkedEntry(entry, roster)
  );

  return Object.values(
    completedStructuredEntries.reduce((log, entry) => {
      const key = `${entry.studentGrade || ""}::${entry.studentName}`;
      const current = log[key] || {
        studentName: entry.studentName,
        studentGrade: entry.studentGrade || "",
        count: 0,
        firstRecess: 0,
        both: 0,
        lunch: 0,
        workTime: 0,
        lastServed: "",
      };

      current.count += 1;
      if (entry.recessType === "early") current.firstRecess += 1;
      if (entry.recessType === "both") current.both += 1;
      if (entry.recessType === "lunch") current.lunch += 1;
      if (entry.needsWorkTime) current.workTime += 1;
      if (!current.lastServed || entry.date > current.lastServed) current.lastServed = entry.date;
      log[key] = current;
      return log;
    }, {})
  ).sort((a, b) => b.count - a.count || compareStudentsByFirstName(a.studentName, b.studentName));
}

function getRangeStartDate(range, today) {
  if (range === "all") return "";
  const days = Number(range);
  if (!days) return "";
  const start = new Date(`${today}T12:00:00`);
  start.setDate(start.getDate() - days + 1);
  return start.toISOString().slice(0, 10);
}

function addCount(map, key, patch = {}) {
  const label = key || "Unlisted";
  const current = map.get(label) || { label, count: 0, ...patch };
  current.count += 1;
  Object.entries(patch).forEach(([field, value]) => {
    if (typeof value === "number") current[field] = (current[field] || 0) + value;
    else if (value) current[field] = value;
  });
  map.set(label, current);
}

function getStructuredRecessAnalytics(entries, roster, { range, grade, search, today }) {
  const rangeStart = getRangeStartDate(range, today);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredEntries = entries
    .filter((entry) => entry.id !== "sr-demo-1")
    .filter((entry) => isRosterLinkedEntry(entry, roster))
    .filter((entry) => !rangeStart || entry.date >= rangeStart)
    .filter((entry) => grade === "all" || entry.studentGrade === grade)
    .filter((entry) => {
      if (!normalizedSearch) return true;
      return [entry.studentName, entry.teacherName, entry.reason, entry.notes]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });

  const students = new Map();
  const grades = new Map();
  const recessTypes = new Map();
  const reasons = new Map();

  filteredEntries.forEach((entry) => {
    const studentKey = `${entry.studentGrade || ""}::${entry.studentName}`;
    const student = students.get(studentKey) || {
      studentName: entry.studentName,
      studentGrade: entry.studentGrade || "",
      count: 0,
      structured: 0,
      workTime: 0,
      complete: 0,
      active: 0,
      lastDate: "",
      reasons: new Map(),
    };
    student.count += 1;
    if (entry.needsStructuredRecess !== false) student.structured += 1;
    if (entry.needsWorkTime) student.workTime += 1;
    if (isEntryComplete(entry)) student.complete += 1;
    if (isEntryUnconfirmed(entry)) student.active += 1;
    if (!student.lastDate || entry.date > student.lastDate) student.lastDate = entry.date;
    if (entry.reason) addCount(student.reasons, entry.reason);
    students.set(studentKey, student);

    addCount(grades, entry.studentGrade || "Unlisted");
    addCount(recessTypes, recessOptions[entry.recessType]?.label || "Unlisted");
    if (entry.reason) addCount(reasons, entry.reason);
  });

  const studentRows = [...students.values()]
    .map((student) => ({
      ...student,
      topReason: [...student.reasons.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0]?.label || "",
    }))
    .sort((a, b) => b.count - a.count || compareStudentsByFirstName(a.studentName, b.studentName));

  return {
    entries: filteredEntries.sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
    studentRows,
    gradeRows: [...grades.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    recessRows: [...recessTypes.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    reasonRows: [...reasons.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
    totals: {
      total: filteredEntries.length,
      uniqueStudents: students.size,
      structured: filteredEntries.filter((entry) => entry.needsStructuredRecess !== false).length,
      workTime: filteredEntries.filter((entry) => entry.needsWorkTime).length,
      complete: filteredEntries.filter(isEntryComplete).length,
      notServed: filteredEntries.filter(isEntryNotServed).length,
      active: filteredEntries.filter(isEntryUnconfirmed).length,
    },
  };
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
                  <td>${escapeHtml(formatStudentDisplayName(studentName))}</td>
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

function CollapsibleSection({ id, title, icon: Icon, summary, collapsed, onToggle, children }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center justify-between gap-3 border-b border-slate-800 px-4 py-3 text-left transition hover:bg-slate-800/70"
        aria-expanded={!collapsed}
      >
        <div className="flex min-w-0 items-center gap-2">
          {collapsed ? <ChevronRight size={17} className="shrink-0 text-slate-400" /> : <ChevronDown size={17} className="shrink-0 text-slate-400" />}
          {Icon && <Icon size={16} className="shrink-0 text-sky-300" />}
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{title}</div>
            {summary && <div className="mt-0.5 truncate text-xs text-slate-500">{summary}</div>}
          </div>
        </div>
        <span className="shrink-0 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          {collapsed ? "Expand" : "Minimize"}
        </span>
      </button>
      {!collapsed && children}
    </section>
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

function EntryTypeBadges({ entry }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {getEntryTypeLabels(entry).map((label) => (
        <span
          key={label}
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${
            label === "Finish Work"
              ? "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-100"
              : "border-sky-400/40 bg-sky-500/15 text-sky-100"
          }`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function EntryCard({ entry, onComplete, onNotServed, onEdit, onDelete }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-lg font-semibold text-white">{formatStudentDisplayName(entry.studentName)}</div>
          <div className="mt-1 text-sm text-slate-400">Placed by {entry.teacherName}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${getEntryStatusTone(entry)}`}>
            {getEntryStatusLabel(entry)}
          </span>
          <RecessBadge type={entry.recessType} />
          <EntryTypeBadges entry={entry} />
        </div>
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
        {onEdit && (
          <button
            type="button"
            onClick={() => onEdit(entry)}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-400/60 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/20"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
        {isEntryUnconfirmed(entry) && (
          <button
            type="button"
            onClick={() => onComplete(entry.id)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-400 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
          >
            <CheckCircle2 size={14} />
            Mark Served
          </button>
        )}
        {isEntryUnconfirmed(entry) && onNotServed && (
          <button
            type="button"
            onClick={() => onNotServed(entry.id)}
            className="inline-flex items-center gap-2 rounded-lg border border-rose-400/60 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
          >
            <X size={14} />
            Not Served
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
        <div className={`font-semibold ${staged ? "text-emerald-100" : "text-white"}`}>{formatStudentDisplayName(entry.studentName)}</div>
        <div className="mt-1">
          <EntryTypeBadges entry={entry} />
        </div>
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
  const sortedEntries = [...entries].sort((a, b) => compareStudentsByFirstName(a.studentName, b.studentName));
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

function StructuredRecessServiceLog({ log }) {
  const totalServed = log.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="flex flex-col gap-2 border-b border-slate-800 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <History size={16} className="text-sky-300" />
            Structured Recess Service Log
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Completed structured recess records matched to roster students.
          </p>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
          {totalServed} completed assignment{totalServed === 1 ? "" : "s"}
        </div>
      </div>

      {log.length ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-800 bg-slate-950 text-xs uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Student</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3 text-right">Total</th>
                <th className="px-4 py-3 text-right">First</th>
                <th className="px-4 py-3 text-right">Both</th>
                <th className="px-4 py-3 text-right">Lunch</th>
                <th className="px-4 py-3 text-right">With Work</th>
                <th className="px-4 py-3">Last Served</th>
              </tr>
            </thead>
            <tbody>
              {log.map((item) => (
                <tr key={`${item.studentGrade}-${item.studentName}`} className="border-b border-slate-800 last:border-b-0">
                  <td className="px-4 py-3 font-semibold text-white">{formatStudentDisplayName(item.studentName)}</td>
                  <td className="px-4 py-3 text-slate-300">{item.studentGrade || "Unlisted"}</td>
                  <td className="px-4 py-3 text-right font-bold text-sky-100">{item.count}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{item.firstRecess}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{item.both}</td>
                  <td className="px-4 py-3 text-right text-slate-300">{item.lunch}</td>
                  <td className="px-4 py-3 text-right text-fuchsia-100">{item.workTime}</td>
                  <td className="px-4 py-3 text-slate-300">{formatDate(item.lastServed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <EmptyState>No completed structured recess records yet.</EmptyState>
        </div>
      )}
    </div>
  );
}

function MiniBreakdownList({ title, rows }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">{title}</div>
      <div className="space-y-2">
        {rows.length ? rows.slice(0, 5).map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate font-semibold text-slate-200">{row.label}</span>
            <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs font-bold text-sky-100">{row.count}</span>
          </div>
        )) : (
          <div className="text-sm text-slate-500">No records match.</div>
        )}
      </div>
    </div>
  );
}

function SmallMetric({ label, value, tone = "text-white" }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</div>
    </div>
  );
}

function StudentFrequencyCard({ student }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{formatStudentDisplayName(student.studentName)}</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">{student.studentGrade || "Unlisted"}</div>
        </div>
        <div className="rounded-full border border-sky-400/30 bg-sky-500/10 px-2.5 py-1 text-sm font-bold text-sky-100">
          {student.count}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-md bg-slate-900 px-2 py-1.5">
          <div className="font-bold text-slate-100">{student.structured}</div>
          <div className="text-slate-500">Structured</div>
        </div>
        <div className="rounded-md bg-slate-900 px-2 py-1.5">
          <div className="font-bold text-fuchsia-100">{student.workTime}</div>
          <div className="text-slate-500">Work</div>
        </div>
        <div className="rounded-md bg-slate-900 px-2 py-1.5">
          <div className="font-bold text-emerald-100">{student.complete}</div>
          <div className="text-slate-500">Done</div>
        </div>
      </div>
      <div className="mt-3 text-xs text-slate-400">
        <span className="font-semibold text-slate-300">Top reason:</span> {student.topReason || "No reason listed"}
      </div>
      <div className="mt-1 text-xs text-slate-500">Last: {formatDate(student.lastDate)}</div>
    </div>
  );
}

function PastRecordCard({ entry }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold text-white">{formatStudentDisplayName(entry.studentName)}</div>
          <div className="mt-1 text-xs text-slate-500">
            {formatDate(entry.date)} · {entry.studentGrade || "Unlisted"} · {recessOptions[entry.recessType]?.label || "Unlisted"}
          </div>
        </div>
        <span className={`rounded-full px-2 py-1 text-xs font-bold ${getEntryStatusTone(entry)}`}>
          {getEntryStatusLabel(entry)}
        </span>
      </div>
      <div className="mt-3">
        <EntryTypeBadges entry={entry} />
      </div>
      <div className="mt-3 text-sm text-slate-300">{entry.reason || "No reason listed"}</div>
      {entry.notes && <div className="mt-1 text-xs text-slate-500">{entry.notes}</div>}
      <div className="mt-2 text-xs font-semibold text-slate-500">Teacher: {entry.teacherName || "Unlisted"}</div>
    </div>
  );
}

function StructuredRecessAnalytics({
  analytics,
  range,
  grade,
  search,
  grades,
  onRangeChange,
  onGradeChange,
  onSearchChange,
}) {
  const rangeLabel = range === "all" ? "All time" : `Last ${range} days`;

  return (
    <div className="min-w-0 max-w-full overflow-hidden bg-slate-900">
      <div className="grid min-w-0 gap-3 border-b border-slate-800 p-4 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <BarChart3 size={16} className="text-sky-300" />
            Behavior Analysis
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Past roster-linked structured recess and finish-work records for pattern review.
          </p>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search student, teacher, reason, or notes"
            className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400"
          />
        </div>
        <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Range
          <select
            value={range}
            onChange={(event) => onRangeChange(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-sky-400"
          >
            <option value="30">Last 30 days</option>
            <option value="7">Last 7 days</option>
            <option value="90">Last 90 days</option>
            <option value="all">All time</option>
          </select>
        </label>
        <label className="space-y-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
          Grade
          <select
            value={grade}
            onChange={(event) => onGradeChange(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm normal-case tracking-normal text-white outline-none focus:border-sky-400"
          >
            <option value="all">All grades</option>
            {grades.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid gap-3 border-b border-slate-800 p-4 md:grid-cols-3 xl:grid-cols-6">
        {[
          ["Records", analytics.totals.total, "text-white"],
          ["Students", analytics.totals.uniqueStudents, "text-sky-100"],
          ["Structured", analytics.totals.structured, "text-sky-100"],
          ["Finish Work", analytics.totals.workTime, "text-fuchsia-100"],
          ["Served", analytics.totals.complete, "text-emerald-100"],
          ["Not Served", analytics.totals.notServed, "text-rose-100"],
          ["Unconfirmed", analytics.totals.active, "text-amber-100"],
        ].map(([label, value, tone]) => <SmallMetric key={label} label={label} value={value} tone={tone} />)}
      </div>

      <div className="grid min-w-0 gap-4 p-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
        <div className="min-w-0">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-white">Student Frequency</div>
            <div className="text-xs font-semibold text-slate-500">{rangeLabel}</div>
          </div>
          {analytics.studentRows.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {analytics.studentRows.slice(0, 8).map((student) => (
                <StudentFrequencyCard key={`${student.studentGrade}-${student.studentName}`} student={student} />
              ))}
            </div>
          ) : (
            <EmptyState>No records match these filters.</EmptyState>
          )}
        </div>

        <div className="grid min-w-0 gap-3">
          <MiniBreakdownList title="Common Reasons" rows={analytics.reasonRows} />
          <MiniBreakdownList title="By Grade" rows={analytics.gradeRows} />
          <MiniBreakdownList title="By Recess Time" rows={analytics.recessRows} />
        </div>
      </div>

      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 text-sm font-bold text-white">Past Records</div>
        {analytics.entries.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {analytics.entries.slice(0, 12).map((entry) => (
              <PastRecordCard key={entry.id} entry={entry} />
            ))}
          </div>
        ) : (
          <EmptyState>No past records match these filters.</EmptyState>
        )}
      </div>
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

function AttendanceStudentRow({ date, recessId, slotId, grade, studentName, record, activeEntries, onUpdate }) {
  return (
    <div className={`grid gap-2 border-b px-3 py-2 last:border-b-0 md:grid-cols-[1fr_76px_minmax(120px,190px)] md:items-center ${activeEntries.length ? "border-sky-500/30 bg-sky-500/10" : "border-slate-800"}`}>
      <div>
        <div className="text-sm font-semibold text-white">{formatStudentDisplayName(studentName)}</div>
        {activeEntries.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {activeEntries.flatMap((entry) => getEntryTypeLabels(entry)).filter((label, index, labels) => labels.indexOf(label) === index).map((label) => (
              <span
                key={label}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                  label === "Finish Work"
                    ? "border-fuchsia-400/50 bg-fuchsia-500/20 text-fuchsia-100"
                    : "border-sky-400/50 bg-sky-500/20 text-sky-100"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
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

function AttendanceGradeCard({ date, recessId, slotId, group, attendance, activeEntries, collapsed, onToggleCollapsed, onUpdate }) {
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
        group.students.map((studentName) => {
          const matchingEntries = activeEntries.filter((entry) => entry.studentName === studentName);
          return (
          <AttendanceStudentRow
            key={`${group.grade}-${studentName}`}
            date={date}
            recessId={recessId}
            slotId={slotId}
            grade={group.grade}
            studentName={studentName}
            record={getAttendanceRecord(attendance, date, recessId, slotId, group.grade, studentName)}
            activeEntries={matchingEntries}
            onUpdate={onUpdate}
          />
          );
        })
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
  activeEntries,
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
  const activeEntriesForRecess = activeEntries.filter(
    (entry) => entry.recessType === selectedRecessId || entry.recessType === "both"
  );

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
                          activeEntries={activeEntriesForRecess}
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
  const [analyticsRange, setAnalyticsRange] = useState("30");
  const [analyticsGrade, setAnalyticsGrade] = useState("all");
  const [analyticsSearch, setAnalyticsSearch] = useState("");
  const [collapsedSections, setCollapsedSections] = useState({});
  const [stagedCompleteIds, setStagedCompleteIds] = useState([]);
  const [viewMode, setViewMode] = useState(initialView);
  const refreshTimerRef = useRef(null);
  const [editDraft, setEditDraft] = useState(null);
  const [draft, setDraft] = useState({
    studentGrade: "",
    studentNames: [],
    teacherName: currentUserEmail,
    recessType: "early",
    duration: 10,
    needsStructuredRecess: true,
    needsWorkTime: false,
    reason: "",
    notes: "",
  });

  const today = getTodayKey();
  const todayEntries = useMemo(
    () => entries.filter((entry) => entry.date === today && isEntryUnconfirmed(entry)),
    [entries, today]
  );
  const historyEntries = useMemo(
    () => entries.filter((entry) => entry.date === historyDate),
    [entries, historyDate]
  );
  const unconfirmedPastEntries = useMemo(
    () => entries
      .filter((entry) => entry.date < today && isEntryUnconfirmed(entry))
      .sort((a, b) => b.date.localeCompare(a.date) || compareStudentsByFirstName(a.studentName, b.studentName)),
    [entries, today]
  );
  const earlyEntries = todayEntries.filter((entry) => entry.recessType === "early");
  const bothEntries = todayEntries.filter((entry) => entry.recessType === "both");
  const lunchEntries = todayEntries.filter((entry) => entry.recessType === "lunch");
  const logDates = [...new Set(entries.map((entry) => entry.date))].sort().reverse();
  const attendanceDates = getAttendanceDates(attendance, today);
  const structuredRecessLog = getStructuredRecessLog(entries, roster);
  const analyticsGrades = [...new Set(entries.map((entry) => entry.studentGrade).filter(Boolean))].sort();
  const structuredRecessAnalytics = useMemo(
    () => getStructuredRecessAnalytics(entries, roster, {
      range: analyticsRange,
      grade: analyticsGrade,
      search: analyticsSearch,
      today,
    }),
    [entries, roster, analyticsRange, analyticsGrade, analyticsSearch, today]
  );
  const rosterGrades = roster.map((group) => group.grade);
  const selectedRosterGroup = roster.find((group) => group.grade === draft.studentGrade) || roster[0];
  const selectedEditRosterGroup = editDraft
    ? roster.find((group) => group.grade === editDraft.studentGrade) || roster[0]
    : null;
  const durationOptions = getDurationOptionsForDraft(draft);
  const editDurationOptions = editDraft ? getDurationOptionsForDraft(editDraft) : [];
  const editStudentOptions = editDraft
    ? [...new Set([...(selectedEditRosterGroup?.students || []), editDraft.studentName].filter(Boolean))].sort(compareStudentsByFirstName)
    : [];

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
      setDraft((current) => {
        if (current.studentGrade || !nextRoster.length) return current;
        return {
          ...current,
          studentGrade: nextRoster[0].grade,
          studentNames: [],
        };
      });
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

  function toggleStructuredSection(sectionId) {
    setCollapsedSections((current) => ({ ...current, [sectionId]: !current[sectionId] }));
  }

  function addEntry() {
    if (!draft.studentNames.length || !draft.teacherName.trim() || (!draft.needsStructuredRecess && !draft.needsWorkTime)) return;
    const newEntries = draft.studentNames.map((studentName) => ({
      id: crypto.randomUUID(),
      date: today,
      studentGrade: draft.studentGrade,
      studentName,
      teacherName: draft.teacherName.trim(),
      recessType: draft.recessType,
      duration: draft.duration === "ALL" ? "ALL" : Number(draft.duration),
      needsStructuredRecess: draft.needsStructuredRecess,
      needsWorkTime: draft.needsWorkTime,
      reason: draft.reason.trim(),
      notes: draft.notes.trim(),
      status: "active",
      createdAt: new Date().toISOString(),
    }));
    persist([...newEntries, ...entries]);
    Promise.all(newEntries.map((entry) => saveRecessEntry(entry)))
      .then((results) => {
        if (results.some((result) => result.saved)) setSharedDataStatus("Shared database connected.");
      })
      .catch(noteSharedSaveError);
    setHistoryDate(today);
    setDraft((current) => ({ ...current, studentNames: [], reason: "", notes: "" }));
  }

  function beginEditEntry(entry) {
    setEditDraft({
      id: entry.id,
      date: entry.date || today,
      studentGrade: entry.studentGrade || roster[0]?.grade || "",
      studentName: entry.studentName || "",
      teacherName: entry.teacherName || currentUserEmail,
      recessType: entry.recessType || "early",
      duration: entry.duration || 10,
      needsStructuredRecess: entry.needsStructuredRecess !== false,
      needsWorkTime: Boolean(entry.needsWorkTime),
      reason: entry.reason || "",
      notes: entry.notes || "",
      status: entry.status || "active",
      createdAt: entry.createdAt || new Date().toISOString(),
    });
    setCollapsedSections((current) => ({ ...current, "edit-entry": false }));
  }

  function updateEditEntryType(patch) {
    setEditDraft((current) => {
      if (!current) return current;
      const nextDraft = { ...current, ...patch };
      if (!nextDraft.needsStructuredRecess && !nextDraft.needsWorkTime) {
        nextDraft.needsStructuredRecess = true;
      }
      const nextOptions = getDurationOptionsForDraft(nextDraft);
      if (!nextOptions.includes(nextDraft.duration) && !nextOptions.includes(Number(nextDraft.duration))) {
        nextDraft.duration = nextOptions[0] || 5;
      }
      return nextDraft;
    });
  }

  function setEditRecessType(recessType) {
    setEditDraft((current) => {
      if (!current) return current;
      const nextDraft = { ...current, recessType };
      const nextOptions = getDurationOptionsForDraft(nextDraft);
      return {
        ...nextDraft,
        duration: nextOptions.includes(nextDraft.duration) || nextOptions.includes(Number(nextDraft.duration))
          ? nextDraft.duration
          : nextOptions[0],
      };
    });
  }

  function saveEditedEntry() {
    if (!editDraft?.studentName || !editDraft.teacherName.trim() || (!editDraft.needsStructuredRecess && !editDraft.needsWorkTime)) return;
    const updatedEntry = {
      ...entries.find((entry) => entry.id === editDraft.id),
      id: editDraft.id,
      date: editDraft.date || today,
      studentGrade: editDraft.studentGrade,
      studentName: editDraft.studentName,
      teacherName: editDraft.teacherName.trim(),
      recessType: editDraft.recessType,
      duration: editDraft.duration === "ALL" ? "ALL" : Number(editDraft.duration),
      needsStructuredRecess: editDraft.needsStructuredRecess,
      needsWorkTime: editDraft.needsWorkTime,
      reason: editDraft.reason.trim(),
      notes: editDraft.notes.trim(),
      status: editDraft.status || "active",
      createdAt: editDraft.createdAt,
    };
    persist(sortEntries(entries.map((entry) => (entry.id === updatedEntry.id ? updatedEntry : entry))));
    saveRecessEntry(updatedEntry)
      .then((result) => {
        if (result.saved) setSharedDataStatus("Shared database connected.");
      })
      .catch(noteSharedSaveError);
    setHistoryDate(updatedEntry.date);
    setEditDraft(null);
  }

  function toggleDraftStudent(studentName) {
    setDraft((current) => ({
      ...current,
      studentNames: current.studentNames.includes(studentName)
        ? current.studentNames.filter((name) => name !== studentName)
        : [...current.studentNames, studentName],
    }));
  }

  function setAllDraftStudents(checked) {
    setDraft((current) => ({
      ...current,
      studentNames: checked ? [...(selectedRosterGroup?.students || [])] : [],
    }));
  }

  function updateStatus(entryId, status) {
    persist(entries.map((entry) => (entry.id === entryId ? { ...entry, status } : entry)));
    updateRecessEntryStatus(entryId, status)
      .then((result) => {
        if (result.saved) setSharedDataStatus("Shared database connected.");
      })
      .catch(noteSharedSaveError);
    if (status === "complete" || status === "not-served") {
      setStagedCompleteIds((current) => current.filter((id) => id !== entryId));
    }
  }

  function markEntryNotServed(entryId) {
    const entry = entries.find((item) => item.id === entryId);
    const label = entry ? `${formatStudentDisplayName(entry.studentName)} on ${formatDate(entry.date)}` : "this structured recess entry";
    if (!window.confirm(`Mark ${label} as not served?`)) return;
    updateStatus(entryId, "not-served");
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
    const entry = entries.find((item) => item.id === entryId);
    const label = entry ? `${formatStudentDisplayName(entry.studentName)} on ${formatDate(entry.date)}` : "this structured recess entry";
    if (!window.confirm(`Remove ${label}?`)) return;
    persist(entries.filter((entry) => entry.id !== entryId));
    if (editDraft?.id === entryId) setEditDraft(null);
    deleteRecessEntry(entryId)
      .then((result) => {
        if (result.saved) setSharedDataStatus("Shared database connected.");
      })
      .catch(noteSharedSaveError);
  }

  function setRecessType(recessType) {
    setDraft((current) => ({
      ...current,
      recessType,
      duration: getDurationOptionsForDraft({ ...current, recessType }).includes(current.duration) || getDurationOptionsForDraft({ ...current, recessType }).includes(Number(current.duration))
        ? current.duration
        : getDurationOptionsForDraft({ ...current, recessType })[0],
    }));
  }

  function updateDraftEntryType(patch) {
    setDraft((current) => {
      const nextDraft = { ...current, ...patch };
      if (!nextDraft.needsStructuredRecess && !nextDraft.needsWorkTime) {
        nextDraft.needsStructuredRecess = true;
      }
      const nextOptions = getDurationOptionsForDraft(nextDraft);
      if (!nextOptions.includes(nextDraft.duration) && !nextOptions.includes(Number(nextDraft.duration))) {
        nextDraft.duration = nextOptions[0] || 5;
      }
      return nextDraft;
    });
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
              Teachers can add students for today. Recess aides can see who needs structured recess, finish-work time, or both.
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
                <div className="text-xs text-slate-500">First</div>
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
              onClick={() => window.open(RECESS_POLICY_URL, "_blank", "noopener,noreferrer")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800"
            >
              <ExternalLink size={15} />
              Recess Policy & Procedure
            </button>
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
              activeEntries={todayEntries}
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
        <div className="grid min-w-0 gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="min-w-0 space-y-4">
            {editDraft && (
              <CollapsibleSection
                id="edit-entry"
                title="Edit Structured Recess Entry"
                icon={Pencil}
                summary={formatStudentDisplayName(editDraft.studentName) || "Editing entry"}
                collapsed={Boolean(collapsedSections["edit-entry"])}
                onToggle={toggleStructuredSection}
              >
                <div className="space-y-4 p-4">
                  <label className="space-y-1 text-sm font-medium text-slate-200">
                    Date
                    <input
                      type="date"
                      value={editDraft.date}
                      onChange={(event) => setEditDraft({ ...editDraft, date: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-slate-200">
                    Grade
                    <select
                      value={editDraft.studentGrade}
                      onChange={(event) => {
                        const nextGroup = roster.find((group) => group.grade === event.target.value);
                        setEditDraft({
                          ...editDraft,
                          studentGrade: event.target.value,
                          studentName: nextGroup?.students.includes(editDraft.studentName) ? editDraft.studentName : "",
                        });
                      }}
                      disabled={!rosterGrades.length}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rosterGrades.length ? rosterGrades.map((grade) => (
                        <option key={grade} value={grade}>{grade}</option>
                      )) : <option value={editDraft.studentGrade}>{editDraft.studentGrade || "Roster loading..."}</option>}
                    </select>
                  </label>

                  {editStudentOptions.length ? (
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      Student
                      <select
                        value={editDraft.studentName}
                        onChange={(event) => setEditDraft({ ...editDraft, studentName: event.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                      >
                        <option value="">Choose student...</option>
                        {editStudentOptions.map((studentName) => (
                          <option key={studentName} value={studentName}>{formatStudentDisplayName(studentName)}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      Student
                      <input
                        value={editDraft.studentName}
                        onChange={(event) => setEditDraft({ ...editDraft, studentName: event.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                      />
                    </label>
                  )}

                  <label className="space-y-1 text-sm font-medium text-slate-200">
                    Teacher Placing Student
                    <input
                      value={editDraft.teacherName}
                      onChange={(event) => setEditDraft({ ...editDraft, teacherName: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                  </label>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-200">Assignment</div>
                    <div className="grid gap-2">
                      <label className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                        <input
                          type="checkbox"
                          checked={editDraft.needsStructuredRecess}
                          onChange={(event) => updateEditEntryType({ needsStructuredRecess: event.target.checked })}
                          className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
                        />
                        <span>
                          Structured Recess
                          <span className="block text-xs font-normal text-slate-500">Supervised physical activity with limited options.</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                        <input
                          type="checkbox"
                          checked={editDraft.needsWorkTime}
                          onChange={(event) => updateEditEntryType({ needsWorkTime: event.target.checked })}
                          className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-fuchsia-500"
                        />
                        <span>
                          Finish Work
                          <span className="block text-xs font-normal text-slate-500">Policy limit: 5 min first recess, 10 min lunch recess.</span>
                        </span>
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-200">Recess Time</div>
                    <div className="grid gap-2">
                      {Object.entries(recessOptions).map(([id, option]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setEditRecessType(id)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                            editDraft.recessType === id
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
                    {editDraft.needsWorkTime ? "Work/assignment length" : "Length"}
                    <select
                      value={editDraft.duration}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          duration: event.target.value === "ALL" ? "ALL" : Number(event.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    >
                      {editDurationOptions.map((duration) => (
                        <option key={duration} value={duration}>
                          {formatDuration(duration)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1 text-sm font-medium text-slate-200">
                    Reason <span className="text-xs font-normal text-slate-500">(optional)</span>
                    <input
                      value={editDraft.reason}
                      onChange={(event) => setEditDraft({ ...editDraft, reason: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none placeholder:text-slate-600 focus:border-sky-400"
                    />
                  </label>

                  <label className="space-y-1 text-sm font-medium text-slate-200">
                    Notes for Aide
                    <textarea
                      value={editDraft.notes}
                      onChange={(event) => setEditDraft({ ...editDraft, notes: event.target.value })}
                      className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                  </label>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={saveEditedEntry}
                      disabled={!editDraft.studentName || !editDraft.teacherName.trim() || (!editDraft.needsStructuredRecess && !editDraft.needsWorkTime)}
                      className="rounded-lg bg-sky-500 px-3 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditDraft(null)}
                      className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </CollapsibleSection>
            )}

            <CollapsibleSection
              id="add-student"
              title="Add Student for Today"
              icon={Plus}
              summary={`${draft.studentNames.length} selected`}
              collapsed={Boolean(collapsedSections["add-student"])}
              onToggle={toggleStructuredSection}
            >
              <div className="space-y-4 p-4">
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Grade
                  <select
                    value={draft.studentGrade}
                    onChange={(event) => {
                      setDraft({ ...draft, studentGrade: event.target.value, studentNames: [] });
                    }}
                    disabled={!rosterGrades.length}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rosterGrades.length ? rosterGrades.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    )) : <option value="">Roster loading...</option>}
                  </select>
                </label>

                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Students
                  <div className="rounded-lg border border-slate-700 bg-slate-950">
                    <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
                      <span className="text-xs font-semibold text-slate-400">
                        {draft.studentNames.length} selected
                      </span>
                      <button
                        type="button"
                        onClick={() => setAllDraftStudents(draft.studentNames.length !== (selectedRosterGroup?.students.length || 0))}
                        disabled={!selectedRosterGroup?.students.length}
                        className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {draft.studentNames.length === (selectedRosterGroup?.students.length || 0) ? "Clear All" : "Select All"}
                      </button>
                    </div>
                    <div className="max-h-56 overflow-auto p-2">
                      {selectedRosterGroup?.students.length ? selectedRosterGroup.students.map((studentName) => (
                        <label key={studentName} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-900">
                          <input
                            type="checkbox"
                            checked={draft.studentNames.includes(studentName)}
                            onChange={() => toggleDraftStudent(studentName)}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
                          />
                          {formatStudentDisplayName(studentName)}
                        </label>
                      )) : (
                        <div className="px-2 py-3 text-sm text-slate-500">No students loaded.</div>
                      )}
                    </div>
                  </div>
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
                  <div className="text-sm font-medium text-slate-200">Assignment</div>
                  <div className="grid gap-2">
                    <label className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                      <input
                        type="checkbox"
                        checked={draft.needsStructuredRecess}
                        onChange={(event) => updateDraftEntryType({ needsStructuredRecess: event.target.checked })}
                        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
                      />
                      <span>
                        Structured Recess
                        <span className="block text-xs font-normal text-slate-500">Supervised physical activity with limited options.</span>
                      </span>
                    </label>
                    <label className="flex items-start gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                      <input
                        type="checkbox"
                        checked={draft.needsWorkTime}
                        onChange={(event) => updateDraftEntryType({ needsWorkTime: event.target.checked })}
                        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-fuchsia-500"
                      />
                      <span>
                        Finish Work
                        <span className="block text-xs font-normal text-slate-500">Policy limit: 5 min first recess, 10 min lunch recess.</span>
                      </span>
                    </label>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-slate-200">Recess Time</div>
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
                  {draft.needsWorkTime ? "Work/assignment length" : "Length"}
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
                  disabled={!draft.studentNames.length || !draft.teacherName.trim() || (!draft.needsStructuredRecess && !draft.needsWorkTime)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Plus size={16} />
                  Add {draft.studentNames.length || ""} to Today&apos;s Board
                </button>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="past-day-picker"
              title="Past Day Logs"
              icon={History}
              summary={`${historyEntries.length} entr${historyEntries.length === 1 ? "y" : "ies"} on selected date`}
              collapsed={Boolean(collapsedSections["past-day-picker"])}
              onToggle={toggleStructuredSection}
            >
              <div className="p-4">
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
            </CollapsibleSection>
          </aside>

          <main className="min-w-0 space-y-5">
            <CollapsibleSection
              id="aide-checklist"
              title="Aide Checklist"
              icon={CheckCircle2}
              summary={`${todayEntries.length} active student${todayEntries.length === 1 ? "" : "s"}`}
              collapsed={Boolean(collapsedSections["aide-checklist"])}
              onToggle={toggleStructuredSection}
            >
              <div className="p-4">
                <AideCompactView
                  entries={todayEntries}
                  stagedCompleteIds={stagedCompleteIds}
                  onStageChange={stageCompletion}
                  onConfirmComplete={confirmStagedComplete}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="current-recess"
              title={`Current Structured Recess: ${formatDate(today)}`}
              icon={Users}
              summary={`${todayEntries.length} current · ${earlyEntries.length} first · ${bothEntries.length} both · ${lunchEntries.length} lunch`}
              collapsed={Boolean(collapsedSections["current-recess"])}
              onToggle={toggleStructuredSection}
            >
              <div className="grid gap-4 p-4 xl:grid-cols-3">
                <section className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">First Recess</h2>
                    <span className="text-sm text-slate-500">{earlyEntries.length} students</span>
                  </div>
                  {earlyEntries.length ? (
                    earlyEntries.map((entry) => (
                      <EntryCard
                        key={entry.id}
                        entry={entry}
                        onComplete={(id) => updateStatus(id, "complete")}
                        onNotServed={markEntryNotServed}
                        onEdit={beginEditEntry}
                        onDelete={removeEntry}
                      />
                    ))
                  ) : (
                    <EmptyState>No students currently listed for first recess.</EmptyState>
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
                        onNotServed={markEntryNotServed}
                        onEdit={beginEditEntry}
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
                        onNotServed={markEntryNotServed}
                        onEdit={beginEditEntry}
                        onDelete={removeEntry}
                      />
                    ))
                  ) : (
                    <EmptyState>No students currently listed for lunch recess.</EmptyState>
                  )}
                </section>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="past-confirmation"
              title="Past Entries Needing Confirmation"
              icon={AlertCircle}
              summary={`${unconfirmedPastEntries.length} unconfirmed entr${unconfirmedPastEntries.length === 1 ? "y" : "ies"}`}
              collapsed={Boolean(collapsedSections["past-confirmation"])}
              onToggle={toggleStructuredSection}
            >
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {unconfirmedPastEntries.length ? (
                  unconfirmedPastEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onComplete={(id) => updateStatus(id, "complete")}
                      onNotServed={markEntryNotServed}
                      onEdit={beginEditEntry}
                      onDelete={removeEntry}
                    />
                  ))
                ) : (
                  <div className="md:col-span-2">
                    <EmptyState>No past structured recess entries are waiting for confirmation.</EmptyState>
                  </div>
                )}
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              id="behavior-analysis"
              title="Behavior Analysis"
              icon={BarChart3}
              summary={`${structuredRecessAnalytics.totals.total} records · ${structuredRecessAnalytics.totals.uniqueStudents} students`}
              collapsed={Boolean(collapsedSections["behavior-analysis"])}
              onToggle={toggleStructuredSection}
            >
              <StructuredRecessAnalytics
                analytics={structuredRecessAnalytics}
                range={analyticsRange}
                grade={analyticsGrade}
                search={analyticsSearch}
                grades={analyticsGrades}
                onRangeChange={setAnalyticsRange}
                onGradeChange={setAnalyticsGrade}
                onSearchChange={setAnalyticsSearch}
              />
            </CollapsibleSection>

            <CollapsibleSection
              id="service-log"
              title="Structured Recess Service Log"
              icon={History}
              summary={`${structuredRecessLog.reduce((sum, item) => sum + item.count, 0)} completed assignment${structuredRecessLog.reduce((sum, item) => sum + item.count, 0) === 1 ? "" : "s"}`}
              collapsed={Boolean(collapsedSections["service-log"])}
              onToggle={toggleStructuredSection}
            >
              <StructuredRecessServiceLog log={structuredRecessLog} />
            </CollapsibleSection>

            <CollapsibleSection
              id="daily-log"
              title={`Log for ${formatDate(historyDate)}`}
              icon={History}
              summary={`${historyEntries.length} entr${historyEntries.length === 1 ? "y" : "ies"} logged`}
              collapsed={Boolean(collapsedSections["daily-log"])}
              onToggle={toggleStructuredSection}
            >
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {historyEntries.length ? (
                  historyEntries.map((entry) => (
                    <EntryCard
                      key={entry.id}
                      entry={entry}
                      onComplete={(id) => updateStatus(id, "complete")}
                      onNotServed={markEntryNotServed}
                      onEdit={beginEditEntry}
                      onDelete={removeEntry}
                    />
                  ))
                ) : (
                  <div className="md:col-span-2">
                    <EmptyState>No structured recess entries logged for this date.</EmptyState>
                  </div>
                )}
              </div>
            </CollapsibleSection>
          </main>
        </div>
        )}
      </div>
    </section>
  );
}
