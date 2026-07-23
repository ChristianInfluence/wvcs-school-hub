import { GoogleSheetsService } from "../_shared/googleSheetsService.ts";
import { jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";
import {
  ARCHIVE_HEADERS,
  GRADE_ORDER,
  STUDENT_HEADERS,
  changedFields,
  archiveStudentRow,
  rowToStudent,
  sanitizeStudent,
  searchStudents,
  sortStudents,
  studentToRow,
  trimValue,
  validateStudent,
} from "../_shared/studentRosterCore.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STUDENTS_SHEET = "Students";
const FORMER_STUDENTS_SHEET = "Former Students";
const AUDIT_SHEET = "Roster Audit";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  if (/GOOGLE_|PRIVATE|SECRET|KEY|credential/i.test(message)) return "Student Directory is not fully configured.";
  return message;
}

function json(body: Record<string, unknown>, status = 200) {
  return jsonResponse(body, status, corsHeaders);
}

function currentSchoolYear(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const start = month >= 7 ? year : year - 1;
  return `${start}-${start + 1}`;
}

async function ensureSheet(sheets: GoogleSheetsService, title: string, headers: string[]) {
  const sheetId = await sheets.sheetIdByTitle(title);
  if (sheetId === undefined) {
    await sheets.batchUpdate([{ addSheet: { properties: { title } } }]);
  }

  const currentHeaders = await sheets.getValues(`${title}!A1:O1`);
  if (!currentHeaders.length || !currentHeaders[0]?.length) {
    await sheets.updateValues(`${title}!A1:${String.fromCharCode(64 + headers.length)}1`, [headers]);
  }
}

async function readActiveStudents(sheets: GoogleSheetsService) {
  const rows = await sheets.getValues(`${STUDENTS_SHEET}!A2:L`);
  return rows
    .map((row: string[], index: number) => ({ student: rowToStudent(row), rowNumber: index + 2 }))
    .filter(({ student }) => student.grade || student.studentFirstName || student.studentLastName || student.studentId);
}

async function writeSortedActiveStudents(sheets: GoogleSheetsService, students: Record<string, string>[]) {
  const sortedRows = sortStudents(students).map(studentToRow);
  const blankRow = ["", "", "", "", "", "", "", "", "", "", "", ""];
  const paddedRows = [...sortedRows, ...Array.from({ length: 25 }, () => blankRow)];
  await sheets.updateValues(`${STUDENTS_SHEET}!A2:L${paddedRows.length + 1}`, paddedRows);
  return sortedRows.map(rowToStudent);
}

async function appendAudit(
  sheets: GoogleSheetsService,
  {
    adminEmail,
    action,
    student,
    changed = [],
    reason = "",
  }: {
    adminEmail: string;
    action: string;
    student: Record<string, string>;
    changed?: string[];
    reason?: string;
  }
) {
  await ensureSheet(sheets, AUDIT_SHEET, ["Timestamp", "Admin", "Action", "Student-ID", "Student", "Changed-Fields", "Reason"]);
  await sheets.appendValues(`${AUDIT_SHEET}!A:G`, [
    [
      new Date().toISOString(),
      adminEmail,
      action,
      student.studentId,
      `${student.studentFirstName} ${student.studentLastName}`.trim(),
      changed.join(", "),
      trimValue(reason),
    ],
  ]);
}

async function handleList(sheets: GoogleSheetsService, payload: Record<string, unknown>) {
  const rows = await readActiveStudents(sheets);
  let students = rows.map(({ student }) => student).filter((student) => student.studentId);
  const grade = trimValue(payload.grade);
  if (grade && grade !== "all") students = students.filter((student) => student.grade === grade);
  students = searchStudents(students, String(payload.q || ""));
  return json({ students: sortStudents(students), grades: GRADE_ORDER });
}

