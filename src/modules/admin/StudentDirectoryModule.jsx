import { useCallback, useEffect, useMemo, useState } from "react";
import { Mail, Pencil, Phone, Plus, RefreshCw, Search, Trash2, UserRound, X } from "lucide-react";
import {
  STUDENT_GRADES,
  createStudent,
  getStudents,
  removeStudent,
  updateStudent,
} from "../../lib/studentDirectoryData.js";

const emptyStudent = {
  grade: "K",
  studentFirstName: "",
  studentLastName: "",
  parent1FirstName: "",
  parent1LastName: "",
  email1: "",
  phone1: "",
  parent2FirstName: "",
  parent2LastName: "",
  phone2: "",
  email2: "",
};

function parentDisplay(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(" ");
}

function ContactBlock({ label, firstName, lastName, email, phone }) {
  const name = parentDisplay(firstName, lastName);
  if (!name && !email && !phone) return <span className="text-sm text-slate-500">No {label.toLowerCase()} listed</span>;
  return (
    <div className="space-y-1">
      <div className="text-sm font-semibold text-white">{name || label}</div>
      {email && (
        <a className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:text-sky-200" href={`mailto:${email}`}>
          <Mail size={13} />
          {email}
        </a>
      )}
      {phone && (
        <a className="block text-xs font-medium text-slate-300 hover:text-white" href={`tel:${phone}`}>
          <Phone className="mr-1 inline" size={13} />
          {phone}
        </a>
      )}
    </div>
  );
}

