import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { normalizeIsbn } from "./isbnUtils.js";
import { STAFF_CONTRACT_ADMIN_EMAIL } from "./staffContractsData.js";

const RESOURCES_STORE_KEY = "wvcs-curriculum-resources-v1";
const ASSIGNMENTS_STORE_KEY = "wvcs-curriculum-assignments-v1";
const SUBMISSIONS_STORE_KEY = "wvcs-curriculum-inventory-submissions-v1";

export const CURRICULUM_GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
export const CURRICULUM_SUBJECTS = ["Bible", "Language Arts", "Math", "Science", "Social Studies", "History", "Writing", "Reading", "Spelling", "Art", "Music", "PE", "Elective", "Other"];
export const MATERIAL_TYPES = ["Textbook", "Workbook", "Teacher Guide", "Reader", "Lab Manual", "Digital Resource", "Other"];

export const emptyCurriculumResource = {
  title: "",
  subtitle: "",
  authors: [],
  publisher: "",
  edition: "",
  publicationYear: "",
  isbn10: "",
  isbn13: "",
  description: "",
  coverImageUrl: "",
  materialType: "Textbook",
  reusable: true,
  quantityOnHand: 0,
  active: true,
};

export const emptyCurriculumAssignment = {
  resourceId: "",
  gradeLevel: "K",
  subject: "Bible",
  courseName: "",
  teacherName: "",
  teacherEmail: "",
  schoolYear: "2026-2027",
  notes: "",
  active: true,
};

