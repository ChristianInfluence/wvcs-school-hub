import React, { useEffect, useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";
import {
  Plus,
  Trash2,
  AlertTriangle,
  Pencil,
  X,
  Settings,
  Clock,
  Ban,
  Coffee,
  Undo2,
  Redo2,
  Save,
  History,
  RotateCcw,
  Printer,
  Download,
  Upload,
  User,
  Users,
  FileText,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  RefreshCw,
} from "lucide-react";

function Button({ children, className = "", variant, disabled, ...props }) {
  const base =
    "px-3 py-2 text-sm rounded-xl font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed";
  const styles = {
    default: "bg-sky-500 text-white hover:bg-sky-400 shadow-sm border border-sky-400",
    outline:
      "bg-slate-800 border border-slate-600 text-slate-100 hover:bg-slate-700 shadow-sm",
    danger: "bg-red-600 text-white hover:bg-red-500 shadow-sm border border-red-500",
    success:
      "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm border border-emerald-500",
  };

  return (
    <button
      disabled={disabled}
      className={`${base} ${styles[variant || "default"]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl border border-slate-700 bg-slate-900 ${className}`}>
      {children}
    </div>
  );
}

function CardContent({ children, className = "" }) {
  return <div className={className}>{children}</div>;
}

function MenuButton({ label, children }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function closeFromOutsideClick(event) {
      if (!menuRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }

    function closeFromEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeFromOutsideClick);
    document.addEventListener("keydown", closeFromEscape);

    return () => {
      document.removeEventListener("pointerdown", closeFromOutsideClick);
      document.removeEventListener("keydown", closeFromEscape);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-medium text-slate-100 shadow-sm transition hover:bg-slate-700"
      >
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-1 min-w-56 rounded-xl border border-slate-700 bg-slate-950 p-1 shadow-2xl"
        >
          {React.Children.map(children, (child) =>
            React.isValidElement(child)
              ? React.cloneElement(child, { onCloseMenu: () => setOpen(false) })
              : child
          )}
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick, onCloseMenu }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onCloseMenu?.();
        onClick?.();
      }}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-slate-100 transition hover:bg-slate-800"
      role="menuitem"
    >
      {Icon && <Icon size={15} />}
      {children}
    </button>
  );
}

const STORAGE_KEY = "wvcs-master-scheduler-working";
const VERSIONS_KEY = "wvcs-master-scheduler-versions";

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const SEMESTERS = ["Semester 1", "Semester 2"];
const GRADE_OPTIONS = ["6", "7", "8", "9", "10", "11", "12"];
const FULL_SPAN_BLOCK_TYPES = new Set(["prep", "no-class", "professional-duties"]);

function getSemesterShortLabel(semester) {
  return semester === "Semester 1" ? "Sem 1" : "Sem 2";
}

function isFullSpanBlock(block) {
  return block?.semester === "Both" || FULL_SPAN_BLOCK_TYPES.has(block?.blockType);
}

const initialPeriodTimes = {
  1: "8:00–8:46",
  2: "8:48.5–9:34.5",
  3: "9:37–10:23",
  4: "10:25–11:11.5",
  5: "11:54–12:40",
  6: "12:42.5–1:28.5",
  7: "1:31–2:17",
  8: "2:19.5–3:05",
};

const initialTeachers = [
  { id: "t1", name: "Mr. Conniry" },
  { id: "t2", name: "Ms. Keith" },
  { id: "t3", name: "Mr. Connors" },
  { id: "t4", name: "Mr. Shore" },
  { id: "t5", name: "Mrs. Brown" },
  { id: "t6", name: "Ms. Reed" },
  { id: "t7", name: "Mrs. Huff" },
  { id: "t8", name: "Ms. Isabel" },
  { id: "t9", name: "Mrs. Sellers" },
  { id: "t10", name: "Mrs. Bennett" },
];

const blockTemplates = [
  {
    blockType: "prep",
    name: "Prep Period",
    color: "bg-cyan-950 border-cyan-400 text-cyan-50",
  },
  {
    blockType: "no-class",
    name: "No Class / Unavailable",
    color: "bg-slate-800 border-slate-500 text-slate-50",
  },
  {
    blockType: "professional-duties",
    name: "Professional Duties",
    color: "bg-fuchsia-950 border-fuchsia-400 text-fuchsia-50",
  },
];

const initialClasses = [
  {
    id: "c1",
    name: "9th Grade Math",
    subject: "Math",
    grades: ["9"],
    room: "101",
    color: "bg-blue-950 border-blue-500 text-blue-50",
    checkGradeConflicts: true,
    checkRoomConflicts: true,
    fullYear: false,
    notes: "",
    placements: { "Semester 1": null, "Semester 2": null },
  },
  {
    id: "c2",
    name: "9th Grade History",
    subject: "History",
    grades: ["9"],
    room: "102",
    color: "bg-amber-950 border-amber-500 text-amber-50",
    checkGradeConflicts: true,
    checkRoomConflicts: true,
    fullYear: false,
    notes: "",
    placements: { "Semester 1": null, "Semester 2": null },
  },
];

const initialState = {
  teachers: initialTeachers,
  classes: initialClasses,
  scheduleBlocks: [],
  periodTimes: initialPeriodTimes,
  appSettings: {
    title: "WVCS Master Scheduler",
    subtitle: "Build next year’s schedule by teacher, period, room, and semester.",
    logoUrl: "/warrior-head.png",
    lunch: {
      enabled: true,
      time: "11:11.5–11:51.5",
      afterPeriod: 4,
      beforePeriod: 5,
    },
  },
};

const colorOptions = [
  { label: "Blue", value: "bg-blue-950 border-blue-500 text-blue-50" },
  { label: "Green", value: "bg-emerald-950 border-emerald-500 text-emerald-50" },
  { label: "Yellow", value: "bg-amber-950 border-amber-500 text-amber-50" },
  { label: "Purple", value: "bg-purple-950 border-purple-500 text-purple-50" },
  { label: "Pink", value: "bg-pink-950 border-pink-500 text-pink-50" },
  { label: "Gray", value: "bg-slate-800 border-slate-500 text-slate-50" },
  { label: "Teal", value: "bg-teal-950 border-teal-500 text-teal-50" },
  { label: "Rose", value: "bg-rose-950 border-rose-500 text-rose-50" },
  { label: "Lime", value: "bg-lime-950 border-lime-500 text-lime-50" },
  { label: "Orange", value: "bg-orange-950 border-orange-500 text-orange-50" },
];

function getInitialWorkingState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : initialState;
  } catch {
    return initialState;
  }
}