function StudentFormDialog({ mode, student, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...emptyStudent, ...(student || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateField(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(draft);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save student.");
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    ["studentFirstName", "Student First Name", "Addie"],
    ["studentLastName", "Student Last Name", "Marks"],
    ["parent1FirstName", "Parent 1 First Name", "Jordan"],
    ["parent1LastName", "Parent 1 Last Name", "Marks"],
    ["email1", "Parent 1 Email", "parent@wvcs.org"],
    ["phone1", "Parent 1 Phone", "503-000-0000"],
    ["parent2FirstName", "Parent 2 First Name", "Taylor"],
    ["parent2LastName", "Parent 2 Last Name", "Marks"],
    ["phone2", "Parent 2 Phone", "503-000-0000"],
    ["email2", "Parent 2 Email", "parent2@example.com"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <form onSubmit={handleSubmit} className="max-h-[92vh] w-full max-w-3xl overflow-auto rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-lg font-bold text-white">{mode === "edit" ? "Edit Student" : "Add Student"}</div>
            <p className="mt-1 text-sm text-slate-400">Student-ID is handled automatically by the Hub.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-slate-200">
            Grade
            <select
              value={draft.grade}
              onChange={(event) => updateField("grade", event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
            >
              {STUDENT_GRADES.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
          </label>
          {fields.map(([field, label, placeholder]) => (
            <label key={field} className="space-y-1 text-sm font-semibold text-slate-200">
              {label}
              <input
                type={field.includes("email") ? "email" : "text"}
                value={draft[field] || ""}
                onChange={(event) => updateField(field, event.target.value)}
                placeholder={placeholder}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-400"
              />
            </label>
          ))}
        </div>

        {error && <div className="mt-4 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100">{error}</div>}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60">
            {saving ? "Saving..." : "Save Student"}
          </button>
        </div>
      </form>
    </div>
  );
}

function RemoveDialog({ student, onClose, onRemove }) {
  const [reason, setReason] = useState("");
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");

  async function confirmRemove() {
    setRemoving(true);
    setError("");
    try {
      await onRemove(student.studentId, reason);
      onClose();
    } catch (removeError) {
      setError(removeError.message || "Unable to remove student.");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-lg font-bold text-white">Remove Student</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">
              Move {student.studentFirstName} {student.studentLastName} from the active WVCS roster to Former Students?
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <label className="mt-4 block space-y-1 text-sm font-semibold text-slate-200">
          Reason (optional)
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Moved, withdrawn, duplicate, etc."
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-400"
          />
        </label>
        {error && <div className="mt-4 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100">{error}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800">
            Cancel
          </button>
          <button type="button" onClick={confirmRemove} disabled={removing} className="inline-flex items-center gap-2 rounded-lg border border-rose-400 bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-60">
            <Trash2 size={16} />
            {removing ? "Removing..." : "Remove Student"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudentDirectoryModule() {
  const [students, setStudents] = useState([]);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [status, setStatus] = useState("Loading student roster...");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const roster = await getStudents({ grade, q: query });
      setStudents(roster);
      setStatus(`${roster.length} student${roster.length === 1 ? "" : "s"} loaded from Google Sheets.`);
    } catch (error) {
      setStatus(error.message || "Unable to load students.");
    } finally {
      setLoading(false);
    }
  }, [grade, query]);

  useEffect(() => {
    const timeoutId = window.setTimeout(loadStudents, 250);
    return () => window.clearTimeout(timeoutId);
  }, [loadStudents]);

  const byGradeSummary = useMemo(() => {
    const counts = new Map();
    students.forEach((student) => counts.set(student.grade, (counts.get(student.grade) || 0) + 1));
    return STUDENT_GRADES.filter((item) => counts.has(item)).map((item) => `${item}: ${counts.get(item)}`).join("  ");
  }, [students]);

  async function saveStudent(draft) {
    if (dialog?.mode === "edit") {
      await updateStudent(dialog.student.studentId, draft);
      setStatus("Student updated.");
    } else {
      await createStudent(draft);
      setStatus("Student added.");
    }
    await loadStudents();
  }

  async function archiveStudent(studentId, reason) {
    await removeStudent(studentId, reason);
    setStatus("Student moved to Former Students.");
    await loadStudents();
  }

  return (
    <section className="mx-auto max-w-[1500px] px-5 py-6">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xl font-bold text-white">
              <UserRound className="text-sky-300" size={22} />
              Student Directory
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Active WVCS roster pulled directly from the private Google Sheet. Changes here write back to the Sheet.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDialog({ mode: "add" })}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
          >
            <Plus size={16} />
            Add Student
          </button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_180px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search students or parents..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-10 pr-3 text-sm text-white placeholder:text-slate-500 outline-none focus:border-sky-400"
            />
          </label>
          <select
            value={grade}
            onChange={(event) => setGrade(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-white outline-none focus:border-sky-400"
          >
            <option value="all">All Grades</option>
            {STUDENT_GRADES.map((item) => (
              <option key={item} value={item}>
                Grade {item}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={loadStudents}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw size={16} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        <div className="mt-4 flex flex-col gap-2 text-xs font-semibold text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <span>{status}</span>
          {byGradeSummary && <span>{byGradeSummary}</span>}
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-800">
          <div className="hidden grid-cols-[1.2fr_90px_1.4fr_1.4fr_150px] gap-4 border-b border-slate-800 bg-slate-950 px-4 py-3 text-xs font-bold uppercase text-slate-400 xl:grid">
            <div>Student</div>
            <div>Grade</div>
            <div>Parent 1</div>
            <div>Parent 2</div>
            <div className="text-right">Actions</div>
          </div>
          {students.map((student) => (
            <div
              key={student.studentId}
              className="grid gap-4 border-b border-slate-800 bg-slate-900 px-4 py-4 last:border-b-0 xl:grid-cols-[1.2fr_90px_1.4fr_1.4fr_150px] xl:items-center"
            >
              <div>
                <div className="text-base font-bold text-white">
                  {student.studentFirstName} {student.studentLastName}
                </div>
              </div>
              <div>
                <span className="rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-100">
                  {student.grade}
                </span>
              </div>
              <ContactBlock
                label="Parent 1"
                firstName={student.parent1FirstName}
                lastName={student.parent1LastName}
                email={student.email1}
                phone={student.phone1}
              />
              <ContactBlock
                label="Parent 2"
                firstName={student.parent2FirstName}
                lastName={student.parent2LastName}
                email={student.email2}
                phone={student.phone2}
              />
              <div className="flex gap-2 xl:justify-end">
                <button
                  type="button"
                  onClick={() => setDialog({ mode: "edit", student })}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDialog({ mode: "remove", student })}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/20"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              </div>
            </div>
          ))}
          {!students.length && (
            <div className="bg-slate-900 px-4 py-10 text-center text-sm font-semibold text-slate-400">
              {loading ? "Loading students..." : "No students matched this search."}
            </div>
          )}
        </div>
      </div>

      {(dialog?.mode === "add" || dialog?.mode === "edit") && (
        <StudentFormDialog mode={dialog.mode} student={dialog.student} onClose={() => setDialog(null)} onSave={saveStudent} />
      )}
      {dialog?.mode === "remove" && (
        <RemoveDialog student={dialog.student} onClose={() => setDialog(null)} onRemove={archiveStudent} />
      )}
    </section>
  );
}
