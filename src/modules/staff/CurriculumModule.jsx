import { useEffect, useMemo, useState } from "react";
import { Archive, BookOpen, CheckCircle2, History, Layers3, Plus, RefreshCw, Save, Search, X } from "lucide-react";
import {
  CURRICULUM_GRADES,
  CURRICULUM_SUBJECTS,
  MATERIAL_TYPES,
  archiveCurriculumResource,
  canManageCurriculum,
  emptyCurriculumAssignment,
  emptyCurriculumResource,
  fetchCurriculumData,
  lookupCurriculumIsbn,
  saveCurriculumAssignment,
  saveCurriculumResource,
  submitCurriculumInventory,
} from "../../lib/curriculumData.js";

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cleanAuthors(authors) {
  if (Array.isArray(authors)) return authors.join(", ");
  return String(authors || "");
}

function gradeLabel(grade) {
  return grade === "K" ? "Kindergarten" : `Grade ${grade}`;
}

function dateTime(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function Input(props) {
  return <input {...props} className={`w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-400 ${props.className || ""}`} />;
}

function Select(props) {
  return <select {...props} className={`w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white outline-none focus:border-sky-400 ${props.className || ""}`} />;
}

function Textarea(props) {
  return <textarea {...props} className={`w-full rounded-md border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white placeholder:text-slate-600 outline-none focus:border-sky-400 ${props.className || ""}`} />;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function ActionButton({ children, tone = "slate", className = "", ...props }) {
  const tones = {
    sky: "border-sky-400 bg-sky-500 text-white hover:bg-sky-400",
    emerald: "border-emerald-500/50 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
    amber: "border-amber-500/50 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25",
    rose: "border-rose-500/50 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
    slate: "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800",
  };
  return (
    <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

function coverBlock(resource, compact = false) {
  if (resource.coverImageUrl) {
    return <img src={resource.coverImageUrl} alt={`${resource.title} cover`} className={`${compact ? "h-24 w-16" : "h-40 w-28"} rounded-md bg-slate-800 object-cover shadow-lg`} loading="lazy" />;
  }
  return (
    <div className={`${compact ? "h-24 w-16" : "h-40 w-28"} flex shrink-0 items-center justify-center rounded-md border border-slate-700 bg-slate-950 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500`}>
      No Cover
    </div>
  );
}

function resourceMatches(resource, assignments, filters) {
  const query = filters.query.trim().toLowerCase();
  const resourceAssignments = assignments.filter((assignment) => assignment.resourceId === resource.id && assignment.active);
  if (filters.activeOnly && !resource.active) return false;
  if (filters.grade !== "all" && !resourceAssignments.some((assignment) => assignment.gradeLevel === filters.grade)) return false;
  if (filters.subject !== "all" && !resourceAssignments.some((assignment) => assignment.subject === filters.subject)) return false;
  if (filters.schoolYear && !resourceAssignments.some((assignment) => assignment.schoolYear.toLowerCase().includes(filters.schoolYear.toLowerCase()))) return false;
  if (!query) return true;
  return [
    resource.title,
    resource.subtitle,
    cleanAuthors(resource.authors),
    resource.publisher,
    resource.edition,
    resource.isbn10,
    resource.isbn13,
    ...resourceAssignments.flatMap((assignment) => [assignment.gradeLevel, assignment.subject, assignment.courseName, assignment.teacherName, assignment.schoolYear]),
  ].join(" ").toLowerCase().includes(query);
}

function assignmentSummary(assignments = []) {
  if (!assignments.length) return "No active assignments yet";
  return assignments
    .slice(0, 3)
    .map((assignment) => `${assignment.gradeLevel} ${assignment.subject}${assignment.courseName ? `: ${assignment.courseName}` : ""}`)
    .join(" | ");
}

function ResourceEditor({ draft, setDraft, onSave, onLookup, lookupStatus, busy, canManage }) {
  function update(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white"><BookOpen size={17} className="text-sky-300" /> Curriculum Resource</div>
          <div className="mt-1 text-xs text-slate-500">Add by ISBN or maintain a manual title/edition record.</div>
        </div>
        <ActionButton type="button" onClick={() => setDraft({ ...emptyCurriculumResource, id: uid() })}>
          <Plus size={14} /> New
        </ActionButton>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
        <Input value={draft.isbn13 || draft.isbn10 || ""} onChange={(event) => update("isbn13", event.target.value)} placeholder="Enter ISBN-10 or ISBN-13" disabled={!canManage} />
        <ActionButton type="button" tone="sky" onClick={onLookup} disabled={!canManage || busy}>
          <Search size={14} /> Lookup ISBN
        </ActionButton>
      </div>
      {lookupStatus && <div className="mt-2 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">{lookupStatus}</div>}
      <div className="mt-4 grid gap-3 lg:grid-cols-[130px_1fr]">
        <div className="flex justify-center lg:justify-start">{coverBlock(draft)}</div>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title"><Input value={draft.title} onChange={(event) => update("title", event.target.value)} disabled={!canManage} /></Field>
          <Field label="Subtitle"><Input value={draft.subtitle} onChange={(event) => update("subtitle", event.target.value)} disabled={!canManage} /></Field>
          <Field label="Authors"><Input value={cleanAuthors(draft.authors)} onChange={(event) => update("authors", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} disabled={!canManage} /></Field>
          <Field label="Publisher"><Input value={draft.publisher} onChange={(event) => update("publisher", event.target.value)} disabled={!canManage} /></Field>
          <Field label="Edition"><Input value={draft.edition} onChange={(event) => update("edition", event.target.value)} disabled={!canManage} /></Field>
          <Field label="Publication Year"><Input value={draft.publicationYear} onChange={(event) => update("publicationYear", event.target.value)} disabled={!canManage} /></Field>
          <Field label="ISBN-10"><Input value={draft.isbn10 || ""} onChange={(event) => update("isbn10", event.target.value)} disabled={!canManage} /></Field>
          <Field label="ISBN-13"><Input value={draft.isbn13 || ""} onChange={(event) => update("isbn13", event.target.value)} disabled={!canManage} /></Field>
          <Field label="Material Type">
            <Select value={draft.materialType} onChange={(event) => update("materialType", event.target.value)} disabled={!canManage}>
              {MATERIAL_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </Select>
          </Field>
          <Field label="On Hand"><Input type="number" min="0" step="1" value={draft.quantityOnHand} onChange={(event) => update("quantityOnHand", event.target.value)} disabled={!canManage} /></Field>
          <Field label="Cover Image URL"><Input value={draft.coverImageUrl || ""} onChange={(event) => update("coverImageUrl", event.target.value)} disabled={!canManage} /></Field>
          <label className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <input type="checkbox" checked={draft.reusable !== false} onChange={(event) => update("reusable", event.target.checked)} disabled={!canManage} className="h-4 w-4 accent-sky-500" />
            Reusable curriculum
          </label>
          <Field label="Description">
            <Textarea rows={3} value={draft.description || ""} onChange={(event) => update("description", event.target.value)} disabled={!canManage} className="md:col-span-2" />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {draft.id && (
          <ActionButton type="button" tone="rose" onClick={() => onSave({ ...draft, active: false })} disabled={!canManage || busy}>
            <Archive size={14} /> Archive
          </ActionButton>
        )}
        <ActionButton type="button" tone="emerald" onClick={() => onSave(draft)} disabled={!canManage || busy}>
          <Save size={14} /> Save Resource
        </ActionButton>
      </div>
    </div>
  );
}

function AssignmentPanel({ selectedResource, assignments, assignmentDraft, setAssignmentDraft, onSaveAssignment, canManage, busy }) {
  function update(field, value) {
    setAssignmentDraft((current) => ({ ...current, [field]: value }));
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-white"><Layers3 size={17} className="text-emerald-300" /> Assignments</div>
      {!selectedResource ? (
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-500">Select or save a curriculum resource to add assignments.</div>
      ) : (
        <>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <Field label="Grade">
              <Select value={assignmentDraft.gradeLevel} onChange={(event) => update("gradeLevel", event.target.value)} disabled={!canManage}>
                {CURRICULUM_GRADES.map((grade) => <option key={grade} value={grade}>{gradeLabel(grade)}</option>)}
              </Select>
            </Field>
            <Field label="Subject">
              <Select value={assignmentDraft.subject} onChange={(event) => update("subject", event.target.value)} disabled={!canManage}>
                {CURRICULUM_SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
              </Select>
            </Field>
            <Field label="School Year"><Input value={assignmentDraft.schoolYear} onChange={(event) => update("schoolYear", event.target.value)} disabled={!canManage} /></Field>
            <Field label="Course / Class"><Input value={assignmentDraft.courseName} onChange={(event) => update("courseName", event.target.value)} disabled={!canManage} /></Field>
            <Field label="Teacher"><Input value={assignmentDraft.teacherName} onChange={(event) => update("teacherName", event.target.value)} disabled={!canManage} /></Field>
            <Field label="Teacher Email"><Input type="email" value={assignmentDraft.teacherEmail} onChange={(event) => update("teacherEmail", event.target.value)} disabled={!canManage} /></Field>
            <Field label="Notes"><Textarea rows={2} value={assignmentDraft.notes} onChange={(event) => update("notes", event.target.value)} disabled={!canManage} className="md:col-span-3" /></Field>
          </div>
          <div className="mt-3 flex justify-end">
            <ActionButton type="button" tone="emerald" onClick={onSaveAssignment} disabled={!canManage || busy}>
              <Save size={14} /> Save Assignment
            </ActionButton>
          </div>
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
            {assignments.map((assignment) => (
              <button
                key={assignment.id}
                type="button"
                onClick={() => setAssignmentDraft({ ...assignment })}
                className="grid w-full gap-2 border-b border-slate-800 bg-slate-950 px-3 py-2 text-left text-xs last:border-b-0 hover:bg-slate-800 md:grid-cols-[90px_130px_1fr_140px]"
              >
                <span className="font-bold text-sky-200">{gradeLabel(assignment.gradeLevel)}</span>
                <span className="font-semibold text-white">{assignment.subject}</span>
                <span className="text-slate-300">{assignment.courseName || "General curriculum"}{assignment.teacherName ? ` - ${assignment.teacherName}` : ""}</span>
                <span className="text-slate-500">{assignment.schoolYear}</span>
              </button>
            ))}
            {!assignments.length && <div className="bg-slate-950 px-3 py-3 text-xs font-semibold text-slate-500">No assignments for this resource yet.</div>}
          </div>
        </>
      )}
    </div>
  );
}

function InventoryPanel({ selectedResource, assignments, submissions, currentUserEmail, onSubmit, busy }) {
  const [draft, setDraft] = useState({ assignmentId: "", submittedCount: "", schoolYear: "2026-2027", note: "" });

  useEffect(() => {
    setDraft((current) => ({ ...current, submittedCount: selectedResource?.quantityOnHand ?? "", assignmentId: assignments[0]?.id || "" }));
  }, [selectedResource?.id, assignments.length]);

  if (!selectedResource) {
    return (
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-white"><History size={17} className="text-amber-300" /> Inventory</div>
        <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-500">Select a resource to submit or review counts.</div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-bold text-white"><History size={17} className="text-amber-300" /> Inventory</div>
        <div className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-100">{selectedResource.quantityOnHand} on hand</div>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_150px_150px]">
        <Field label="Assignment">
          <Select value={draft.assignmentId} onChange={(event) => setDraft({ ...draft, assignmentId: event.target.value })}>
            <option value="">General count</option>
            {assignments.map((assignment) => <option key={assignment.id} value={assignment.id}>{assignment.gradeLevel} {assignment.subject} - {assignment.teacherName || assignment.courseName || assignment.schoolYear}</option>)}
          </Select>
        </Field>
        <Field label="School Year"><Input value={draft.schoolYear} onChange={(event) => setDraft({ ...draft, schoolYear: event.target.value })} /></Field>
        <Field label="Count"><Input type="number" min="0" step="1" value={draft.submittedCount} onChange={(event) => setDraft({ ...draft, submittedCount: event.target.value })} /></Field>
        <Field label="Note"><Textarea rows={2} value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="Damaged, missing, discarded, or corrected copies..." className="md:col-span-3" /></Field>
      </div>
      <div className="mt-3 flex justify-end">
        <ActionButton type="button" tone="amber" disabled={busy} onClick={() => onSubmit({ ...draft, submittedByEmail: currentUserEmail })}>
          <CheckCircle2 size={14} /> Submit Count
        </ActionButton>
      </div>
      <div className="mt-3 max-h-60 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950">
        {submissions.map((submission) => (
          <div key={submission.id} className="border-b border-slate-800 px-3 py-2 text-xs last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-white">{submission.submittedCount} copies</span>
              <span className="text-slate-500">{dateTime(submission.createdAt)}</span>
            </div>
            <div className="mt-1 text-slate-400">Previous {submission.previousQuantity} | Resulting {submission.resultingQuantity} | {submission.submittedByEmail || "Unknown"}</div>
            {submission.note && <div className="mt-1 text-slate-500">{submission.note}</div>}
          </div>
        ))}
        {!submissions.length && <div className="px-3 py-3 text-xs font-semibold text-slate-500">No inventory submissions yet.</div>}
      </div>
    </div>
  );
}

export default function CurriculumModule({ currentUserEmail = "" }) {
  const canManage = canManageCurriculum(currentUserEmail);
  const [resources, setResources] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [resourceDraft, setResourceDraft] = useState(emptyCurriculumResource);
  const [assignmentDraft, setAssignmentDraft] = useState(emptyCurriculumAssignment);
  const [filters, setFilters] = useState({ query: "", grade: "all", subject: "all", schoolYear: "2026-2027", activeOnly: true });
  const [status, setStatus] = useState("Loading curriculum catalog...");
  const [lookupStatus, setLookupStatus] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedResource = useMemo(() => resources.find((resource) => resource.id === selectedId) || null, [resources, selectedId]);
  const selectedAssignments = useMemo(() => assignments.filter((assignment) => assignment.resourceId === selectedId && assignment.active), [assignments, selectedId]);
  const selectedSubmissions = useMemo(() => submissions.filter((submission) => submission.resourceId === selectedId), [submissions, selectedId]);
  const filteredResources = useMemo(() => resources.filter((resource) => resourceMatches(resource, assignments, filters)), [resources, assignments, filters]);

  async function loadData() {
    try {
      setBusy(true);
      const result = await fetchCurriculumData();
      setResources(result.resources || []);
      setAssignments(result.assignments || []);
      setSubmissions(result.submissions || []);
      if (!selectedId && result.resources?.[0]) {
        setSelectedId(result.resources[0].id);
        setResourceDraft(result.resources[0]);
      }
      setStatus(result.loaded ? "Curriculum catalog loaded." : result.reason || "Curriculum loaded from this device.");
    } catch (error) {
      setStatus(`Unable to load curriculum: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function selectResource(resource) {
    setSelectedId(resource.id);
    setResourceDraft({ ...resource });
    setAssignmentDraft({ ...emptyCurriculumAssignment, resourceId: resource.id });
    setLookupStatus("");
  }

  async function handleLookup() {
    try {
      setBusy(true);
      setLookupStatus("Looking up ISBN...");
      const result = await lookupCurriculumIsbn(resourceDraft.isbn13 || resourceDraft.isbn10);
      if (result.existing) {
        selectResource(result.existing);
        setLookupStatus("That ISBN already exists. Loaded the existing curriculum resource.");
        return;
      }
      if (!result.metadata) {
        setLookupStatus(result.warning || "No book metadata found. You can enter this resource manually.");
        setResourceDraft((current) => ({ ...current, isbn10: result.normalized.isbn10, isbn13: result.normalized.isbn13 }));
        return;
      }
      setResourceDraft((current) => ({
        ...current,
        ...result.metadata,
        quantityOnHand: current.quantityOnHand || 0,
        active: true,
      }));
      setLookupStatus("ISBN metadata loaded. Review it, edit anything needed, then save.");
    } catch (error) {
      setLookupStatus(`ISBN lookup failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveResource(nextDraft) {
    try {
      setBusy(true);
      const archived = nextDraft.active === false && nextDraft.id;
      if (archived && !window.confirm(`Archive ${nextDraft.title || "this curriculum resource"}?`)) return;
      const saved = archived ? await archiveCurriculumResource(nextDraft.id, currentUserEmail) : await saveCurriculumResource(nextDraft, currentUserEmail);
      await loadData();
      if (saved) {
        setSelectedId(saved.id);
        setResourceDraft(saved);
      }
      setStatus(archived ? "Curriculum resource archived." : "Curriculum resource saved.");
    } catch (error) {
      setStatus(`Unable to save curriculum: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveAssignment() {
    try {
      setBusy(true);
      const saved = await saveCurriculumAssignment({ ...assignmentDraft, resourceId: selectedId }, currentUserEmail);
      setAssignmentDraft({ ...emptyCurriculumAssignment, resourceId: selectedId, schoolYear: saved.schoolYear });
      await loadData();
      setStatus("Curriculum assignment saved.");
    } catch (error) {
      setStatus(`Unable to save assignment: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleInventorySubmit(draft) {
    try {
      setBusy(true);
      await submitCurriculumInventory({ resourceId: selectedId, ...draft, submittedByEmail: currentUserEmail });
      await loadData();
      setStatus("Inventory count submitted and history preserved.");
    } catch (error) {
      setStatus(`Unable to submit inventory: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-white"><BookOpen size={20} className="text-sky-300" /> Curriculum</div>
            <div className="mt-1 text-xs text-slate-500">Private first-version catalog for K-12 resources, assignments, ISBN lookup, and year-end inventory counts.</div>
          </div>
          <ActionButton type="button" onClick={loadData} disabled={busy}>
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Refresh
          </ActionButton>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_140px_170px_150px_auto]">
          <Field label="Search"><Input value={filters.query} onChange={(event) => setFilters({ ...filters, query: event.target.value })} placeholder="Title, author, publisher, ISBN..." /></Field>
          <Field label="Grade">
            <Select value={filters.grade} onChange={(event) => setFilters({ ...filters, grade: event.target.value })}>
              <option value="all">All grades</option>
              {CURRICULUM_GRADES.map((grade) => <option key={grade} value={grade}>{gradeLabel(grade)}</option>)}
            </Select>
          </Field>
          <Field label="Subject">
            <Select value={filters.subject} onChange={(event) => setFilters({ ...filters, subject: event.target.value })}>
              <option value="all">All subjects</option>
              {CURRICULUM_SUBJECTS.map((subject) => <option key={subject} value={subject}>{subject}</option>)}
            </Select>
          </Field>
          <Field label="School Year"><Input value={filters.schoolYear} onChange={(event) => setFilters({ ...filters, schoolYear: event.target.value })} /></Field>
          <label className="mt-6 flex items-center gap-2 text-xs font-bold text-slate-300">
            <input type="checkbox" checked={filters.activeOnly} onChange={(event) => setFilters({ ...filters, activeOnly: event.target.checked })} className="h-4 w-4 accent-sky-500" />
            Active only
          </label>
        </div>
        <div className="mt-3 rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">{status}</div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[430px_1fr]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-bold text-white">Catalog</div>
            <div className="text-xs font-semibold text-slate-500">{filteredResources.length} shown</div>
          </div>
          <div className="max-h-[760px] space-y-2 overflow-y-auto pr-1">
            {filteredResources.map((resource) => {
              const resourceAssignments = assignments.filter((assignment) => assignment.resourceId === resource.id && assignment.active);
              return (
                <button
                  key={resource.id}
                  type="button"
                  onClick={() => selectResource(resource)}
                  className={`grid w-full grid-cols-[72px_1fr] gap-3 rounded-lg border p-2 text-left transition hover:bg-slate-800 ${selectedId === resource.id ? "border-sky-500/60 bg-sky-500/10" : "border-slate-800 bg-slate-950"}`}
                >
                  {coverBlock(resource, true)}
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-white">{resource.title || "Untitled Curriculum"}</span>
                    <span className="mt-1 block truncate text-xs text-slate-400">{cleanAuthors(resource.authors) || resource.publisher || "No author listed"}</span>
                    <span className="mt-2 block text-[11px] font-semibold text-sky-200">{assignmentSummary(resourceAssignments)}</span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{resource.quantityOnHand} on hand</span>
                      {resource.edition && <span>{resource.edition}</span>}
                      {!resource.active && <span className="text-amber-300">Archived</span>}
                    </span>
                  </span>
                </button>
              );
            })}
            {!filteredResources.length && <div className="rounded-lg border border-slate-800 bg-slate-950 p-6 text-center text-sm font-semibold text-slate-500">No curriculum resources match this view.</div>}
          </div>
        </div>

        <div className="space-y-4">
          <ResourceEditor draft={resourceDraft} setDraft={setResourceDraft} onSave={handleSaveResource} onLookup={handleLookup} lookupStatus={lookupStatus} busy={busy} canManage={canManage} />
          <AssignmentPanel selectedResource={selectedResource} assignments={selectedAssignments} assignmentDraft={assignmentDraft.resourceId ? assignmentDraft : { ...assignmentDraft, resourceId: selectedId }} setAssignmentDraft={setAssignmentDraft} onSaveAssignment={handleSaveAssignment} canManage={canManage} busy={busy} />
          <InventoryPanel selectedResource={selectedResource} assignments={selectedAssignments} submissions={selectedSubmissions} currentUserEmail={currentUserEmail} onSubmit={handleInventorySubmit} busy={busy} />
        </div>
      </div>
    </div>
  );
}