async function handleGet(sheets: GoogleSheetsService, studentId: string) {
  const rows = await readActiveStudents(sheets);
  const found = rows.find(({ student }) => student.studentId === studentId);
  if (!found) return json({ error: "Student not found." }, 404);
  return json({ student: found.student });
}

async function handleCreate(sheets: GoogleSheetsService, payload: Record<string, unknown>, adminEmail: string) {
  const student = sanitizeStudent(payload.student || {}, crypto.randomUUID());
  const validation = validateStudent(student);
  if (!validation.valid) return json({ error: validation.errors.join(" ") }, 400);

  const rows = await readActiveStudents(sheets);
  const students = rows.map(({ student: existing }) => existing);
  students.push(validation.student);
  const sorted = await writeSortedActiveStudents(sheets, students);
  await appendAudit(sheets, { adminEmail, action: "CREATE", student: validation.student });
  return json({ student: sorted.find((entry) => entry.studentId === validation.student.studentId) || validation.student }, 201);
}

async function handleUpdate(sheets: GoogleSheetsService, payload: Record<string, unknown>, adminEmail: string) {
  const studentId = trimValue(payload.studentId);
  if (!studentId) return json({ error: "Student-ID is required." }, 400);

  const rows = await readActiveStudents(sheets);
  const existing = rows.find(({ student }) => student.studentId === studentId);
  if (!existing) return json({ error: "Student not found." }, 404);

  const nextStudent = sanitizeStudent(payload.student || {}, studentId);
  const validation = validateStudent(nextStudent);
  if (!validation.valid) return json({ error: validation.errors.join(" ") }, 400);

  const changed = changedFields(existing.student, validation.student);
  const students = rows.map(({ student }) => (student.studentId === studentId ? validation.student : student));
  const sorted = await writeSortedActiveStudents(sheets, students);
  await appendAudit(sheets, { adminEmail, action: "UPDATE", student: validation.student, changed });
  return json({ student: sorted.find((entry) => entry.studentId === studentId) || validation.student });
}

async function handleRemove(sheets: GoogleSheetsService, payload: Record<string, unknown>, adminEmail: string) {
  const studentId = trimValue(payload.studentId);
  if (!studentId) return json({ error: "Student-ID is required." }, 400);

  const rows = await readActiveStudents(sheets);
  const existing = rows.find(({ student }) => student.studentId === studentId);
  if (!existing) return json({ error: "Student not found." }, 404);

  await ensureSheet(sheets, FORMER_STUDENTS_SHEET, ARCHIVE_HEADERS);
  const reason = trimValue(payload.reason) || "Removed from active roster";
  await sheets.appendValues(`${FORMER_STUDENTS_SHEET}!A:O`, [
    archiveStudentRow(existing.student, { archiveDate: new Date().toISOString(), schoolYear: currentSchoolYear(), reason }),
  ]);

  const remaining = rows.filter(({ student }) => student.studentId !== studentId).map(({ student }) => student);
  await writeSortedActiveStudents(sheets, remaining);
  await appendAudit(sheets, { adminEmail, action: "REMOVE", student: existing.student, reason });
  return json({ removed: true });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

  try {
    const admin = await requireAdmin(request);
    if ("error" in admin) return json({ error: admin.error }, admin.status);

    const payload = await request.json();
    const action = trimValue(payload.action);
    const sheets = new GoogleSheetsService();

    if (action === "list") return await handleList(sheets, payload);
    if (action === "get") return await handleGet(sheets, trimValue(payload.studentId));
    if (action === "create") return await handleCreate(sheets, payload, admin.email);
    if (action === "update") return await handleUpdate(sheets, payload, admin.email);
    if (action === "remove") return await handleRemove(sheets, payload, admin.email);

    return json({ error: "Unsupported Student Directory action." }, 400);
  } catch (error) {
    console.error("Student Directory request failed", error instanceof Error ? error.message : error);
    return json({ error: safeError(error) }, 500);
  }
});
