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

function defaultFamilyName(student = {}) {
  return student.studentLastName ? `${student.studentLastName} Family` : "";
}

function defaultFamilyKey(student = {}) {
  return [student.email1, student.email2, student.studentLastName].filter(Boolean).join("|").replace(/\s+/g, "").toLowerCase();
}

function familyOptionsFromStudents(students = []) {
  const families = new Map();
  students.forEach((student) => {
    const familyKey = defaultFamilyKey(student);
    const familyName = defaultFamilyName(student);
    if (!familyKey || !familyName) return;
    const family = families.get(familyKey) || {
      familyKey,
      familyName,
      students: [],
      parent1FirstName: student.parent1FirstName || "",
      parent1LastName: student.parent1LastName || "",
      email1: student.email1 || "",
      phone1: student.phone1 || "",
      parent2FirstName: student.parent2FirstName || "",
      parent2LastName: student.parent2LastName || "",
      email2: student.email2 || "",
      phone2: student.phone2 || "",
    };
    family.students.push(`${student.studentFirstName} ${student.studentLastName}`.trim());
    family.studentRecords = [...(family.studentRecords || []), student];
    families.set(familyKey, family);
  });
  return [...families.values()].sort((a, b) => a.familyName.localeCompare(b.familyName, undefined, { sensitivity: "base" }));
}

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