function readLocal(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function writeLocal(key, records) {
  localStorage.setItem(key, JSON.stringify(records));
}

function isMissingCurriculumTable(error) {
  return ["curriculum_resources", "curriculum_assignments", "curriculum_inventory_submissions", "submit_curriculum_inventory"].some((name) =>
    String(error?.message || "").includes(name)
  );
}

function cleanString(value = "") {
  return String(value || "").trim();
}

function mapResource(row = {}) {
  return {
    id: row.id,
    title: row.title || "",
    subtitle: row.subtitle || "",
    authors: row.authors || [],
    publisher: row.publisher || "",
    edition: row.edition || "",
    publicationYear: row.publication_year || "",
    isbn10: row.isbn10 || "",
    isbn13: row.isbn13 || "",
    description: row.description || "",
    coverImageUrl: row.cover_image_url || "",
    materialType: row.material_type || "Textbook",
    reusable: row.reusable !== false,
    quantityOnHand: Number(row.quantity_on_hand || 0),
    active: row.active !== false,
    createdByEmail: row.created_by_email || "",
    updatedByEmail: row.updated_by_email || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function resourceToRow(resource = {}, currentUserEmail = "") {
  const isbn10 = normalizeIsbn(resource.isbn10).valid ? normalizeIsbn(resource.isbn10).isbn10 || normalizeIsbn(resource.isbn10).isbn : "";
  const isbn13 = normalizeIsbn(resource.isbn13 || resource.isbn10).isbn13 || "";
  return {
    ...(resource.id ? { id: resource.id } : {}),
    title: cleanString(resource.title),
    subtitle: cleanString(resource.subtitle),
    authors: Array.isArray(resource.authors) ? resource.authors.map(cleanString).filter(Boolean) : String(resource.authors || "").split(",").map(cleanString).filter(Boolean),
    publisher: cleanString(resource.publisher),
    edition: cleanString(resource.edition),
    publication_year: cleanString(resource.publicationYear),
    isbn10: isbn10 || null,
    isbn13: isbn13 || null,
    description: cleanString(resource.description),
    cover_image_url: cleanString(resource.coverImageUrl),
    material_type: cleanString(resource.materialType) || "Textbook",
    reusable: resource.reusable !== false,
    quantity_on_hand: Math.max(Number.parseInt(resource.quantityOnHand || 0, 10) || 0, 0),
    active: resource.active !== false,
    created_by_email: resource.createdByEmail || currentUserEmail || null,
    updated_by_email: currentUserEmail || null,
    updated_at: new Date().toISOString(),
  };
}

function mapAssignment(row = {}) {
  return {
    id: row.id,
    resourceId: row.resource_id || "",
    gradeLevel: row.grade_level || "K",
    subject: row.subject || "",
    courseName: row.course_name || "",
    teacherName: row.teacher_name || "",
    teacherEmail: row.teacher_email || "",
    schoolYear: row.school_year || "2026-2027",
    notes: row.notes || "",
    active: row.active !== false,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function assignmentToRow(assignment = {}, currentUserEmail = "") {
  return {
    ...(assignment.id ? { id: assignment.id } : {}),
    resource_id: assignment.resourceId,
    grade_level: cleanString(assignment.gradeLevel),
    subject: cleanString(assignment.subject),
    course_name: cleanString(assignment.courseName),
    teacher_name: cleanString(assignment.teacherName),
    teacher_email: cleanString(assignment.teacherEmail).toLowerCase(),
    school_year: cleanString(assignment.schoolYear) || "2026-2027",
    notes: cleanString(assignment.notes),
    active: assignment.active !== false,
    created_by_email: assignment.createdByEmail || currentUserEmail || null,
    updated_by_email: currentUserEmail || null,
    updated_at: new Date().toISOString(),
  };
}

function mapSubmission(row = {}) {
  return {
    id: row.id,
    resourceId: row.resource_id || "",
    assignmentId: row.assignment_id || "",
    submittedCount: Number(row.submitted_count || 0),
    previousQuantity: Number(row.previous_quantity || 0),
    resultingQuantity: Number(row.resulting_quantity || row.submitted_count || 0),
    schoolYear: row.school_year || "2026-2027",
    note: row.note || "",
    submittedByEmail: row.submitted_by_email || "",
    submittedByName: row.submitted_by_name || "",
    status: row.status || "Submitted",
    createdAt: row.created_at || "",
  };
}

export function canManageCurriculum(email = "") {
  return cleanString(email).toLowerCase() === STAFF_CONTRACT_ADMIN_EMAIL;
}

export async function fetchCurriculumData() {
  if (!isSupabaseConfigured) {
    return {
      loaded: false,
      reason: "Supabase is not configured. Showing curriculum saved on this device.",
      resources: readLocal(RESOURCES_STORE_KEY),
      assignments: readLocal(ASSIGNMENTS_STORE_KEY),
      submissions: readLocal(SUBMISSIONS_STORE_KEY),
    };
  }
  const [resourcesResult, assignmentsResult, submissionsResult] = await Promise.all([
    supabase.from("curriculum_resources").select("*").order("title", { ascending: true }),
    supabase.from("curriculum_assignments").select("*").order("grade_level", { ascending: true }).order("subject", { ascending: true }),
    supabase.from("curriculum_inventory_submissions").select("*").order("created_at", { ascending: false }).limit(250),
  ]);
  if (resourcesResult.error) {
    return {
      loaded: false,
      reason: "Curriculum tables are not installed yet. Saving curriculum on this device until Supabase is updated.",
      resources: readLocal(RESOURCES_STORE_KEY),
      assignments: readLocal(ASSIGNMENTS_STORE_KEY),
      submissions: readLocal(SUBMISSIONS_STORE_KEY),
    };
  }
  if (assignmentsResult.error) throw assignmentsResult.error;
  if (submissionsResult.error) throw submissionsResult.error;
  return {
    loaded: true,
    resources: (resourcesResult.data || []).map(mapResource),
    assignments: (assignmentsResult.data || []).map(mapAssignment),
    submissions: (submissionsResult.data || []).map(mapSubmission),
  };
}

export async function findCurriculumByIsbn(isbn = "") {
  const normalized = normalizeIsbn(isbn);
  if (!normalized.valid) throw new Error("Enter a valid ISBN-10 or ISBN-13.");
  if (!isSupabaseConfigured) {
    const existing = readLocal(RESOURCES_STORE_KEY).find((resource) => resource.isbn13 === normalized.isbn13 || resource.isbn10 === normalized.isbn10 || resource.isbn10 === normalized.isbn);
    return existing || null;
  }
  const clauses = [
    normalized.isbn13 ? `isbn13.eq.${normalized.isbn13}` : "",
    normalized.isbn10 ? `isbn10.eq.${normalized.isbn10}` : "",
    normalized.isbn && normalized.isbn !== normalized.isbn13 && normalized.isbn !== normalized.isbn10 ? `isbn10.eq.${normalized.isbn}` : "",
  ].filter(Boolean);
  const { data, error } = await supabase
    .from("curriculum_resources")
    .select("*")
    .or(clauses.join(","))
    .maybeSingle();
  if (isMissingCurriculumTable(error)) {
    const existing = readLocal(RESOURCES_STORE_KEY).find((resource) => resource.isbn13 === normalized.isbn13 || resource.isbn10 === normalized.isbn10 || resource.isbn10 === normalized.isbn);
    return existing || null;
  }
  if (error) throw error;
  return data ? mapResource(data) : null;
}

export async function lookupCurriculumIsbn(isbn = "") {
  const normalized = normalizeIsbn(isbn);
  if (!normalized.valid) throw new Error("Enter a valid ISBN-10 or ISBN-13.");
  const existing = await findCurriculumByIsbn(isbn);
  if (existing) return { existing, metadata: null, normalized };
  if (!isSupabaseConfigured) return { existing: null, metadata: null, normalized, warning: "Supabase is not configured, so ISBN lookup is unavailable." };
  const { data, error } = await supabase.functions.invoke("curriculum-isbn-lookup", { body: { isbn: normalized.isbn13 || normalized.isbn } });
  if (error) {
    const details = error.context ? await error.context.json().catch(() => null) : null;
    throw new Error(details?.error || error.message || "ISBN lookup failed.");
  }
  if (data?.error) throw new Error(data.error);
  return { existing: null, metadata: data.metadata || null, normalized };
}

export async function saveCurriculumResource(resource, currentUserEmail = "") {
  if (!cleanString(resource.title)) throw new Error("Enter a curriculum title.");
  const row = resourceToRow(resource, currentUserEmail);
  if (!isSupabaseConfigured) {
    const records = readLocal(RESOURCES_STORE_KEY);
    const id = resource.id || crypto.randomUUID();
    const saved = mapResource({ ...row, id, created_at: resource.createdAt || new Date().toISOString() });
    writeLocal(RESOURCES_STORE_KEY, [saved, ...records.filter((item) => item.id !== id)].sort((a, b) => a.title.localeCompare(b.title)));
    return saved;
  }
  const { data, error } = await supabase.from("curriculum_resources").upsert(row, { onConflict: "id" }).select("*").single();
  if (error) {
    if (isMissingCurriculumTable(error)) {
      const records = readLocal(RESOURCES_STORE_KEY);
      const id = resource.id || crypto.randomUUID();
      const saved = mapResource({ ...row, id, created_at: resource.createdAt || new Date().toISOString() });
      writeLocal(RESOURCES_STORE_KEY, [saved, ...records.filter((item) => item.id !== id)].sort((a, b) => a.title.localeCompare(b.title)));
      return saved;
    }
    if (String(error.message || "").toLowerCase().includes("duplicate")) throw new Error("That ISBN already exists in the curriculum catalog.");
    throw error;
  }
  return mapResource(data);
}

export async function saveCurriculumAssignment(assignment, currentUserEmail = "") {
  if (!assignment.resourceId) throw new Error("Select a curriculum resource first.");
  const row = assignmentToRow(assignment, currentUserEmail);
  if (!isSupabaseConfigured) {
    const records = readLocal(ASSIGNMENTS_STORE_KEY);
    const id = assignment.id || crypto.randomUUID();
    const saved = mapAssignment({ ...row, id, created_at: assignment.createdAt || new Date().toISOString() });
    writeLocal(ASSIGNMENTS_STORE_KEY, [saved, ...records.filter((item) => item.id !== id)]);
    return saved;
  }
  const { data, error } = await supabase.from("curriculum_assignments").upsert(row, { onConflict: "id" }).select("*").single();
  if (isMissingCurriculumTable(error)) {
    const records = readLocal(ASSIGNMENTS_STORE_KEY);
    const id = assignment.id || crypto.randomUUID();
    const saved = mapAssignment({ ...row, id, created_at: assignment.createdAt || new Date().toISOString() });
    writeLocal(ASSIGNMENTS_STORE_KEY, [saved, ...records.filter((item) => item.id !== id)]);
    return saved;
  }
  if (error) throw error;
  return mapAssignment(data);
}

export async function archiveCurriculumResource(resourceId, currentUserEmail = "") {
  if (!resourceId) return null;
  if (!isSupabaseConfigured) {
    const records = readLocal(RESOURCES_STORE_KEY).map((resource) => (resource.id === resourceId ? { ...resource, active: false, updatedByEmail: currentUserEmail, updatedAt: new Date().toISOString() } : resource));
    writeLocal(RESOURCES_STORE_KEY, records);
    return records.find((resource) => resource.id === resourceId) || null;
  }
  const { data, error } = await supabase
    .from("curriculum_resources")
    .update({ active: false, updated_by_email: currentUserEmail || null, updated_at: new Date().toISOString() })
    .eq("id", resourceId)
    .select("*")
    .single();
  if (isMissingCurriculumTable(error)) {
    const records = readLocal(RESOURCES_STORE_KEY).map((resource) => (resource.id === resourceId ? { ...resource, active: false, updatedByEmail: currentUserEmail, updatedAt: new Date().toISOString() } : resource));
    writeLocal(RESOURCES_STORE_KEY, records);
    return records.find((resource) => resource.id === resourceId) || null;
  }
  if (error) throw error;
  return mapResource(data);
}

export async function archiveCurriculumAssignment(assignmentId, currentUserEmail = "") {
  if (!assignmentId) return null;
  if (!isSupabaseConfigured) {
    const records = readLocal(ASSIGNMENTS_STORE_KEY).map((assignment) => (
      assignment.id === assignmentId
        ? { ...assignment, active: false, updatedByEmail: currentUserEmail, updatedAt: new Date().toISOString() }
        : assignment
    ));
    writeLocal(ASSIGNMENTS_STORE_KEY, records);
    return records.find((assignment) => assignment.id === assignmentId) || null;
  }
  const { data, error } = await supabase
    .from("curriculum_assignments")
    .update({ active: false, updated_by_email: currentUserEmail || null, updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .select("*")
    .single();
  if (isMissingCurriculumTable(error)) {
    const records = readLocal(ASSIGNMENTS_STORE_KEY).map((assignment) => (
      assignment.id === assignmentId
        ? { ...assignment, active: false, updatedByEmail: currentUserEmail, updatedAt: new Date().toISOString() }
        : assignment
    ));
    writeLocal(ASSIGNMENTS_STORE_KEY, records);
    return records.find((assignment) => assignment.id === assignmentId) || null;
  }
  if (error) throw error;
  return mapAssignment(data);
}

export async function submitCurriculumInventory({ resourceId, assignmentId = "", submittedCount, schoolYear = "2026-2027", note = "", submittedByName = "", submittedByEmail = "" }) {
  const count = Number.parseInt(submittedCount, 10);
  if (!resourceId) throw new Error("Select a curriculum resource.");
  if (!Number.isInteger(count) || count < 0) throw new Error("Inventory count must be a nonnegative whole number.");
  if (!isSupabaseConfigured) {
    const resources = readLocal(RESOURCES_STORE_KEY);
    const resource = resources.find((item) => item.id === resourceId);
    const previous = Number(resource?.quantityOnHand || 0);
    const submission = {
      id: crypto.randomUUID(),
      resourceId,
      assignmentId,
      submittedCount: count,
      previousQuantity: previous,
      resultingQuantity: count,
      schoolYear,
      note,
      submittedByName,
      submittedByEmail,
      status: "Submitted",
      createdAt: new Date().toISOString(),
    };
    writeLocal(RESOURCES_STORE_KEY, resources.map((item) => (item.id === resourceId ? { ...item, quantityOnHand: count } : item)));
    writeLocal(SUBMISSIONS_STORE_KEY, [submission, ...readLocal(SUBMISSIONS_STORE_KEY)]);
    return submission;
  }
  const { data, error } = await supabase.rpc("submit_curriculum_inventory", {
    p_resource_id: resourceId,
    p_assignment_id: assignmentId || null,
    p_submitted_count: count,
    p_school_year: schoolYear,
    p_note: note,
    p_submitted_by_name: submittedByName,
    p_submitted_by_email: submittedByEmail,
  });
  if (isMissingCurriculumTable(error)) {
    const resources = readLocal(RESOURCES_STORE_KEY);
    const resource = resources.find((item) => item.id === resourceId);
    const previous = Number(resource?.quantityOnHand || 0);
    const submission = {
      id: crypto.randomUUID(),
      resourceId,
      assignmentId,
      submittedCount: count,
      previousQuantity: previous,
      resultingQuantity: count,
      schoolYear,
      note,
      submittedByName,
      submittedByEmail,
      status: "Submitted",
      createdAt: new Date().toISOString(),
    };
    writeLocal(RESOURCES_STORE_KEY, resources.map((item) => (item.id === resourceId ? { ...item, quantityOnHand: count } : item)));
    writeLocal(SUBMISSIONS_STORE_KEY, [submission, ...readLocal(SUBMISSIONS_STORE_KEY)]);
    return submission;
  }
  if (error) throw error;
  return mapSubmission(Array.isArray(data) ? data[0] : data);
}
