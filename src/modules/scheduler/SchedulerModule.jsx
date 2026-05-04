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

const STORAGE_KEY = "wvcs-master-scheduler-working";
const VERSIONS_KEY = "wvcs-master-scheduler-versions";

const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const SEMESTERS = ["Semester 1", "Semester 2"];
const GRADE_OPTIONS = ["6", "7", "8", "9", "10", "11", "12"];

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
  { id: "t3", name: "Mr. Cota" },
];

const blockTemplates = [
  {
    blockType: "prep",
    name: "Prep Period",
    color: "bg-indigo-950 border-indigo-500 text-indigo-50",
  },
  {
    blockType: "no-class",
    name: "No Class / Unavailable",
    color: "bg-slate-800 border-slate-500 text-slate-50",
  },
  {
    blockType: "professional-duties",
    name: "Professional Duties",
    color: "bg-purple-950 border-purple-500 text-purple-50",
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
      className={`print-card group rounded-xl border p-2 shadow-sm cursor-pointer active:cursor-grabbing ${cls.color} ${
        conflict ? "ring-2 ring-red-400" : ""
      } ${
        selected ? "ring-2 ring-emerald-300" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-sm leading-tight">{cls.name}</div>
          <div className="text-xs opacity-80">{cls.subject || "No subject"}</div>
          <div className="mt-1 text-xs opacity-90">
            Grades: {cls.grades.length ? cls.grades.join(", ") : "—"}
          </div>
          <div className="mt-1 text-xs opacity-90">
            Room: {cls.room?.trim() ? cls.room : "—"}
          </div>
        </div>

        <div className="no-print flex gap-1 opacity-0 group-hover:opacity-100 transition">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(cls);
            }}
            className="rounded-md p-1 hover:bg-white/20"
          >
            <Pencil size={14} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove(cls.id);
            }}
            className="rounded-md p-1 hover:bg-white/20"
          >
            <Trash2 size={14} />
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
      className={`rounded-xl border p-2 shadow-sm cursor-pointer active:cursor-grabbing ${template.color} ${
        selected ? "ring-2 ring-emerald-300" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon size={16} />
        <div className="font-semibold text-sm">{template.name}</div>
      </div>
      <div className="mt-1 text-[11px] opacity-80">Reusable block</div>
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
      className={`print-card group rounded-xl border p-2 shadow-sm ${block.color}`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-semibold text-sm">
            {getIcon()}
            {block.name}
          </div>
          <div className="mt-1 text-xs opacity-80">
            {block.blockType === "lunch" ? "Shared lunch period" : "Blocked schedule time"}
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove(block.id);
          }}
          className={`no-print rounded-md p-1 opacity-0 group-hover:opacity-100 hover:bg-white/20 ${
            block.blockType === "lunch" ? "hidden" : ""
          }`}
        >
          <Trash2 size={14} />
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

  const [semester, setSemester] = useState("Semester 1");
  const [editingClass, setEditingClass] = useState(null);
  const [newTeacherName, setNewTeacherName] = useState("");
  const [editingTeacherId, setEditingTeacherId] = useState(null);
  const [editingTeacherName, setEditingTeacherName] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [scheduleZoom, setScheduleZoom] = useState(0.85);
  const [updateStatus, setUpdateStatus] = useState("");
  const fileInputRef = useRef(null);
  const classImportRef = useRef(null);

  const { teachers, classes, scheduleBlocks, periodTimes, appSettings } = workingState;
  const sidebarGridClass = sidebarHidden
    ? "grid gap-4 grid-cols-1 print:block"
    : "grid gap-4 lg:grid-cols-[300px_1fr] print:block";

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

        if (!confirm("Load this schedule? Your current working schedule will be replaced.")) {
          return;
        }

        commit(() => imported);
        alert("Schedule imported successfully!");
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
    const html = document.createElement("div");
    html.style.padding = "15px";
    html.style.fontFamily = "Arial, sans-serif";
    html.style.backgroundColor = "#ffffff";
    html.style.color = "#000000";
    
    const header = document.createElement("div");
    header.style.marginBottom = "15px";
    header.style.display = "flex";
    header.style.alignItems = "center";
    header.style.gap = "15px";
    header.style.borderBottom = "2px solid #333";
    header.style.paddingBottom = "8px";
    
    if (appSettings.logoUrl) {
      const logoImg = document.createElement("img");
      logoImg.src = appSettings.logoUrl;
      logoImg.alt = "School Logo";
      logoImg.style.height = "60px";
      logoImg.style.width = "60px";
      logoImg.style.objectFit = "contain";
      logoImg.style.borderRadius = "6px";
      header.appendChild(logoImg);
    }
    
    const titleContainer = document.createElement("div");
    titleContainer.style.flex = "1";
    
    const title = document.createElement("h1");
    title.textContent = appSettings.title || "School Schedule";
    title.style.margin = "0 0 3px 0";
    title.style.fontSize = "22px";
    
    const subtitle = document.createElement("p");
    subtitle.textContent = appSettings.subtitle || "";
    subtitle.style.margin = "0";
    subtitle.style.fontSize = "11px";
    subtitle.style.color = "#666";
    
    titleContainer.appendChild(title);
    if (appSettings.subtitle) titleContainer.appendChild(subtitle);
    header.appendChild(titleContainer);
    
    html.appendChild(header);
    
    const table = document.createElement("table");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "10px"; // Reduced from 11px
    table.style.tableLayout = "fixed";
    
    const headerRow = document.createElement("tr");
    const periodHeader = document.createElement("th");
    periodHeader.textContent = "Period";
    periodHeader.style.border = "1px solid #999";
    periodHeader.style.padding = "6px"; // Reduced from 8px
    periodHeader.style.backgroundColor = "#f0f0f0";
    periodHeader.style.fontWeight = "bold";
    periodHeader.style.textAlign = "left";
    headerRow.appendChild(periodHeader);
    
    teachers.forEach((teacher) => {
      const th = document.createElement("th");
      th.textContent = teacher.name;
      th.style.border = "1px solid #999";
      th.style.padding = "6px"; // Reduced from 8px
      th.style.backgroundColor = "#f0f0f0";
      th.style.fontWeight = "bold";
      th.style.textAlign = "left";
      headerRow.appendChild(th);
    });
    table.appendChild(headerRow);
    
    PERIODS.forEach((period) => {
      const row = document.createElement("tr");
      
      const periodCell = document.createElement("td");
      periodCell.style.border = "1px solid #999";
      periodCell.style.padding = "6px"; // Reduced from 8px
      periodCell.style.backgroundColor = "#f9f9f9";
      periodCell.style.fontWeight = "bold";
      periodCell.style.verticalAlign = "top";
      
      const periodText = document.createElement("div");
      periodText.textContent = `Period ${period}`;
      periodCell.appendChild(periodText);
      
      const timeText = document.createElement("div");
      timeText.textContent = periodTimes[period] || "";
      timeText.style.fontSize = "10px";
      timeText.style.color = "#666";
      periodCell.appendChild(timeText);
      
      row.appendChild(periodCell);
      
      teachers.forEach((teacher) => {
        const cell = document.createElement("td");
        cell.style.border = "1px solid #999";
        cell.style.padding = "6px"; // Reduced from 8px
        cell.style.verticalAlign = "top";
        cell.style.minHeight = "50px"; // Reduced from 60px
        
        const classesInCell = classes.filter(
          (c) =>
            c.placements[semester]?.teacherId === teacher.id &&
            c.placements[semester]?.period === period
        );
        
        const blocksInCell = scheduleBlocks.filter(
          (b) => b.semester === semester && b.teacherId === teacher.id && b.period === period
        );
        
        classesInCell.forEach((cls) => {
          const classDiv = document.createElement("div");
          classDiv.style.marginBottom = "4px";
          classDiv.style.padding = "4px";
          classDiv.style.backgroundColor = "#e8f4f8";
          classDiv.style.border = "1px solid #4a9eff";
          classDiv.style.borderRadius = "2px";
          classDiv.style.fontSize = "10px";
          classDiv.style.lineHeight = "1.3";
          
          const className = document.createElement("div");
          className.textContent = cls.name;
          className.style.fontWeight = "bold";
          className.style.fontSize = "11px";
          classDiv.appendChild(className);
          
          if (cls.subject) {
            const subject = document.createElement("div");
            subject.textContent = cls.subject;
            subject.style.fontSize = "9px";
            subject.style.color = "#666";
            classDiv.appendChild(subject);
          }
          
          if (cls.room) {
            const room = document.createElement("div");
            room.textContent = `Room: ${cls.room}`;
            room.style.fontSize = "9px";
            room.style.color = "#666";
            classDiv.appendChild(room);
          }
          
          cell.appendChild(classDiv);
        });
        
        blocksInCell.forEach((block) => {
          const blockDiv = document.createElement("div");
          blockDiv.textContent = block.name;
          blockDiv.style.padding = "4px";
          blockDiv.style.backgroundColor = "#f0f0f0";
          blockDiv.style.border = "1px solid #ccc";
          blockDiv.style.borderRadius = "2px";
          blockDiv.style.fontSize = "10px";
          blockDiv.style.fontStyle = "italic";
          blockDiv.style.marginBottom = "4px";
          cell.appendChild(blockDiv);
        });
        
        row.appendChild(cell);
      });
      
      table.appendChild(row);

      if (appSettings.lunch?.enabled && period === appSettings.lunch.afterPeriod) {
        const lunchRow = document.createElement("tr");

        const lunchPeriodCell = document.createElement("td");
        lunchPeriodCell.style.border = "1px solid #999";
        lunchPeriodCell.style.padding = "6px";
        lunchPeriodCell.style.backgroundColor = "#f0fdf4";
        lunchPeriodCell.style.fontWeight = "bold";
        lunchPeriodCell.style.verticalAlign = "top";

        const lunchText = document.createElement("div");
        lunchText.textContent = "Lunch";
        lunchPeriodCell.appendChild(lunchText);

        const lunchTimeText = document.createElement("div");
        lunchTimeText.textContent = appSettings.lunch.time || "";
        lunchTimeText.style.fontSize = "10px";
        lunchTimeText.style.color = "#666";
        lunchPeriodCell.appendChild(lunchTimeText);

        lunchRow.appendChild(lunchPeriodCell);

        teachers.forEach(() => {
          const lunchCell = document.createElement("td");
          lunchCell.style.border = "1px solid #999";
          lunchCell.style.padding = "6px";
          lunchCell.style.backgroundColor = "#f0fdf4";
          lunchCell.style.verticalAlign = "top";

          const lunchDiv = document.createElement("div");
          lunchDiv.textContent = "Shared Lunch Period";
          lunchDiv.style.padding = "4px";
          lunchDiv.style.backgroundColor = "#dcfce7";
          lunchDiv.style.border = "1px solid #86efac";
          lunchDiv.style.borderRadius = "2px";
          lunchDiv.style.fontSize = "10px";
          lunchDiv.style.fontWeight = "bold";
          lunchDiv.style.marginBottom = "4px";
          lunchCell.appendChild(lunchDiv);

          lunchRow.appendChild(lunchCell);
        });

        table.appendChild(lunchRow);
      }
    });
    
    html.appendChild(table);
    
    const footer = document.createElement("div");
    footer.style.marginTop = "20px";
    footer.style.fontSize = "10px";
    footer.style.color = "#666";
    footer.textContent = `Generated on ${new Date().toLocaleString()} | Semester: ${semester}`;
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
              margin: 6mm;
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
            }

            body {
              padding: 0;
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
      margin: [6, 6, 6, 6],
      filename: filename,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff" },
      jsPDF: { orientation: "landscape", unit: "mm", format: "letter" },
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

  const placedClasses = useMemo(() => {
    return classes.filter((c) => c.placements[semester]);
  }, [classes, semester]);

  const conflictMap = useMemo(() => {
    const conflicts = new Map();

    function addConflict(classId, conflict) {
      conflicts.set(classId, [...(conflicts.get(classId) || []), conflict]);
    }

    for (const period of PERIODS) {
      const inPeriod = placedClasses.filter((c) => c.placements[semester]?.period === period);

      for (let i = 0; i < inPeriod.length; i++) {
        for (let j = i + 1; j < inPeriod.length; j++) {
          const a = inPeriod[i];
          const b = inPeriod[j];

          if (a.checkGradeConflicts && b.checkGradeConflicts) {
            const overlap = a.grades.filter((g) => b.grades.includes(g));
            if (overlap.length) {
              addConflict(a.id, { type: "grade", with: b.name, grades: overlap, period });
              addConflict(b.id, { type: "grade", with: a.name, grades: overlap, period });
            }
          }

          if (a.checkRoomConflicts && b.checkRoomConflicts) {
            const roomA = a.room?.trim().toLowerCase();
            const roomB = b.room?.trim().toLowerCase();
            if (roomA && roomB && roomA === roomB) {
              addConflict(a.id, { type: "room", with: b.name, room: a.room, period });
              addConflict(b.id, { type: "room", with: a.name, room: b.room, period });
            }
          }
        }
      }
    }

    return conflicts;
  }, [placedClasses, semester]);

  const unscheduled = classes.filter((c) => !c.placements[semester]);
  const conflictList = Array.from(conflictMap.entries());

  function handleDrop(e, teacherId, period) {
    e.preventDefault();
    const raw = e.dataTransfer.getData("dragData");
    if (!raw) return;
    const data = JSON.parse(raw);

    if (data.kind === "class") {
      placeClass(data.id, teacherId, period);
    }

    if (data.kind === "block-template") {
      addScheduleBlock(data.blockType, teacherId, period);
    }
  }

  function placeItem(item, teacherId, period) {
    if (!item) return;

    if (item.kind === "class") {
      placeClass(item.id, teacherId, period);
      setSelectedItem(null);
      return;
    }

    if (item.kind === "block-template") {
      addScheduleBlock(item.blockType, teacherId, period);
    }
  }

  function placeSelectedItem(teacherId, period) {
    placeItem(selectedItem, teacherId, period);
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
        placeItem(current.item, cell.dataset.teacherId, Number(cell.dataset.period));
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

  function placeClass(classId, teacherId, period) {
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
                    ...c.placements,
                    [semester]: { teacherId, period },
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
                : { ...c.placements, [semester]: null },
            }
          : c
      ),
    }));
  }

  function addScheduleBlock(blockType, teacherId, period) {
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
          semester,
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
            {SEMESTERS.map((s) => (
              <Button key={s} variant={semester === s ? "default" : "outline"} onClick={() => setSemester(s)}>
                {s}
              </Button>
            ))}

            <Button variant="outline" onClick={undo} disabled={!undoStack.length}>
              <Undo2 size={16} className="mr-1 inline" /> Undo
            </Button>

            <Button variant="outline" onClick={redo} disabled={!redoStack.length}>
              <Redo2 size={16} className="mr-1 inline" /> Redo
            </Button>

            <Button variant="success" onClick={saveVersion}>
              <Save size={16} className="mr-1 inline" /> Save Version
            </Button>

            <Button variant="outline" onClick={printSchedule}>
              <Printer size={16} className="mr-1 inline" /> Print
            </Button>

            <Button variant="outline" onClick={() => setVersionHistoryOpen(true)}>
              <History size={16} className="mr-1 inline" /> Versions
            </Button>

            <Button variant="outline" onClick={checkForUpdates}>
              <RefreshCw size={16} className="mr-1 inline" /> Updates
            </Button>

            <Button variant="outline" onClick={exportSchedule}>
              <Download size={16} className="mr-1 inline" /> Export
            </Button>

            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} className="mr-1 inline" /> Import
            </Button>
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

            <Button variant="outline" onClick={exportPDF}>
              <FileText size={16} className="mr-1 inline" /> PDF
            </Button>

            <Button variant="outline" onClick={() => setSettingsOpen(true)}>
              <Settings size={16} className="mr-1 inline" /> Settings
            </Button>
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
                              ? `${cls?.name} conflicts with ${conflict.with} in Period ${conflict.period} for grade(s) ${conflict.grades.join(", ")}.`
                              : conflict.type === "lunch"
                              ? `${cls?.name} cannot be scheduled in Period ${conflict.period} because of ${conflict.with}.`
                              : `${cls?.name} conflicts with ${conflict.with} in Period ${conflict.period} because both use room ${conflict.room}.`}
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
              <aside className="no-print space-y-4">
                <Card className="shadow-xl">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex flex-col gap-3">
                      <h2 className="font-semibold text-white">Unscheduled Classes</h2>
                      <div className="text-xs text-slate-400">
                        {selectedItem
                          ? "Click a schedule cell to place the selected item."
                          : "Click a class or block, then click a schedule cell."}
                      </div>
                      <div className="flex items-center justify-center gap-2">
                        <button
                          type="button"
                          className="rounded-full border border-slate-600 bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
                          onClick={() => setSidebarHidden(true)}
                          aria-label="Hide sidebar"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <Button onClick={addClass}>
                          <Plus size={16} className="mr-1 inline" /> Class
                        </Button>
                        <button
                          type="button"
                          title="View CSV template"
                          aria-label="View CSV template"
                          className="rounded-full border border-slate-600 bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
                          onClick={openTemplateLink}
                        >
                          <FileText size={16} />
                        </button>
                        <button
                          type="button"
                          title="Import classes from CSV only"
                          aria-label="Import classes from CSV only"
                          className="rounded-full border border-slate-600 bg-slate-800 p-2 text-slate-100 hover:bg-slate-700"
                          onClick={() => classImportRef.current?.click()}
                        >
                          <Upload size={16} />
                        </button>
                      </div>
                    </div>

                <div
                  data-unscheduled-drop="true"
                  className="min-h-28 rounded-2xl border border-dashed border-slate-600 bg-slate-950 p-3"
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
                    <div className="grid grid-cols-2 gap-2">
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
                    <div className="text-sm text-slate-500">All classes are scheduled for {semester}.</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-xl">
              <CardContent className="p-4 space-y-3">
                <h2 className="font-semibold text-white">Reusable Blocks</h2>
                <div className="space-y-2">
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
              <CardContent className="p-4 space-y-3">
                <h2 className="font-semibold text-white">Teachers</h2>
                <div className="flex gap-2">
                  <input
                    value={newTeacherName}
                    onChange={(e) => setNewTeacherName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addTeacher()}
                    placeholder="Add teacher name"
                    className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                  <Button onClick={addTeacher}>
                    <Plus size={16} />
                  </Button>
                </div>

                <div className="space-y-2">
                  {teachers.map((teacher) => (
                    <div
                      key={teacher.id}
                      className="flex items-center justify-between rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm gap-2"
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
                          className="flex-1 rounded-lg bg-slate-800 border border-slate-600 px-2 py-1 text-slate-100 focus:outline-none focus:border-sky-400"
                          autoFocus
                        />
                      ) : (
                        <span className="flex-1">{teacher.name}</span>
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
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-slate-300" />
                  <h2 className="font-semibold text-white">Period Times</h2>
                </div>

                <div className="space-y-2">
                  {PERIODS.map((period) => (
                    <label key={period} className="grid grid-cols-[80px_1fr] items-center gap-2 text-sm">
                      <span className="text-slate-300">Period {period}</span>
                      <input
                        value={periodTimes[period] || ""}
                        onChange={(e) => updatePeriodTime(period, e.target.value)}
                        placeholder="8:15–9:00"
                        className="rounded-xl border border-slate-600 bg-slate-950 px-3 py-2 text-slate-100 placeholder:text-slate-500"
                      />
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>
          </aside>
          )}

          <main className="screen-schedule rounded-2xl border border-slate-700 bg-slate-900 shadow-inner">
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
                gridTemplateColumns: `110px repeat(${teachers.length}, 132px)`,
                minWidth: `${(110 + teachers.length * 132) * scheduleZoom}px`,
                zoom: scheduleZoom,
              }}
            >
              <div className="sticky left-0 top-0 z-30 border-b border-r border-slate-700 bg-slate-800 p-3 font-semibold text-white">
                Period
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
                  </div>

                  {teachers.map((teacher) => {
                    const classesInCell = classes.filter(
                      (c) =>
                        c.placements[semester]?.teacherId === teacher.id &&
                        c.placements[semester]?.period === period
                    );

                    const blocksInCell = scheduleBlocks.filter(
                      (b) => b.semester === semester && b.teacherId === teacher.id && b.period === period
                    );

                    return (
                      <div
                        key={`${teacher.id}-${period}`}
                        data-schedule-cell="true"
                        data-teacher-id={teacher.id}
                        data-period={period}
                        className={`min-h-28 border-b border-r border-slate-800 p-1.5 transition hover:bg-slate-800/70 ${
                          selectedItem ? "cursor-copy bg-slate-800/30" : ""
                        }`}
                        onClick={() => placeSelectedItem(teacher.id, period)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleDrop(e, teacher.id, period)}
                      >
                        <div className="space-y-2">
                          {blocksInCell.map((block) => (
                            <ScheduleBlockCard key={block.id} block={block} onRemove={removeScheduleBlock} />
                          ))}

                          {classesInCell.map((cls) => (
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
                {semester} • {appSettings.subtitle}
              </p>
            </div>

            <table className="print-table">
              <thead>
                <tr>
                  <th className="print-period">Period</th>
                  {teachers.map((teacher) => (
                    <th key={teacher.id}>{teacher.name}</th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {PERIODS.map((period) => (
                  <React.Fragment key={period}>
                    <tr>
                      <td className="print-period">
                        <div>Period {period}</div>
                        <div className="print-period-time">{periodTimes[period]}</div>
                      </td>

                      {teachers.map((teacher) => {
                        const classesInCell = classes.filter(
                          (c) =>
                            c.placements[semester]?.teacherId === teacher.id &&
                            c.placements[semester]?.period === period
                        );

                        const blocksInCell = scheduleBlocks.filter(
                          (b) =>
                            b.semester === semester &&
                            b.teacherId === teacher.id &&
                            b.period === period
                        );

                        return (
                          <td key={`${teacher.id}-${period}-print`}>
                            {blocksInCell.map((block) => (
                              <div key={block.id} className="print-entry">
                                <div className="print-entry-title">{block.name}</div>
                              </div>
                            ))}

                            {classesInCell.map((cls) => (
                              <div key={cls.id} className="print-entry">
                                <div className="print-entry-title">{cls.name}</div>
                                <div className="print-entry-meta">
                                  {cls.room ? `Room ${cls.room}` : ""}
                                  {cls.grades?.length ? ` • Gr. ${cls.grades.join(",")}` : ""}
                                </div>
                              </div>
                            ))}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Insert lunch row in PDF after the specified period */}
                    {appSettings.lunch?.enabled && period === appSettings.lunch.afterPeriod && (
                      <tr key={`lunch-${period}-pdf`} className="print-lunch-row">
                        <td className="print-period print-lunch-cell">
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