function StudentFormDialog({ mode, student, familyOptions = [], onClose, onSave }) {
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

  function attachFamily(familyKey) {
    const family = familyOptions.find((item) => item.familyKey === familyKey);
    if (!family) return;
    setDraft((current) => ({
      ...current,
      parent1FirstName: family.parent1FirstName,
      parent1LastName: family.parent1LastName,
      email1: family.email1,
      phone1: family.phone1,
      parent2FirstName: family.parent2FirstName,
      parent2LastName: family.parent2LastName,
      email2: family.email2,
      phone2: family.phone2,
    }));
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
          <label className="space-y-1 text-sm font-semibold text-slate-200 md:col-span-2">
            Attach to Existing Family
            <select
              value=""
              onChange={(event) => attachFamily(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
            >
              <option value="">Choose a family to copy parent contacts</option>
              {familyOptions.map((family) => (
                <option key={family.familyKey} value={family.familyKey}>
                  {family.familyName}{family.students.length ? ` - ${family.students.slice(0, 3).join(", ")}` : ""}
                </option>
              ))}
            </select>
            <span className="block text-xs font-medium text-slate-500">
              This reconnects a student by copying the same parent names, emails, and phone numbers used by that family.
            </span>
          </label>
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
          <button type="submit" disabled={saving} aria-busy={saving} className="rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60">
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
          <button type="button" onClick={confirmRemove} disabled={removing} aria-busy={removing} className="inline-flex items-center gap-2 rounded-lg border border-rose-400 bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400 disabled:opacity-60">
            <Trash2 size={16} />
            {removing ? "Removing..." : "Remove Student"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FamilyContactDialog({ family, onClose, onSave }) {
  const [draft, setDraft] = useState(() => ({
    parent1FirstName: family.parent1FirstName || "",
    parent1LastName: family.parent1LastName || "",
    email1: family.email1 || "",
    phone1: family.phone1 || "",
    parent2FirstName: family.parent2FirstName || "",
    parent2LastName: family.parent2LastName || "",
    email2: family.email2 || "",
    phone2: family.phone2 || "",
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(family, draft);
      onClose();
    } catch (saveError) {
      setError(saveError.message || "Unable to save family contacts.");
    } finally {
      setSaving(false);
    }
  }

  const fields = [
    ["parent1FirstName", "Parent 1 First Name"],
    ["parent1LastName", "Parent 1 Last Name"],
    ["email1", "Parent 1 Email"],
    ["phone1", "Parent 1 Phone"],
    ["parent2FirstName", "Parent 2 First Name"],
    ["parent2LastName", "Parent 2 Last Name"],
    ["email2", "Parent 2 Email"],
    ["phone2", "Parent 2 Phone"],
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-2xl rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div className="text-lg font-bold text-white">Edit Household Contacts</div>
            <p className="mt-1 text-sm text-slate-400">{family.familyName} - updates {family.students.length} student record{family.students.length === 1 ? "" : "s"}.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:bg-slate-800">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {fields.map(([field, label]) => (
            <label key={field} className="space-y-1 text-sm font-semibold text-slate-200">
              {label}
              <input
                type={field.includes("email") ? "email" : "text"}
                value={draft[field] || ""}
                onChange={(event) => setDraft((current) => ({ ...current, [field]: event.target.value }))}
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
          <button type="submit" disabled={saving} aria-busy={saving} className="rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60">
            {saving ? "Saving..." : "Save Household"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function StudentDirectoryModule() {
  const [students, setStudents] = useState([]);
  const [allStudents, setAllStudents] = useState([]);
  const [query, setQuery] = useState("");
  const [grade, setGrade] = useState("all");
  const [status, setStatus] = useState("Loading student roster...");
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const roster = await getStudents({ grade, q: query });
      const fullRoster = await getStudents({ grade: "all", q: "" });
      setStudents(roster);
      setAllStudents(fullRoster);
      setStatus(`${roster.length} student${roster.length === 1 ? "" : "s"} loaded from Supabase.`);
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

  const familyOptions = useMemo(() => familyOptionsFromStudents(allStudents), [allStudents]);
  const visibleFamilies = useMemo(() => {
    const visibleStudentIds = new Set(students.map((student) => student.studentId));
    return familyOptions.filter((family) => (family.studentRecords || []).some((student) => visibleStudentIds.has(student.studentId)));
  }, [familyOptions, students]);

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

  async function saveFamilyContacts(family, contactDraft) {
    const records = family.studentRecords || [];
    await Promise.all(records.map((student) => updateStudent(student.studentId, { ...student, ...contactDraft })));
    setStatus(`${family.familyName} household contacts updated for ${records.length} student record${records.length === 1 ? "" : "s"}.`);
    await loadStudents();
  }

  function addStudentToFamily(family) {
    setDialog({
      mode: "add",
      student: {
        ...emptyStudent,
        studentLastName: family.studentRecords?.[0]?.studentLastName || family.familyName.replace(/\s+Family$/i, ""),
        parent1FirstName: family.parent1FirstName,
        parent1LastName: family.parent1LastName,
        email1: family.email1,
        phone1: family.phone1,
        parent2FirstName: family.parent2FirstName,
        parent2LastName: family.parent2LastName,
        email2: family.email2,
        phone2: family.phone2,
      },
    });
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
              Active WVCS roster stored in Supabase for use across the Hub. Changes here update the central Hub roster.
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

        <div className="mt-5 space-y-3">
          {visibleFamilies.map((family) => (
            <div key={family.familyKey} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-col gap-3 border-b border-slate-800 pb-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-base font-bold text-white">{family.familyName}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {family.students.length} student{family.students.length === 1 ? "" : "s"} - {family.students.join(", ")}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setDialog({ mode: "family", family })} className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/20">
                    <Pencil size={14} />
                    Edit Household
                  </button>
                  <button type="button" onClick={() => addStudentToFamily(family)} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/20">
                    <Plus size={14} />
                    Add Student
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1fr]">
                <ContactBlock label="Parent 1" firstName={family.parent1FirstName} lastName={family.parent1LastName} email={family.email1} phone={family.phone1} />
                <ContactBlock label="Parent 2" firstName={family.parent2FirstName} lastName={family.parent2LastName} email={family.email2} phone={family.phone2} />
              </div>
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                {(family.studentRecords || []).map((student) => (
                  <div key={student.studentId} className="grid gap-3 border-b border-slate-800 bg-slate-950 px-3 py-2 last:border-b-0 sm:grid-cols-[1fr_80px_auto] sm:items-center">
                    <div className="font-semibold text-white">{student.studentFirstName} {student.studentLastName}</div>
                    <span className="w-fit rounded-full border border-sky-400/40 bg-sky-500/10 px-3 py-1 text-xs font-bold text-sky-100">{student.grade}</span>
                    <div className="flex gap-2 sm:justify-end">
                      <button type="button" onClick={() => setDialog({ mode: "edit", student })} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">
                        <Pencil size={13} />
                        Student
                      </button>
                      <button type="button" onClick={() => setDialog({ mode: "remove", student })} className="inline-flex items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-100 hover:bg-rose-500/20">
                        <Trash2 size={13} />
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {!visibleFamilies.length && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-10 text-center text-sm font-semibold text-slate-400">
              {loading ? "Loading students..." : "No families matched this search."}
            </div>
          )}
        </div>
      </div>

      {(dialog?.mode === "add" || dialog?.mode === "edit") && (
        <StudentFormDialog mode={dialog.mode} student={dialog.student} familyOptions={familyOptions} onClose={() => setDialog(null)} onSave={saveStudent} />
      )}
      {dialog?.mode === "remove" && (
        <RemoveDialog student={dialog.student} onClose={() => setDialog(null)} onRemove={archiveStudent} />
      )}
      {dialog?.mode === "family" && (
        <FamilyContactDialog family={dialog.family} onClose={() => setDialog(null)} onSave={saveFamilyContacts} />
      )}
    </section>
  );
}