function getInitialVersions() {
  try {
    const saved = localStorage.getItem(VERSIONS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function blankClass() {
  return {
    id: crypto.randomUUID(),
    name: "New Class",
    subject: "",
    grades: [],
    room: "",
    color: "bg-slate-800 border-slate-500 text-slate-50",
    checkGradeConflicts: true,
    checkRoomConflicts: true,
    fullYear: false,
    notes: "",
    placements: { "Semester 1": null, "Semester 2": null },
  };
}

function ClassCard({ cls, conflict, selected, onEdit, onRemove, onSelect, onPointerDragStart }) {
  const dragItem = { kind: "class", id: cls.id, label: cls.name, color: cls.color };
  const subject = cls.subject?.trim();
  const room = cls.room?.trim();
  const details = [
    subject || null,
    cls.grades.length ? `Gr. ${cls.grades.join(",")}` : null,
    room ? `Rm ${room}` : null,
  ].filter(Boolean);

  return (
    <div
      draggable
      onPointerDown={(e) => onPointerDragStart?.(e, dragItem)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(dragItem);
      }}
      onDragStart={(e) => {
        onSelect?.(dragItem);
        e.dataTransfer.setData("dragData", JSON.stringify({ kind: "class", id: cls.id }));
      }}
      className={`print-card group relative rounded-lg border px-2 py-1.5 shadow-sm cursor-pointer active:cursor-grabbing ${cls.color} ${
        conflict ? "ring-2 ring-red-400" : ""
      } ${
        selected ? "ring-2 ring-emerald-300" : ""
      }`}
    >
      <div>
        <div>
          <div className="line-clamp-2 pr-8 text-[13px] font-semibold leading-tight" title={cls.name}>
            {cls.name}
          </div>
          {details.length ? (
            <div className="mt-0.5 flex flex-wrap gap-x-1.5 gap-y-0 text-[10px] leading-tight opacity-85">
              {details.map((detail) => (
                <span key={detail} className="whitespace-nowrap">
                  {detail}
                </span>
              ))}
            </div>
          ) : null}
        </div>

        <div className="no-print absolute right-1 top-1 flex gap-0.5 rounded-md bg-black/20 opacity-0 transition group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(cls);
            }}
            className="rounded-md p-0.5 hover:bg-white/20"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(cls.id);
            }}
            className="rounded-md p-0.5 hover:bg-white/20"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function BlockTemplateCard({ template, selected, onSelect, onPointerDragStart }) {
  const Icon = template.blockType === "prep" ? Coffee : Ban;
  const dragItem = {
    kind: "block-template",
    blockType: template.blockType,
    label: template.name,
    color: template.color,
  };

  return (
    <div
      draggable
      onPointerDown={(e) => onPointerDragStart?.(e, dragItem)}
      onClick={() => onSelect?.(dragItem)}
      onDragStart={(e) => {
        onSelect?.(dragItem);
        e.dataTransfer.setData(
          "dragData",
          JSON.stringify({ kind: "block-template", blockType: template.blockType })
        );
      }}
      className={`rounded-lg border px-2 py-1.5 shadow-sm cursor-pointer active:cursor-grabbing ${template.color} ${
        selected ? "ring-2 ring-emerald-300" : ""
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={14} />
        <div className="min-w-0 truncate text-[13px] font-semibold">{template.name}</div>
      </div>
      <div className="mt-0.5 text-[10px] leading-tight opacity-80">Reusable</div>
    </div>
  );
}

function isTauriRuntime() {
  return Boolean(window.__TAURI_INTERNALS__);
}

function getErrorMessage(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return JSON.stringify(error);
}

function ScheduleBlockCard({ block, onRemove }) {
  const getIcon = () => {
    switch (block.blockType) {
      case "office":
        return <User size={15} />;
      case "meeting":
        return <Users size={15} />;
      case "prep":
        return <Coffee size={15} />;
      case "professional-duties":
        return <Briefcase size={15} />; // Use Briefcase icon for professional duties
      default:
        return <Ban size={15} />;
    }
  };

  return (
    <div
      className={`print-card group relative max-w-full overflow-hidden rounded-lg border px-2 py-1.5 shadow-sm ${block.color}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold leading-snug">
            <span className="shrink-0">
              {getIcon()}
            </span>
            <span className="min-w-0 flex-1 truncate">{block.name}</span>
          </div>
          <div className="mt-0.5 truncate text-[10px] leading-tight opacity-80">
            {isFullSpanBlock(block) ? "Both semesters" : block.blockType === "lunch" ? "Shared lunch period" : "Blocked schedule time"}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(block.id);
          }}
          className={`no-print relative z-10 shrink-0 rounded-md p-0.5 opacity-0 group-hover:opacity-100 hover:bg-white/20 focus:opacity-100 ${
            block.blockType === "lunch" ? "hidden" : ""
          }`}
          aria-label={`Delete ${block.name}`}
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

export default function MasterSchoolSchedulerPrototype() {
  const [workingState, setWorkingState] = useState(getInitialWorkingState);
  const [versions, setVersions] = useState(getInitialVersions);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const [editingClass, setEditingClass] = useState(null);
  const [newTeacherName, setNewTeacherName] = useState("");
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editingTeacherName, setEditingTeacherName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [activeCellPicker, setActiveCellPicker] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [scheduleZoom, setScheduleZoom] = useState(0.85);
  const [updateStatus, setUpdateStatus] = useState("");
  const fileInputRef = useRef(null);
  const classImportRef = useRef(null);

  const { teachers, classes, scheduleBlocks, periodTimes, appSettings } = workingState;
  const sidebarGridClass = sidebarHidden
    ? "grid min-w-0 gap-4 grid-cols-1 print:block"
    : "grid min-w-0 gap-4 lg:grid-cols-[180px_minmax(0,1fr)] print:block";

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workingState));
  }, [workingState]);

  useEffect(() => {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
  }, [versions]);

  function commit(updateFn) {
    setUndoStack((prev) => [...prev, workingState]);
    setRedoStack([]);
    setWorkingState((prev) => updateFn(prev));
  }

  function clampScheduleZoom(value) {
    return Math.min(1.1, Math.max(0.65, Number(value)));
  }

  function adjustScheduleZoom(delta) {
    setScheduleZoom((current) => clampScheduleZoom(Number((current + delta).toFixed(2))));
  }

  function undo() {
    if (!undoStack.length) return;
    const previous = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [workingState, ...prev]);
    setUndoStack((prev) => prev.slice(0, -1));
    setWorkingState(previous);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setUndoStack((prev) => [...prev, workingState]);
    setRedoStack((prev) => prev.slice(1));
    setWorkingState(next);
  }

  function saveVersion() {
    const name = prompt("Name this schedule version:", `Draft ${versions.length + 1}`);
    if (!name) return;

    setVersions((prev) => [
      {
        id: crypto.randomUUID(),
        name,
        savedAt: new Date().toISOString(),
        data: workingState,
      },
      ...prev,
    ]);
  }

  function loadVersion(version) {
    if (!confirm(`Load "${version.name}"? Your current working schedule will be replaced.`)) return;
    commit(() => version.data);
    setVersionHistoryOpen(false);
  }

  function deleteVersion(versionId) {
    if (!confirm("Delete this saved version?")) return;
    setVersions((prev) => prev.filter((v) => v.id !== versionId));
  }

  function parseCsv(text) {
    const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < normalized.length; i += 1) {
      const char = normalized[i];
      const next = normalized[i + 1];

      if (char === '"') {
        if (inQuotes && next === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }

      if (char === ',' && !inQuotes) {
        row.push(field);
        field = "";
        continue;
      }

      if (char === '\n' && !inQuotes) {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
        continue;
      }

      field += char;
    }

    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter((r, index) => index === 0 || r.some((cell) => cell.trim() !== ""));
  }

  function normalizeCsvKey(header) {
    return header
      .replace(/^\uFEFF/, "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_");
  }

  function parseBoolean(value, defaultValue = true) {
    if (value === undefined || value === null || value === "") return defaultValue;
    const normalized = String(value).trim().toLowerCase();
    return ["true", "yes", "y", "1", "on"].includes(normalized);
  }

  function parseGrades(value) {
    if (!value) return [];
    return String(value)
      .split(/[,;|]+/)
      .map((grade) => grade.trim())
      .filter(Boolean);
  }

  function importClasses(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const filename = file.name.toLowerCase();

        if (!filename.endsWith(".csv")) {
          alert("Class import only accepts CSV files.");
          return;
        }

        const rows = parseCsv(text);
        if (rows.length < 2) {
          alert("CSV must include a header row and at least one data row.");
          return;
        }

        const headers = rows[0].map(normalizeCsvKey);
        const parsedClasses = rows.slice(1).map((row, rowIndex) => {
          const record = headers.reduce((acc, key, index) => {
            acc[key] = row[index] ? row[index].trim() : "";
            return acc;
          }, {});

          const semesterType = normalizeSemester(record.semester || record.term || "");
          return {
            id: crypto.randomUUID(),
            name: record.name || `Class ${rowIndex + 1}`,
            subject: record.subject || "",
            grades: parseGrades(record.grades),
            room: record.room || "",
            color: mapColorValue(record.color),
            checkGradeConflicts: parseBoolean(record.checkgradeconflicts, true),
            checkRoomConflicts: parseBoolean(record.checkroomconflicts, true),
            fullYear: semesterType === "all_year",
            notes: record.notes || "",
            placements: { "Semester 1": null, "Semester 2": null },
          };
        });

        if (!parsedClasses.length) {
          alert("No valid class rows were found in the CSV file.");
          return;
        }

        commit((state) => ({
          ...state,
          classes: [...parsedClasses, ...state.classes],
        }));
        alert(`Imported ${parsedClasses.length} classes from CSV.`);
      } catch (err) {
        alert(`Failed to import classes: ${err.message}`);
      }
    };
    reader.readAsText(file);

    if (classImportRef.current) {
      classImportRef.current.value = "";
    }
  }

  function mapColorValue(value) {
    if (!value) return "bg-slate-800 border-slate-500 text-slate-50";

    const normalizedValue = String(value).trim();
    const lookupLabel = normalizedValue.toLowerCase();
    const foundOption = colorOptions.find(
      (option) => option.label.toLowerCase() === lookupLabel || option.value === normalizedValue
    );
    return foundOption ? foundOption.value : normalizedValue;
  }

  function normalizeSemester(value) {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized.includes("all") || normalized.includes("year")) return "all_year";
    if (normalized.includes("first") || normalized.includes("1")) return "semester_1";
    if (normalized.includes("second") || normalized.includes("2")) return "semester_2";
    return "semester_1";
  }

  function downloadBlobInBrowser(blob, filename) {
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function saveBlobToFile(blob, filename, filters) {
    if (!isTauriRuntime()) {
      downloadBlobInBrowser(blob, filename);
      return;
    }

    const [{ save }, { invoke }] = await Promise.all([
      import("@tauri-apps/plugin-dialog"),
      import("@tauri-apps/api/core"),
    ]);

    const filePath = await save({
      defaultPath: filename,
      filters,
    });

    if (!filePath) return;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    await invoke("save_file", { path: filePath, bytes: Array.from(bytes) });
  }

  async function askForConfirmation(message, options = {}) {
    if (!isTauriRuntime()) return window.confirm(message);

    try {
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      return await confirm(message, {
        title: options.title || "Confirm",
        kind: options.kind || "warning",
        okLabel: options.okLabel || "OK",
        cancelLabel: options.cancelLabel || "Cancel",
      });
    } catch {
      return window.confirm(message);
    }
  }

  async function openTemplateLink() {
    const templateUrl =
      "https://docs.google.com/spreadsheets/d/1D7EKSKdevSB9MmpLLv80lq8ug07j-_KxGkFUHhtbXRg/edit?usp=sharing";

    try {
      if (isTauriRuntime()) {
        const { openUrl } = await import("@tauri-apps/plugin-opener");
        await openUrl(templateUrl);
        return;
      }

      window.open(templateUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      alert("Unable to open the template link: " + getErrorMessage(error));
    }
  }

  async function checkForUpdates() {
    if (!isTauriRuntime()) {
      alert("Updates are only available in the installed desktop app.");
      return;
    }

    setUpdateStatus("Checking...");

    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();

      if (!update) {
        setUpdateStatus("Up to date");
        alert("You are already using the latest version.");
        return;
      }

      const shouldInstall = await askForConfirmation(
        `Version ${update.version} is available. Download and install it now? The app may close during the update.`,
        {
          title: "Update Available",
          kind: "info",
          okLabel: "Update",
        }
      );

      if (!shouldInstall) {
        setUpdateStatus("Update available");
        return;
      }

      setUpdateStatus("Downloading update...");
      await update.downloadAndInstall();
      setUpdateStatus("Installing update...");
    } catch (error) {
      setUpdateStatus("Update failed");
      alert("Unable to update: " + getErrorMessage(error));
    }
  }

  async function exportSchedule() {
    const scheduleName = appSettings.title || "schedule";
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `${scheduleName}-${timestamp}.json`;

    const dataStr = JSON.stringify(workingState, null, 2);
    const dataBlob = new Blob([dataStr], { type: "application/json" });

    try {
      await saveBlobToFile(dataBlob, filename, [
        { name: "Schedule JSON", extensions: ["json"] },
      ]);
    } catch (error) {
      alert("Error exporting schedule: " + getErrorMessage(error));
    }
  }

  function importSchedule(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target.result;
        const filename = file.name.toLowerCase();

        if (filename.endsWith(".csv")) {
          const rows = parseCsv(text);
          if (rows.length < 2) {
            alert("CSV must include a header row and at least one data row.");
            return;
          }

          const headers = rows[0].map(normalizeCsvKey);
          const parsedClasses = rows.slice(1).map((row, rowIndex) => {
            const record = headers.reduce((acc, key, index) => {
              acc[key] = row[index] ? row[index].trim() : "";
              return acc;
            }, {});

            const semesterType = normalizeSemester(record.semester || record.term || "");
            return {
              id: crypto.randomUUID(),
              name: record.name || `Class ${rowIndex + 1}`,
              subject: record.subject || "",
              grades: parseGrades(record.grades),
              room: record.room || "",
              color: mapColorValue(record.color),
              checkGradeConflicts: parseBoolean(record.checkgradeconflicts, true),
              checkRoomConflicts: parseBoolean(record.checkroomconflicts, true),
              fullYear: semesterType === "all_year",
              notes: record.notes || "",
              placements: { "Semester 1": null, "Semester 2": null },
            };
          });

          if (!parsedClasses.length) {
            alert("No valid class rows were found in the CSV file.");
            return;
          }

          commit((state) => ({
            ...state,
            classes: [...parsedClasses, ...state.classes],
          }));
          alert(`Imported ${parsedClasses.length} classes from CSV.`);
          return;
        }

        const imported = JSON.parse(text);

        if (!imported.teachers || !imported.classes || !imported.scheduleBlocks || !imported.periodTimes) {
          alert("Invalid schedule file. Missing required data.");
          return;
        }

        const currentTeachersById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
        const importedTeachersById = new Map(imported.teachers.map((teacher) => [teacher.id, teacher]));
        const referencedTeacherIds = new Set();

        imported.classes.forEach((cls) => {
          Object.values(cls.placements || {}).forEach((placement) => {
            if (placement?.teacherId) referencedTeacherIds.add(placement.teacherId);
          });
        });
        imported.scheduleBlocks.forEach((block) => {
          if (block.teacherId) referencedTeacherIds.add(block.teacherId);
        });

        const missingTeachers = [...referencedTeacherIds]
          .filter((teacherId) => !importedTeachersById.has(teacherId))
          .map((teacherId, index) => ({
            id: teacherId,
            name: currentTeachersById.get(teacherId)?.name || `Imported Teacher ${index + 1}`,
          }));

        const normalizedImport = {
          ...imported,
          teachers: [...imported.teachers, ...missingTeachers],
        };

        if (!confirm("Load this schedule? Your current working schedule will be replaced.")) {
          return;
        }

        commit(() => normalizedImport);
        alert(
          missingTeachers.length
            ? `Schedule imported successfully. Added ${missingTeachers.length} missing teacher${missingTeachers.length === 1 ? "" : "s"} from the saved schedule.`
            : "Schedule imported successfully!"
        );
      } catch (error) {
        alert(`Failed to import schedule: ${error.message}`);
      }
    };
    reader.readAsText(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function buildPrintableScheduleElement() {
    const teacherCount = Math.max(teachers.length, 1);
    const lunchRows = appSettings.lunch?.enabled ? 1 : 0;
    const totalRows = PERIODS.length * SEMESTERS.length + lunchRows;
    const denseMode = teacherCount >= 11;
    const compactMode = teacherCount >= 8;
    const rowHeight = Math.max(0.43, Math.min(0.7, 6.58 / totalRows));
    const periodWidth = denseMode ? "0.48in" : compactMode ? "0.54in" : "0.62in";
    const semesterWidth = denseMode ? "0.36in" : "0.42in";
    const tableFontSize = denseMode ? "5.7px" : compactMode ? "6.2px" : "6.8px";
    const teacherFontSize = denseMode ? "5.9px" : compactMode ? "6.6px" : "7.4px";
    const entryTitleSize = denseMode ? "5.9px" : compactMode ? "6.4px" : "6.9px";
    const entryMetaSize = denseMode ? "4.8px" : compactMode ? "5.2px" : "5.6px";
    const cellPadding = denseMode ? "2px" : "2.5px";
    const generatedOn = new Date().toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const applyTextClamp = (element, lines = 2) => {
      element.style.display = "-webkit-box";
      element.style.webkitLineClamp = String(lines);
      element.style.webkitBoxOrient = "vertical";
      element.style.overflow = "hidden";
    };

    const applyCellBase = (cell, options = {}) => {
      cell.style.borderRight = "1px solid #cbd5e1";
      cell.style.borderBottom = "1px solid #cbd5e1";
      cell.style.padding = cellPadding;
      cell.style.verticalAlign = "top";
      cell.style.overflow = "hidden";
      cell.style.lineHeight = "1.15";
      cell.style.backgroundColor = options.background || "#ffffff";
      if (options.header) {
        cell.style.backgroundColor = "#f1f5f9";
        cell.style.color = "#0f172a";
        cell.style.fontWeight = "700";
        cell.style.textTransform = "uppercase";
        cell.style.letterSpacing = "0";
      }
      if (options.period) {
        cell.style.width = periodWidth;
        cell.style.backgroundColor = "#f8fafc";
        cell.style.color = "#334155";
        cell.style.fontWeight = "700";
      }
    };

    const html = document.createElement("div");
    html.className = "scheduler-print-sheet";
    html.style.boxSizing = "border-box";
    html.style.width = "10.64in";
    html.style.height = "8.14in";
    html.style.padding = "0.1in 0.12in";
    html.style.fontFamily = "Arial, sans-serif";
    html.style.backgroundColor = "#ffffff";
    html.style.color = "#0f172a";
    html.style.overflow = "hidden";
    
    const header = document.createElement("div");
    header.style.marginBottom = "0.08in";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "0.1in";
    header.style.borderBottom = "2px solid #0f172a";
    header.style.paddingBottom = "0.07in";
    
    if (appSettings.logoUrl) {
      const logoImg = document.createElement("img");
      logoImg.src = appSettings.logoUrl;
      logoImg.alt = "School Logo";
      logoImg.style.height = "0.45in";
      logoImg.style.width = "0.45in";
      logoImg.style.objectFit = "contain";
      logoImg.style.borderRadius = "4px";
      header.appendChild(logoImg);
    }
    
    const titleContainer = document.createElement("div");
    titleContainer.style.flex = "1";
    titleContainer.style.minWidth = "0";
    
    const title = document.createElement("h1");
    title.textContent = appSettings.title || "School Schedule";
    title.style.margin = "0";
    title.style.fontSize = denseMode ? "14px" : "15px";
    title.style.lineHeight = "1.05";
    title.style.fontWeight = "800";
    title.style.color = "#0f172a";
    applyTextClamp(title, 1);
    
    const subtitle = document.createElement("p");
    subtitle.textContent = appSettings.subtitle || "";
    subtitle.style.margin = "3px 0 0";
    subtitle.style.fontSize = "7.5px";
    subtitle.style.lineHeight = "1.2";
    subtitle.style.color = "#475569";
    applyTextClamp(subtitle, 1);
    
    titleContainer.appendChild(title);
    if (appSettings.subtitle) titleContainer.appendChild(subtitle);
    header.appendChild(titleContainer);

    const meta = document.createElement("div");
    meta.style.textAlign = "right";
    meta.style.fontSize = "7px";
    meta.style.lineHeight = "1.35";
    meta.style.color = "#475569";
    meta.style.whiteSpace = "nowrap";
    meta.innerHTML = `<strong style="color:#0f172a;">Two-semester view</strong><br>Printed ${generatedOn}<br>${teacherCount} teacher${teacherCount === 1 ? "" : "s"}`;
    header.appendChild(meta);
    
    html.appendChild(header);
    
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.height = "6.95in";
    table.style.fontSize = tableFontSize;
    table.style.tableLayout = "fixed";
    table.style.border = "1px solid #cbd5e1";
    table.style.borderRadius = "6px";
    table.style.overflow = "hidden";
    
    const headerRow = document.createElement("tr");
    headerRow.style.height = "0.22in";
    const periodHeader = document.createElement("th");
    periodHeader.textContent = "Period";
    periodHeader.style.textAlign = "left";
    applyCellBase(periodHeader, { header: true, period: true });
    headerRow.appendChild(periodHeader);

    const semesterHeader = document.createElement("th");
    semesterHeader.textContent = "Term";
    semesterHeader.style.width = semesterWidth;
    semesterHeader.style.textAlign = "left";
    applyCellBase(semesterHeader, { header: true });
    headerRow.appendChild(semesterHeader);
    
    teachers.forEach((teacher) => {
      const th = document.createElement("th");
      th.style.textAlign = "left";
      th.style.fontSize = teacherFontSize;
      applyCellBase(th, { header: true });

      const teacherName = document.createElement("div");
      teacherName.textContent = teacher.name;
      teacherName.style.fontSize = teacherFontSize;
      teacherName.style.lineHeight = "1.12";
      applyTextClamp(teacherName, 2);
      th.appendChild(teacherName);

      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    
    const appendPrintableClass = (cell, cls, isFullYear = false) => {
          const classDiv = document.createElement("div");
          classDiv.style.marginBottom = "2px";
          classDiv.style.padding = denseMode ? "2px" : "2.5px";
          classDiv.style.backgroundColor = isFullYear ? "#ecfdf5" : "#eff6ff";
          classDiv.style.border = isFullYear ? "1px solid #86efac" : "1px solid #93c5fd";
          classDiv.style.borderLeft = isFullYear ? "2px solid #16a34a" : "2px solid #2563eb";
          classDiv.style.borderRadius = "3px";
          classDiv.style.fontSize = tableFontSize;
          classDiv.style.lineHeight = "1.12";
          classDiv.style.overflow = "hidden";
          classDiv.style.breakInside = "avoid";
          
          const className = document.createElement("div");
          className.textContent = cls.name;
          className.style.fontWeight = "700";
          className.style.fontSize = entryTitleSize;
          className.style.color = isFullYear ? "#14532d" : "#0f172a";
          applyTextClamp(className, 2);
          classDiv.appendChild(className);

          const metaParts = [];
          if (isFullYear) metaParts.push("Full year");
          if (cls.subject) metaParts.push(cls.subject);
          if (cls.room) metaParts.push(`Room ${cls.room}`);
          if (cls.grades?.length) metaParts.push(`Gr. ${cls.grades.join(",")}`);
          
          if (metaParts.length) {
            const classMeta = document.createElement("div");
            classMeta.textContent = metaParts.join(" • ");
            classMeta.style.marginTop = "1px";
            classMeta.style.fontSize = entryMetaSize;
            classMeta.style.color = "#475569";
            applyTextClamp(classMeta, 1);
            classDiv.appendChild(classMeta);
          }
          
          cell.appendChild(classDiv);
    };

    const appendPrintableBlock = (cell, block) => {
          const blockDiv = document.createElement("div");
          blockDiv.textContent = block.name;
          blockDiv.style.padding = denseMode ? "2px" : "2.5px";
          blockDiv.style.backgroundColor = "#f8fafc";
          blockDiv.style.border = "1px solid #cbd5e1";
          blockDiv.style.borderLeft = "2px solid #64748b";
          blockDiv.style.borderRadius = "3px";
          blockDiv.style.fontSize = entryTitleSize;
          blockDiv.style.color = "#334155";
          blockDiv.style.fontStyle = "italic";
          blockDiv.style.marginBottom = "2px";
          blockDiv.style.lineHeight = "1.12";
          blockDiv.style.overflow = "hidden";
          applyTextClamp(blockDiv, 2);
          cell.appendChild(blockDiv);
    };

    PERIODS.forEach((period) => {
      SEMESTERS.forEach((activeSemester, semesterIndex) => {
        const row = document.createElement("tr");
        row.style.height = `${rowHeight}in`;

        if (semesterIndex === 0) {
          const periodCell = document.createElement("td");
          periodCell.rowSpan = SEMESTERS.length;
          applyCellBase(periodCell, { period: true });

          const periodText = document.createElement("div");
          periodText.textContent = `Period ${period}`;
          periodText.style.fontSize = denseMode ? "5.8px" : "6.4px";
          periodCell.appendChild(periodText);

          const timeText = document.createElement("div");
          timeText.textContent = periodTimes[period] || "";
          timeText.style.marginTop = "2px";
          timeText.style.fontSize = denseMode ? "4.8px" : "5.4px";
          timeText.style.fontWeight = "400";
          timeText.style.color = "#64748b";
          periodCell.appendChild(timeText);

          row.appendChild(periodCell);
        }

        const semesterCell = document.createElement("td");
        semesterCell.textContent = getSemesterShortLabel(activeSemester);
        applyCellBase(semesterCell, { background: "#f8fafc" });
        semesterCell.style.width = semesterWidth;
        semesterCell.style.fontWeight = "700";
        semesterCell.style.color = "#475569";
        semesterCell.style.backgroundColor = "#f8fafc";
        row.appendChild(semesterCell);

        teachers.forEach((teacher) => {
          const fullYearClasses = classes.filter((c) => {
            if (!c.fullYear) return false;
            const first = c.placements?.["Semester 1"];
            const second = c.placements?.["Semester 2"];
            return (
              (first?.teacherId === teacher.id && first?.period === period) ||
              (second?.teacherId === teacher.id && second?.period === period)
            );
          });
          const fullSpanBlocks = scheduleBlocks.filter(
            (b) => isFullSpanBlock(b) && b.teacherId === teacher.id && b.period === period
          );
          const hasFullSpanItems = fullYearClasses.length || fullSpanBlocks.length;

          if (hasFullSpanItems && semesterIndex === 1) return;

          const cell = document.createElement("td");
          if (hasFullSpanItems && semesterIndex === 0) {
            cell.rowSpan = SEMESTERS.length;
            cell.style.backgroundColor = "#f7fee7";
          }
          applyCellBase(cell, hasFullSpanItems ? { background: "#f7fee7" } : undefined);

          if (hasFullSpanItems) {
            fullSpanBlocks.forEach((block) => appendPrintableBlock(cell, block));
            fullYearClasses.forEach((cls) => appendPrintableClass(cell, cls, true));
          } else {
            const classesInCell = classes.filter(
              (c) =>
                !c.fullYear &&
                c.placements?.[activeSemester]?.teacherId === teacher.id &&
                c.placements?.[activeSemester]?.period === period
            );

            const blocksInCell = scheduleBlocks.filter(
              (b) =>
                !isFullSpanBlock(b) &&
                b.semester === activeSemester &&
                b.teacherId === teacher.id &&
                b.period === period
            );

            blocksInCell.forEach((block) => appendPrintableBlock(cell, block));
            classesInCell.forEach((cls) => appendPrintableClass(cell, cls));
          }

          row.appendChild(cell);
        });

        table.appendChild(row);
      });

      if (appSettings.lunch?.enabled && period === appSettings.lunch.afterPeriod) {
        const lunchRow = document.createElement("tr");
        lunchRow.style.height = "0.26in";

        const lunchPeriodCell = document.createElement("td");
        lunchPeriodCell.colSpan = 2;
        applyCellBase(lunchPeriodCell, { period: true, background: "#f0fdf4" });

        const lunchText = document.createElement("div");
        lunchText.textContent = "Lunch";
        lunchPeriodCell.appendChild(lunchText);

        const lunchTimeText = document.createElement("div");
        lunchTimeText.textContent = appSettings.lunch.time || "";
        lunchTimeText.style.fontSize = denseMode ? "4.8px" : "5.4px";
        lunchTimeText.style.fontWeight = "400";
        lunchTimeText.style.color = "#166534";
        lunchPeriodCell.appendChild(lunchTimeText);

        lunchRow.appendChild(lunchPeriodCell);

        teachers.forEach(() => {
          const lunchCell = document.createElement("td");
          applyCellBase(lunchCell, { background: "#f0fdf4" });

          const lunchDiv = document.createElement("div");
          lunchDiv.textContent = "Shared Lunch";
          lunchDiv.style.padding = "2px";
          lunchDiv.style.backgroundColor = "#dcfce7";
          lunchDiv.style.border = "1px solid #86efac";
          lunchDiv.style.borderRadius = "3px";
          lunchDiv.style.fontSize = entryMetaSize;
          lunchDiv.style.fontWeight = "700";
          lunchDiv.style.color = "#166534";
          lunchDiv.style.textAlign = "center";
          lunchCell.appendChild(lunchDiv);

          lunchRow.appendChild(lunchCell);
        });

        table.appendChild(lunchRow);
      }
    });
    
    html.appendChild(table);
    
    const footer = document.createElement("div");
    footer.style.marginTop = "0.05in";
    footer.style.display = "flex";
    footer.style.justifyContent = "space-between";
    footer.style.fontSize = "6.5px";
    footer.style.color = "#64748b";
    footer.innerHTML = `<span>WVCS Master Schedule</span><span>${appSettings.title || "School Schedule"} • includes grade levels</span>`;
    html.appendChild(footer);

    return html;
  }

  function getPrintableDocumentHtml() {
    const printable = buildPrintableScheduleElement();
    return `
      <!doctype html>
      <html>
        <head>
          <title>${appSettings.title || "School Schedule"}</title>
          <base href="${window.location.href}">
          <style>
            @page {
              size: letter landscape;
              margin: 0.18in;
            }

            * {
              box-sizing: border-box;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }

            html,
            body {
              margin: 0;
              background: #ffffff;
              width: 100%;
              height: 100%;
              overflow: hidden;
            }

            body {
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: flex-start;
            }

            table,
            tr,
            td,
            th {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          </style>
        </head>
        <body>${printable.outerHTML}</body>
      </html>
    `;
  }

  function printSchedule() {
    const originalTitle = document.title;
    const originalBody = document.body.innerHTML;
    const printableDocument = new DOMParser().parseFromString(getPrintableDocumentHtml(), "text/html");
    const printStyle = printableDocument.head.querySelector("style");

    document.title = appSettings.title || "School Schedule";
    document.body.innerHTML = printableDocument.body.innerHTML;
    if (printStyle) document.head.appendChild(printStyle);

    const restore = () => {
      document.title = originalTitle;
      document.body.innerHTML = originalBody;
      printStyle?.remove();
      window.location.reload();
    };

    window.addEventListener("afterprint", restore, { once: true });
    setTimeout(() => {
      window.print();
      setTimeout(restore, 1000);
    }, 100);
  }

  async function exportPDF() {
    const scheduleName = appSettings.title || "schedule";
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `${scheduleName}-${timestamp}.pdf`;
    const html = buildPrintableScheduleElement();
    
    const opt = {
      margin: [0, 0, 0, 0],
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2.5, backgroundColor: "#ffffff", useCORS: true },
      jsPDF: { orientation: "landscape", unit: "mm", format: "letter" },
      pagebreak: { mode: ["avoid-all"] },
    };

    try {
      const pdfBlob = await html2pdf().set(opt).from(html).outputPdf("blob");
      await saveBlobToFile(pdfBlob, filename, [
        { name: "PDF", extensions: ["pdf"] },
      ]);
    } catch (error) {
      alert("Error exporting PDF: " + getErrorMessage(error));
    }
  }

  function renameVersion(versionId) {
    const version = versions.find((v) => v.id === versionId);
    if (!version) return;
    const name = prompt("Rename version:", version.name);
    if (!name) return;
    setVersions((prev) => prev.map((v) => (v.id === versionId ? { ...v, name } : v)));
  }

  function duplicateVersion(version) {
    setVersions((prev) => [
      {
        ...version,
        id: crypto.randomUUID(),
        name: `${version.name} Copy`,
        savedAt: new Date().toISOString(),
      },
      ...prev,
    ]);
  }

  const conflictMap = useMemo(() => {
    const conflicts = new Map();

    function addConflict(classId, conflict) {
      conflicts.set(classId, [...(conflicts.get(classId) || []), conflict]);
    }

    for (const activeSemester of SEMESTERS) {
      for (const period of PERIODS) {
        const inPeriod = classes.filter((c) => c.placements?.[activeSemester]?.period === period);

        for (let i = 0; i < inPeriod.length; i++) {
          for (let j = i + 1; j < inPeriod.length; j++) {
            const a = inPeriod[i];
            const b = inPeriod[j];

            if (a.checkGradeConflicts && b.checkGradeConflicts) {
              const overlap = a.grades.filter((g) => b.grades.includes(g));
              if (overlap.length) {
                addConflict(a.id, { type: "grade", with: b.name, grades: overlap, period, semester: activeSemester });
                addConflict(b.id, { type: "grade", with: a.name, grades: overlap, period, semester: activeSemester });
              }
            }

            if (a.checkRoomConflicts && b.checkRoomConflicts) {
              const roomA = a.room?.trim().toLowerCase();
              const roomB = b.room?.trim().toLowerCase();
              if (roomA && roomB && roomA === roomB) {
                addConflict(a.id, { type: "room", with: b.name, room: a.room, period, semester: activeSemester });
                addConflict(b.id, { type: "room", with: a.name, room: b.room, period, semester: activeSemester });
              }
            }
          }
        }
      }
    }

    return conflicts;
  }, [classes]);

  const unscheduled = classes.filter((c) => !SEMESTERS.some((activeSemester) => c.placements?.[activeSemester]));
  const conflictList = Array.from(conflictMap.entries());
  const activeCellPickerKey = activeCellPicker
    ? `${activeCellPicker.teacherId}-${activeCellPicker.period}-${activeCellPicker.semester}`
    : "";

  function classSearchText(cls) {
    return [cls.name, cls.subject, cls.room, ...(cls.grades || [])].filter(Boolean).join(" ").toLowerCase();
  }

  function getClassPickerMatches(query) {
    const normalized = String(query || "").trim().toLowerCase();
    return unscheduled
      .filter((cls) => !normalized || classSearchText(cls).includes(normalized))
      .slice(0, 8);
  }

  function handleDrop(e, teacherId, period, targetSemester) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("dragData");
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.kind === "class") {
      placeClass(data.id, teacherId, period, targetSemester);
      setActiveCellPicker(null);
    }

    if (data.kind === "block-template") {
      addScheduleBlock(data.blockType, teacherId, period, targetSemester);
      setActiveCellPicker(null);
    }
  }

  function placeItem(item, teacherId, period, targetSemester) {
    if (!item) return;

    if (item.kind === "class") {
      placeClass(item.id, teacherId, period, targetSemester);
      setSelectedItem(null);
      setActiveCellPicker(null);
      return;
    }

    if (item.kind === "block-template") {
      addScheduleBlock(item.blockType, teacherId, period, targetSemester);
    }
  }

  function placeSelectedItem(teacherId, period, targetSemester) {
    placeItem(selectedItem, teacherId, period, targetSemester);
  }

  function openCellPicker(teacherId, period, targetSemester) {
    if (selectedItem) {
      placeSelectedItem(teacherId, period, targetSemester);
      return;
    }
    setActiveCellPicker({ teacherId, period, semester: targetSemester, query: "" });
  }

  function placeClassFromPicker(classId, teacherId, period, targetSemester) {
    placeClass(classId, teacherId, period, targetSemester);
    setActiveCellPicker(null);
  }

  function handlePointerDragStart(e, item) {
    if (e.button !== 0 || e.target.closest("button, input, textarea, select")) return;

    setSelectedItem(item);
    setDragPreview({
      item,
      x: e.clientX,
      y: e.clientY,
      startedAt: { x: e.clientX, y: e.clientY },
    });
  }

  useEffect(() => {
    if (!dragPreview) return undefined;

    function handlePointerMove(e) {
      setDragPreview((current) => (current ? { ...current, x: e.clientX, y: e.clientY } : current));
    }

    function handlePointerUp(e) {
      const current = dragPreview;
      setDragPreview(null);
      if (!current) return;

      const moved = Math.hypot(
        e.clientX - current.startedAt.x,
        e.clientY - current.startedAt.y
      );
      if (moved < 8) return;

      const target = document.elementFromPoint(e.clientX, e.clientY);
      const cell = target?.closest("[data-schedule-cell='true']");
      if (cell) {
        placeItem(current.item, cell.dataset.teacherId, Number(cell.dataset.period), cell.dataset.semester);
        return;
      }

      const unscheduledDrop = target?.closest("[data-unscheduled-drop='true']");
      if (unscheduledDrop && current.item.kind === "class") {
        unscheduleClass(current.item.id);
        setSelectedItem(null);
      }
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  // The pointer listener only lives for one drag gesture and should use the gesture snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragPreview]);

  function placeClass(classId, teacherId, period, targetSemester = "Semester 1") {
    commit((state) => ({
      ...state,
      classes: state.classes.map((c) =>
        c.id === classId
          ? {
              ...c,
              placements: c.fullYear
                ? {
                    "Semester 1": { teacherId, period },
                    "Semester 2": { teacherId, period },
                  }
                : {
                    "Semester 1": null,
                    "Semester 2": null,
                    [targetSemester]: { teacherId, period },
                  },
            }
          : c
      ),
    }));
  }

  function unscheduleClass(classId) {
    commit((state) => ({
      ...state,
      classes: state.classes.map((c) =>
        c.id === classId
          ? {
              ...c,
              placements: c.fullYear
                ? { "Semester 1": null, "Semester 2": null }
                : { "Semester 1": null, "Semester 2": null },
            }
          : c
      ),
    }));
  }

  function addScheduleBlock(blockType, teacherId, period, targetSemester = "Semester 1") {
    const template = blockTemplates.find((t) => t.blockType === blockType);
    if (!template) return;

    commit((state) => ({
      ...state,
      scheduleBlocks: [
        ...state.scheduleBlocks,
        {
          id: crypto.randomUUID(),
          blockType,
          name: template.name,
          color: template.color,
          semester: FULL_SPAN_BLOCK_TYPES.has(blockType) ? "Both" : targetSemester,
          teacherId,
          period,
        },
      ],
    }));
  }

  function removeScheduleBlock(blockId) {
    commit((state) => ({
      ...state,
      scheduleBlocks: state.scheduleBlocks.filter((b) => b.id !== blockId),
    }));
  }

  async function removeClass(classId) {
    const cls = classes.find((item) => item.id === classId);
    const className = cls?.name || "this class";
    const confirmed = await askForConfirmation(
      `Are you sure you want to permanently delete "${className}"?`,
      {
        title: "Delete Class",
        okLabel: "Delete Class",
      }
    );
    if (!confirmed) return;

    commit((state) => ({
      ...state,
      classes: state.classes.filter((c) => c.id !== classId),
    }));
  }

  function saveClass(updated) {
    commit((state) => ({
      ...state,
      classes: state.classes.map((c) => (c.id === updated.id ? updated : c)),
    }));
    setEditingClass(null);
  }

  function addClass() {
    const next = blankClass();
    commit((state) => ({
      ...state,
      classes: [next, ...state.classes],
    }));
    setEditingClass(next);
  }

  function addTeacher() {
    const name = newTeacherName.trim();
    if (!name) return;
    commit((state) => ({
      ...state,
      teachers: [...state.teachers, { id: crypto.randomUUID(), name }],
    }));
    setNewTeacherName("");
  }

  function removeTeacher(teacherId) {
    commit((state) => ({
      ...state,
      teachers: state.teachers.filter((t) => t.id !== teacherId),
      classes: state.classes.map((c) => {
        const updatedPlacements = { ...c.placements };
        for (const sem of SEMESTERS) {
          if (updatedPlacements[sem]?.teacherId === teacherId) updatedPlacements[sem] = null;
        }
        return { ...c, placements: updatedPlacements };
      }),
      scheduleBlocks: state.scheduleBlocks.filter((b) => b.teacherId !== teacherId),
    }));
  }

  function moveTeacher(teacherId, direction) {
    commit((state) => {
      const index = state.teachers.findIndex((teacher) => teacher.id === teacherId);
      const nextIndex = index + direction;

      if (index < 0 || nextIndex < 0 || nextIndex >= state.teachers.length) {
        return state;
      }

      const teachers = [...state.teachers];
      const [teacher] = teachers.splice(index, 1);
      teachers.splice(nextIndex, 0, teacher);

      return { ...state, teachers };
    });
  }

  function startEditingTeacher(teacher) {
    setEditingTeacherId(teacher.id);
    setEditingTeacherName(teacher.name);
  }

  function saveTeacherEdit(teacherId) {
    const name = editingTeacherName.trim();
    if (!name) return;
    commit((state) => ({
      ...state,
      teachers: state.teachers.map((t) => (t.id === teacherId ? { ...t, name } : t)),
    }));
    setEditingTeacherId(null);
    setEditingTeacherName("");
  }

  function cancelTeacherEdit() {
    setEditingTeacherId(null);
    setEditingTeacherName("");
  }

  function updatePeriodTime(period, value) {
    commit((state) => ({
      ...state,
      periodTimes: { ...state.periodTimes, [period]: value },
    }));
  }

  function saveSettings(updated) {
    commit((state) => ({
      ...state,
      appSettings: updated,
    }));
    setSettingsOpen(false);
  }

  function getFullYearClassesForCell(teacherId, period) {
    return classes.filter((cls) => {
      if (!cls.fullYear) return false;
      const firstPlacement = cls.placements?.["Semester 1"];
      const secondPlacement = cls.placements?.["Semester 2"];
      return (
        (firstPlacement?.teacherId === teacherId && firstPlacement?.period === period) ||
        (secondPlacement?.teacherId === teacherId && secondPlacement?.period === period)
      );
    });
  }

  function getFullSpanBlocksForCell(teacherId, period) {
    return scheduleBlocks.filter(
      (block) => isFullSpanBlock(block) && block.teacherId === teacherId && block.period === period
    );
  }

  function getClassesForSemesterSlot(teacherId, period, targetSemester) {
    return classes.filter(
      (cls) =>
        !cls.fullYear &&
        cls.placements?.[targetSemester]?.teacherId === teacherId &&
        cls.placements?.[targetSemester]?.period === period
    );
  }

  function getBlocksForSemesterSlot(teacherId, period, targetSemester) {
    return scheduleBlocks.filter(
      (block) =>
        !isFullSpanBlock(block) &&
        block.semester === targetSemester &&
        block.teacherId === teacherId &&
        block.period === period
    );
  }

  function renderSemesterSlot(teacher, period, targetSemester, options = {}) {
    const slotKey = `${teacher.id}-${period}-${targetSemester}`;
    const classesInSlot = options.fullYear
      ? getFullYearClassesForCell(teacher.id, period)
      : getClassesForSemesterSlot(teacher.id, period, targetSemester);
    const blocksInSlot = options.fullYear
      ? getFullSpanBlocksForCell(teacher.id, period)
      : getBlocksForSemesterSlot(teacher.id, period, targetSemester);
    const isPickerOpen = activeCellPickerKey === slotKey;
    const pickerMatches = isPickerOpen ? getClassPickerMatches(activeCellPicker.query) : [];

    return (
      <div
        key={slotKey}
        data-schedule-cell="true"
        data-teacher-id={teacher.id}
        data-period={period}
        data-semester={targetSemester}
        className={`min-w-0 overflow-hidden border-slate-800 p-1 transition hover:bg-slate-800/70 ${
          options.fullYear ? "row-span-2 border-b bg-emerald-950/25" : "border-b"
        } ${selectedItem ? "cursor-copy bg-slate-800/30" : "cursor-text"}`}
        onClick={() => openCellPicker(teacher.id, period, targetSemester)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => handleDrop(e, teacher.id, period, targetSemester)}
      >
        <div className="min-w-0 space-y-1 overflow-hidden">
          {!options.fullYear && (
            <div className="no-print mb-1 inline-flex rounded-md bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
              {getSemesterShortLabel(targetSemester)}
            </div>
          )}

          {isPickerOpen && (
            <div
              className="no-print rounded-lg border border-sky-500/50 bg-slate-950 p-1.5 shadow-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                value={activeCellPicker.query}
                onChange={(e) =>
                  setActiveCellPicker((current) =>
                    current ? { ...current, query: e.target.value } : current
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setActiveCellPicker(null);
                  }
                  if (e.key === "Enter" && pickerMatches[0]) {
                    placeClassFromPicker(pickerMatches[0].id, teacher.id, period, targetSemester);
                  }
                }}
                placeholder={`Type class for ${getSemesterShortLabel(targetSemester)}...`}
                className="w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-slate-100 outline-none focus:border-sky-400"
              />
              <div className="mt-1 max-h-40 overflow-auto">
                {pickerMatches.length ? (
                  pickerMatches.map((cls) => (
                    <button
                      key={cls.id}
                      type="button"
                      onClick={() => placeClassFromPicker(cls.id, teacher.id, period, targetSemester)}
                      className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-slate-200 hover:bg-slate-800"
                    >
                      <span className="font-semibold text-white">{cls.name}</span>
                      <span className="ml-1 text-slate-400">
                        {[
                          cls.fullYear ? "Full year" : getSemesterShortLabel(targetSemester),
                          cls.subject,
                          cls.room ? `Rm ${cls.room}` : "",
                          cls.grades?.length ? `Gr. ${cls.grades.join(",")}` : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </button>
                  ))
                ) : (
                  <div className="px-2 py-2 text-xs text-slate-500">No unscheduled classes match.</div>
                )}
              </div>
            </div>
          )}

          {!isPickerOpen && !blocksInSlot.length && !classesInSlot.length && !selectedItem && (
            <div className="no-print rounded-md border border-dashed border-slate-700 px-2 py-2 text-center text-[11px] text-slate-500">
              Click to type a class
            </div>
          )}

          {blocksInSlot.map((block) => (
            <ScheduleBlockCard key={block.id} block={block} onRemove={removeScheduleBlock} />
          ))}

          {classesInSlot.map((cls) => (
            <ClassCard
              key={cls.id}
              cls={cls}
              conflict={conflictMap.has(cls.id)}
              selected={selectedItem?.kind === "class" && selectedItem.id === cls.id}
              onEdit={setEditingClass}
              onRemove={removeClass}
              onSelect={setSelectedItem}
              onPointerDragStart={handlePointerDragStart}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-none space-y-4">
        <div className="no-print rounded-3xl border border-slate-700 bg-slate-900/95 p-5 shadow-xl flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-5">
            {appSettings.logoUrl && (
              <img
                src={appSettings.logoUrl}
                alt="School Logo"
                className="h-32 w-32 rounded-2xl object-contain shadow-sm"
              />
            )}

            <div>
              <h1 className="text-3xl font-bold tracking-tight text-white">{appSettings.title}</h1>
              <p className="text-sm text-slate-400">{appSettings.subtitle}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 bg-slate-950/70 p-1 rounded-xl border border-slate-700">
            <div className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-medium text-slate-200">
              Two-semester grid
            </div>

            <Button variant="outline" onClick={undo} disabled={!undoStack.length}>
              <Undo2 size={16} className="mr-1 inline" /> Undo
            </Button>

            <Button variant="outline" onClick={redo} disabled={!redoStack.length}>
              <Redo2 size={16} className="mr-1 inline" /> Redo
            </Button>

            <Button variant="success" onClick={saveVersion}>
              <Save size={16} className="mr-1 inline" /> Save Version
            </Button>

            <Button variant="outline" onClick={() => setVersionHistoryOpen(true)}>
              <History size={16} className="mr-1 inline" /> Versions
            </Button>

            <MenuButton label="File">
              <MenuItem icon={Upload} onClick={() => fileInputRef.current?.click()}>
                Import Schedule
              </MenuItem>
              <MenuItem icon={Download} onClick={exportSchedule}>
                Export Schedule
              </MenuItem>
              <MenuItem icon={FileText} onClick={exportPDF}>
                Export PDF
              </MenuItem>
              <MenuItem icon={Printer} onClick={printSchedule}>
                Print
              </MenuItem>
            </MenuButton>

            <MenuButton label="Tools">
              <MenuItem icon={RefreshCw} onClick={checkForUpdates}>
                Check for Updates
              </MenuItem>
              <MenuItem icon={Settings} onClick={() => setSettingsOpen(true)}>
                Settings
              </MenuItem>
            </MenuButton>

            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              onChange={importSchedule}
              className="hidden"
            />
            <input
              ref={classImportRef}
              type="file"
              accept=".csv"
              onChange={importClasses}
              className="hidden"
            />
          </div>
          {updateStatus && <div className="text-xs text-slate-400">{updateStatus}</div>}
        </div>

        <div className="no-print">
          {conflictList.length > 0 && (
            <Card className="border-red-500 bg-red-950/60 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-2 text-red-100">
                  <AlertTriangle className="mt-0.5 text-red-300" size={18} />
                  <div>
                    <div className="font-semibold">Conflicts detected</div>
                    <div className="mt-1 space-y-1 text-sm">
                      {conflictList.map(([classId, conflicts]) => {
                        const cls = classes.find((c) => c.id === classId);
                        return conflicts.map((conflict, index) => (
                          <div key={`${classId}-${index}`}>
                            {conflict.type === "grade"
                              ? `${cls?.name} conflicts with ${conflict.with} in ${conflict.semester}, Period ${conflict.period} for grade(s) ${conflict.grades.join(", ")}.`
                              : conflict.type === "lunch"
                              ? `${cls?.name} cannot be scheduled in Period ${conflict.period} because of ${conflict.with}.`
                              : `${cls?.name} conflicts with ${conflict.with} in ${conflict.semester}, Period ${conflict.period} because both use room ${conflict.room}.`}
                          </div>
                        ));
                      })}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <Card className="no-print shadow-xl">
          <CardContent className="p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="font-semibold text-white">Unscheduled Classes</div>
                <div className="text-xs text-slate-400">
                  {selectedItem
                    ? "Click a schedule cell to place the selected item."
                    : "Click or drag a class into the schedule."}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button onClick={addClass} className="py-1.5">
                  <Plus size={16} className="mr-1 inline" /> Class
                </Button>
                <button
                  type="button"
                  title="View CSV template"
                  aria-label="View CSV template"
                  className="rounded-lg border border-slate-600 bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
                  onClick={openTemplateLink}
                >
                  <FileText size={16} />
                </button>
                <button
                  type="button"
                  title="Import classes from CSV only"
                  aria-label="Import classes from CSV only"
                  className="rounded-lg border border-slate-600 bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
                  onClick={() => classImportRef.current?.click()}
                >
                  <Upload size={16} />
                </button>
              </div>
            </div>

            <div
              data-unscheduled-drop="true"
              className="min-h-16 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-2"
              onClick={() => {
                if (selectedItem?.kind === "class") {
                  unscheduleClass(selectedItem.id);
                  setSelectedItem(null);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const raw = e.dataTransfer.getData("dragData");
                if (!raw) return;
                const data = JSON.parse(raw);
                if (data.kind === "class") unscheduleClass(data.id);
              }}
            >
              {unscheduled.length ? (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(140px,170px))] gap-2">
                  {unscheduled.map((cls) => (
                    <ClassCard
                      key={cls.id}
                      cls={cls}
                      conflict={conflictMap.has(cls.id)}
                      selected={selectedItem?.kind === "class" && selectedItem.id === cls.id}
                      onEdit={setEditingClass}
                      onRemove={removeClass}
                      onSelect={setSelectedItem}
                      onPointerDragStart={handlePointerDragStart}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-sm text-slate-500">All classes are scheduled.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {sidebarHidden && (
          <button
            type="button"
            aria-label="Show sidebar"
            className="fixed left-0 top-1/2 z-50 -translate-y-1/2 rounded-r-full border border-slate-600 bg-slate-900 p-2 text-slate-100 shadow-xl transition hover:bg-slate-800 print:hidden"
            onClick={() => setSidebarHidden(false)}
          >
            <ChevronLeft size={18} className="rotate-180" />
          </button>
        )}

        <div className={sidebarGridClass}>
            {!sidebarHidden && (
              <aside className="no-print min-w-0 space-y-4">
                <button
                  type="button"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
                  onClick={() => setSidebarHidden(true)}
                  aria-label="Hide sidebar"
                >
                  <ChevronLeft size={16} />
                  Hide tools
                </button>

            <Card className="shadow-xl">
              <CardContent className="p-3 space-y-2">
                <h2 className="font-semibold text-white">Reusable Blocks</h2>
                <div className="space-y-1.5">
                  {blockTemplates.map((template) => (
                    <BlockTemplateCard
                      key={template.blockType}
                      template={template}
                      selected={
                        selectedItem?.kind === "block-template" &&
                        selectedItem.blockType === template.blockType
                      }
                      onSelect={setSelectedItem}
                      onPointerDragStart={handlePointerDragStart}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xl">
              <CardContent className="p-3 space-y-2">
                <h2 className="font-semibold text-white">Teachers</h2>
                <div className="flex gap-1.5">
                  <input
                    value={newTeacherName}
                    onChange={(e) => setNewTeacherName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTeacher()}
                    placeholder="Add teacher name"
                    className="w-full min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <Button onClick={addTeacher} className="px-2 py-1.5">
                    <Plus size={16} />
                  </Button>
                </div>

                <div className="space-y-1.5">
                  {teachers.map((teacher, index) => (
                    <div
                      key={teacher.id}
                      className="flex items-center justify-between gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm"
                    >
                      {editingTeacherId === teacher.id ? (
                        <input
                          type="text"
                          value={editingTeacherName}
                          onChange={(e) => setEditingTeacherName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveTeacherEdit(teacher.id);
                            if (e.key === "Escape") cancelTeacherEdit();
                          }}
                          className="min-w-0 flex-1 rounded-lg bg-slate-800 border border-slate-600 px-2 py-1 text-slate-100 focus:outline-none focus:border-sky-400"
                          autoFocus
                        />
                      ) : (
                        <span className="min-w-0 flex-1 truncate">{teacher.name}</span>
                      )}
                      <div className="flex items-center gap-1">
                        {editingTeacherId === teacher.id ? (
                          <>
                            <button
                              onClick={() => saveTeacherEdit(teacher.id)}
                              className="text-slate-500 hover:text-emerald-400 transition-colors"
                              title="Save"
                            >
                              <Save size={14} />
                            </button>
                            <button
                              onClick={cancelTeacherEdit}
                              className="text-slate-500 hover:text-slate-300 transition-colors"
                              title="Cancel"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => moveTeacher(teacher.id, -1)}
                              disabled={index === 0}
                              className="text-slate-500 transition-colors hover:text-sky-400 disabled:opacity-25 disabled:hover:text-slate-500"
                              title="Move left"
                            >
                              <ChevronLeft size={14} />
                            </button>
                            <button
                              onClick={() => moveTeacher(teacher.id, 1)}
                              disabled={index === teachers.length - 1}
                              className="text-slate-500 transition-colors hover:text-sky-400 disabled:opacity-25 disabled:hover:text-slate-500"
                              title="Move right"
                            >
                              <ChevronRight size={14} />
                            </button>
                            <button
                              onClick={() => startEditingTeacher(teacher)}
                              className="text-slate-500 hover:text-sky-400 transition-colors"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => removeTeacher(teacher.id)}
                              className="text-slate-500 hover:text-red-400 transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xl">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-slate-300" />
                  <h2 className="font-semibold text-white">Period Times</h2>
                </div>

                <div className="space-y-1.5">
                  {PERIODS.map((period) => (
                    <label key={period} className="grid grid-cols-[24px_1fr] items-center gap-1 text-xs">
                      <span className="text-slate-300">P{period}</span>
                      <input
                        value={periodTimes[period] || ""}
                        onChange={(e) => updatePeriodTime(period, e.target.value)}
                        placeholder="8:15–9:00"
                        className="min-w-0 rounded-lg border border-slate-600 bg-slate-950 px-1.5 py-1.5 text-slate-100 placeholder:text-slate-500"
                      />
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>
          )}

          <main className="screen-schedule min-w-0 overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-inner">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-700 bg-slate-950/80 px-3 py-2 text-sm text-slate-200">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 bg-slate-800 p-2 hover:bg-slate-700"
                  onClick={() => adjustScheduleZoom(-0.1)}
                  aria-label="Zoom out"
                  title="Zoom out"
                >
                  <ZoomOut size={16} />
                </button>
                <input
                  type="range"
                  min="0.65"
                  max="1.1"
                  step="0.05"
                  value={scheduleZoom}
                  onChange={(e) => setScheduleZoom(clampScheduleZoom(e.target.value))}
                  className="w-28 accent-sky-400"
                  aria-label="Schedule zoom"
                />
                <button
                  type="button"
                  className="rounded-lg border border-slate-600 bg-slate-800 p-2 hover:bg-slate-700"
                  onClick={() => adjustScheduleZoom(0.1)}
                  aria-label="Zoom in"
                  title="Zoom in"
                >
                  <ZoomIn size={16} />
                </button>
                <span className="w-12 text-xs text-slate-400">{Math.round(scheduleZoom * 100)}%</span>
              </div>
              <Button variant="outline" className="py-1.5" onClick={() => setScheduleZoom(0.85)}>
                Fit
              </Button>
            </div>
            <div className="overflow-auto">
            <div
              className="schedule-grid-wrapper grid"
              style={{
                gridTemplateColumns: `120px repeat(${teachers.length}, 142px)`,
                minWidth: `${(120 + teachers.length * 142) * scheduleZoom}px`,
                zoom: scheduleZoom,
              }}
            >
              <div className="sticky left-0 top-0 z-30 border-b border-r border-slate-700 bg-slate-800 p-3 font-semibold text-white">
                Period / Term
              </div>

              {teachers.map((teacher) => (
                <div
                  key={teacher.id}
                  className="sticky top-0 z-20 border-b border-r border-slate-700 bg-slate-800 p-3 font-semibold text-white"
                >
                  {teacher.name}
                </div>
              ))}

              {PERIODS.map((period) => (
                <React.Fragment key={period}>
                  <div className="sticky left-0 z-10 border-b border-r border-slate-700 bg-slate-900 p-3 font-semibold text-slate-200">
                    <div>Period {period}</div>
                    <div className="mt-1 text-xs font-normal text-slate-400">{periodTimes[period]}</div>
                    <div className="mt-3 grid grid-rows-2 overflow-hidden rounded-lg border border-slate-700 text-[11px]">
                      {SEMESTERS.map((activeSemester) => (
                        <div
                          key={`${period}-${activeSemester}-label`}
                          className="border-b border-slate-700 px-2 py-2 font-semibold text-slate-300 last:border-b-0"
                        >
                          {getSemesterShortLabel(activeSemester)}
                        </div>
                      ))}
                    </div>
                  </div>

                  {teachers.map((teacher) => {
                    const fullYearClasses = getFullYearClassesForCell(teacher.id, period);
                    const fullSpanBlocks = getFullSpanBlocksForCell(teacher.id, period);
                    const hasFullSpanItems = fullYearClasses.length || fullSpanBlocks.length;

                    return (
                      <div
                        key={`${teacher.id}-${period}`}
                        className="min-h-32 min-w-0 overflow-hidden border-b border-r border-slate-800 bg-slate-950/20"
                      >
                        <div className="grid min-h-32 min-w-0 grid-rows-2 overflow-hidden">
                          {hasFullSpanItems
                            ? renderSemesterSlot(teacher, period, "Semester 1", { fullYear: true })
                            : SEMESTERS.map((activeSemester) =>
                                renderSemesterSlot(teacher, period, activeSemester)
                              )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Insert lunch row after the specified period */}
                  {appSettings.lunch?.enabled && period === appSettings.lunch.afterPeriod && (
                    <React.Fragment key={`lunch-${period}`}>
                      <div className="sticky left-0 z-10 border-b border-r border-green-700 bg-green-950 p-3 font-semibold text-green-50">
                        <div className="flex items-center gap-2">
                          <Clock size={16} />
                          Lunch
                        </div>
                        <div className="mt-1 text-xs font-normal text-green-300">{appSettings.lunch.time}</div>
                      </div>

                      {teachers.map((teacher) => (
                        <div
                          key={`lunch-${teacher.id}-${period}`}
                          className="min-h-16 border-b border-r border-green-800 bg-green-900/30 p-2"
                        >
                          <div className="flex flex-col items-center justify-center h-full text-green-200 text-sm font-medium">
                            <div>Shared Lunch Period</div>
                            <div className="mt-1 text-xs text-green-300">{appSettings.lunch.time}</div>
                          </div>
                        </div>
                      ))}
                    </React.Fragment>
                  )}
                </React.Fragment>
              ))}
            </div>
            </div>
          </main>

          <div className="print-only print-page">
            <div className="print-title">
              <h1>{appSettings.title}</h1>
              <p>
                Two-semester view • {appSettings.subtitle}
              </p>
            </div>

            <table className="print-table">
              <thead>
                <tr>
                  <th className="print-period">Period</th>
                  <th className="print-semester">Term</th>
                  {teachers.map((teacher) => (
                    <th key={teacher.id}>{teacher.name}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {PERIODS.map((period) => (
                  <React.Fragment key={period}>
                    {SEMESTERS.map((activeSemester, semesterIndex) => (
                      <tr key={`${period}-${activeSemester}-print`}>
                        {semesterIndex === 0 && (
                          <td className="print-period" rowSpan={SEMESTERS.length}>
                            <div>Period {period}</div>
                            <div className="print-period-time">{periodTimes[period]}</div>
                          </td>
                        )}

                        <td className="print-semester">{getSemesterShortLabel(activeSemester)}</td>

                        {teachers.map((teacher) => {
                          const fullYearClasses = getFullYearClassesForCell(teacher.id, period);
                          const fullSpanBlocks = getFullSpanBlocksForCell(teacher.id, period);
                          const hasFullSpanItems = fullYearClasses.length || fullSpanBlocks.length;
                          if (hasFullSpanItems && semesterIndex === 1) return null;

                          const classesInCell = getClassesForSemesterSlot(teacher.id, period, activeSemester);
                          const blocksInCell = getBlocksForSemesterSlot(teacher.id, period, activeSemester);
                          const printClasses = fullYearClasses.length ? fullYearClasses : classesInCell;
                          const printBlocks = fullSpanBlocks.length ? fullSpanBlocks : blocksInCell;

                          return (
                            <td
                              key={`${teacher.id}-${period}-${activeSemester}-print`}
                              rowSpan={hasFullSpanItems ? SEMESTERS.length : undefined}
                              className={hasFullSpanItems ? "print-full-year-cell" : undefined}
                            >
                              {printBlocks.map((block) => (
                                <div key={block.id} className="print-entry">
                                  <div className="print-entry-title">{block.name}</div>
                                </div>
                              ))}

                              {printClasses.map((cls) => (
                                <div key={cls.id} className="print-entry">
                                  <div className="print-entry-title">{cls.name}</div>
                                  <div className="print-entry-meta">
                                    {[
                                      cls.fullYear ? "Full year" : "",
                                      cls.room ? `Room ${cls.room}` : "",
                                      cls.grades?.length ? `Gr. ${cls.grades.join(",")}` : "",
                                    ]
                                      .filter(Boolean)
                                      .join(" • ")}
                                  </div>
                                </div>
                              ))}
                            </td>
                          );
                        })}
                      </tr>
                    ))}

                    {/* Insert lunch row in PDF after the specified period */}
                    {appSettings.lunch?.enabled && period === appSettings.lunch.afterPeriod && (
                      <tr key={`lunch-${period}-pdf`} className="print-lunch-row">
                        <td className="print-period print-lunch-cell" colSpan={2}>
                          <div>Lunch</div>
                          <div className="print-period-time">{appSettings.lunch.time}</div>
                        </td>
                        {teachers.map((teacher) => (
                          <td key={`lunch-${teacher.id}-${period}-pdf`} className="print-lunch-cell">
                            <div className="print-entry">
                              <div className="print-entry-title">Shared Lunch Period</div>
                              <div className="print-entry-meta">{appSettings.lunch.time}</div>
                            </div>
                          </td>
                        ))}
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {dragPreview && (
        <div
          className={`pointer-events-none fixed z-[100] max-w-48 rounded-xl border p-2 text-sm font-semibold shadow-2xl opacity-90 ${dragPreview.item.color || "border-slate-500 bg-slate-800 text-slate-50"}`}
          style={{
            left: dragPreview.x + 12,
            top: dragPreview.y + 12,
          }}
        >
          {dragPreview.item.label}
        </div>
      )}

      {editingClass && <EditClassModal cls={editingClass} onClose={() => setEditingClass(null)} onSave={saveClass} />}

      {settingsOpen && (
        <SettingsModal settings={appSettings} onClose={() => setSettingsOpen(false)} onSave={saveSettings} />
      )}

      {versionHistoryOpen && (
        <VersionHistoryModal
          versions={versions}
          onClose={() => setVersionHistoryOpen(false)}
          onLoad={loadVersion}
          onDelete={deleteVersion}
          onRename={renameVersion}
          onDuplicate={duplicateVersion}
        />
      )}
    </div>
  );
}

function EditClassModal({ cls, onClose, onSave }) {
  const [draft, setDraft] = useState(cls);

  function toggleGrade(grade) {
    setDraft((prev) => ({
      ...prev,
      grades: prev.grades.includes(grade)
        ? prev.grades.filter((g) => g !== grade)
        : [...prev.grades, grade],
    }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-xl rounded-2xl shadow-xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Edit Class</h2>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-800">
              <X size={18} />
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-200">
              Class Name
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100"
              />
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-200">
              Subject
              <input
                value={draft.subject}
                onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100"
              />
            </label>
          </div>

          <label className="space-y-1 text-sm font-medium text-slate-200 block">
            Room Number / Location
            <input
              value={draft.room || ""}
              onChange={(e) => setDraft({ ...draft, room: e.target.value })}
              placeholder="Example: 101, Gym, Science Lab"
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100 placeholder:text-slate-500"
            />
          </label>

          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-200">Grades Included</div>
            <div className="flex flex-wrap gap-2">
              {GRADE_OPTIONS.map((grade) => (
                <button
                  key={grade}
                  type="button"
                  onClick={() => toggleGrade(grade)}
                  className={`rounded-xl border px-3 py-1.5 text-sm ${
                    draft.grades.includes(grade)
                      ? "bg-sky-500 border-sky-400 text-white"
                      : "bg-slate-950 border-slate-600 text-slate-200"
                  }`}
                >
                  {grade}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-200">
              Color
              <select
                value={draft.color}
                onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100"
              >
                {colorOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2 pt-6">
              <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.checkGradeConflicts}
                  onChange={(e) => setDraft({ ...draft, checkGradeConflicts: e.target.checked })}
                />
                Check grade conflicts
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.checkRoomConflicts}
                  onChange={(e) => setDraft({ ...draft, checkRoomConflicts: e.target.checked })}
                />
                Check room conflicts
              </label>

              <label className="flex items-center gap-2 text-sm font-medium text-slate-200">
                <input
                  type="checkbox"
                  checked={draft.fullYear}
                  onChange={(e) => setDraft({ ...draft, fullYear: e.target.checked })}
                />
                Full year class (appears in both semesters)
              </label>
            </div>
          </div>

          <label className="space-y-1 text-sm font-medium text-slate-200 block">
            Notes
            <textarea
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className="h-20 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSave(draft)}>Save Class</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsModal({ settings, onClose, onSave }) {
  const [draft, setDraft] = useState(settings);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-lg rounded-2xl shadow-xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Schedule Settings</h2>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-800">
              <X size={18} />
            </button>
          </div>

          <label className="space-y-1 text-sm font-medium text-slate-200 block">
            Schedule Title
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-200 block">
            Subtext
            <input
              value={draft.subtitle}
              onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100"
            />
          </label>

          <label className="space-y-1 text-sm font-medium text-slate-200 block">
            Logo Path
            <input
              placeholder="/wvcs-logo.png"
              value={draft.logoUrl}
              onChange={(e) => setDraft({ ...draft, logoUrl: e.target.value })}
              className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100 placeholder:text-slate-500"
            />
          </label>

          <div className="space-y-3 rounded-xl border border-slate-700 bg-slate-950/50 p-4">
            <h3 className="font-semibold text-white">Lunch Settings</h3>
            
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft.lunch?.enabled ?? true}
                onChange={(e) => setDraft({
                  ...draft,
                  lunch: { ...draft.lunch, enabled: e.target.checked }
                })}
                className="rounded border-slate-600 bg-slate-950 text-sky-500 focus:ring-sky-500"
              />
              Enable shared lunch period
            </label>

            <label className="space-y-1 text-sm font-medium text-slate-200 block">
              Lunch Time
              <input
                placeholder="11:11.5–11:51.5"
                value={draft.lunch?.time ?? "11:11.5–11:51.5"}
                onChange={(e) => setDraft({
                  ...draft,
                  lunch: { ...draft.lunch, time: e.target.value }
                })}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100 placeholder:text-slate-500"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm font-medium text-slate-200 block">
                After Period
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={draft.lunch?.afterPeriod ?? 4}
                  onChange={(e) => setDraft({
                    ...draft,
                    lunch: { ...draft.lunch, afterPeriod: parseInt(e.target.value) }
                  })}
                  className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100"
                />
              </label>

              <label className="space-y-1 text-sm font-medium text-slate-200 block">
                Before Period
                <input
                  type="number"
                  min="1"
                  max="8"
                  value={draft.lunch?.beforePeriod ?? 5}
                  onChange={(e) => setDraft({
                    ...draft,
                    lunch: { ...draft.lunch, beforePeriod: parseInt(e.target.value) }
                  })}
                  className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 font-normal text-slate-100"
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={() => onSave(draft)}>Save Settings</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function VersionHistoryModal({ versions, onClose, onLoad, onDelete, onRename, onDuplicate }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <Card className="w-full max-w-3xl rounded-2xl shadow-xl">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white">Version History</h2>
            <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-800">
              <X size={18} />
            </button>
          </div>

          {versions.length === 0 ? (
            <div className="rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
              No saved versions yet. Click <strong>Save Version</strong> to create one.
            </div>
          ) : (
            <div className="space-y-3">
              {versions.map((version) => (
                <div
                  key={version.id}
                  className="rounded-xl border border-slate-700 bg-slate-950 p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <div className="font-semibold text-white">{version.name}</div>
                    <div className="text-xs text-slate-400">
                      Saved {new Date(version.savedAt).toLocaleString()}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => onLoad(version)}>
                      <RotateCcw size={16} className="mr-1 inline" /> Load
                    </Button>
                    <Button variant="outline" onClick={() => onDuplicate(version)}>
                      Duplicate
                    </Button>
                    <Button variant="outline" onClick={() => onRename(version.id)}>
                      Rename
                    </Button>
                    <Button variant="danger" onClick={() => onDelete(version.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
