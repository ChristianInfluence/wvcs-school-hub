import { GoogleSheetsService } from "../_shared/googleSheetsService.ts";
import { jsonResponse, requireAdmin } from "../_shared/adminAuth.ts";
import {
  ARCHIVE_HEADERS,
  GRADE_ORDER,
  STUDENT_HEADERS,
  changedFields,
  archiveStudentRow,
  gradeSortKey,
  rowToStudent,
  sanitizeStudent,
  searchStudents,
  studentToRow,
  trimValue,
  validateStudent,
  rowsMatchHeaders,
  schoolYearFromSettingsValues,
} from "../_shared/studentRosterCore.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STUDENTS_SHEET = "Students";
const FORMER_STUDENTS_SHEET = "Former Students";
const AUDIT_SHEET = "Roster Audit";
const SETTINGS_SHEET = "Settings";
const TEMP_SORT_HEADER = "__WVCS_SORT_KEY__";

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  if (/GOOGLE_|PRIVATE|SECRET|KEY|credential/i.test(message)) return "Student Directory is not fully configured.";
  return message;
}

function json(body: Record<string, unknown>, status = 200) {
  return jsonResponse(body, status, corsHeaders);
}

async function ensureSheet(sheets: GoogleSheetsService, title: string, headers: string[]) {
  const sheetId = await sheets.sheetIdByTitle(title);
  if (sheetId === undefined) {
    await sheets.batchUpdate([{ addSheet: { properties: { title } } }]);
    await sheets.updateValues(`${title}!A1:${String.fromCharCode(64 + headers.length)}1`, [headers]);
    return;
  }

  const currentHeaders = await sheets.getValues(`${title}!A1:O1`);
  const headerRow = currentHeaders[0] || [];
  if (!headerRow.length) {
    await sheets.updateValues(`${title}!A1:${String.fromCharCode(64 + headers.length)}1`, [headers]);
    return;
  }
  if (!rowsMatchHeaders(headerRow, headers)) {
    throw new Error(`${title} sheet headers do not match the expected Student Directory layout.`);
  }
}

async function readActiveStudents(sheets: GoogleSheetsService) {
  await ensureSheet(sheets, STUDENTS_SHEET, STUDENT_HEADERS);
  const rows = await sheets.getValues(`${STUDENTS_SHEET}!A2:L`);
  return rows
    .map((row: string[], index: number) => ({ student: rowToStudent(row), rowNumber: index + 2 }))
    .filter(({ student }) => student.grade || student.studentFirstName || student.studentLastName || student.studentId);
}

async function readCurrentSchoolYear(sheets: GoogleSheetsService) {
  const values = await sheets.getValues(`${SETTINGS_SHEET}!B2:B2`);
  return schoolYearFromSettingsValues(values);
}

async function sortActiveStudents(sheets: GoogleSheetsService) {
  const rows = await readActiveStudents(sheets);
  if (!rows.length) return;

  const sheetId = await sheets.requiredSheetId(STUDENTS_SHEET);
  const maxRow = Math.max(...rows.map((row) => row.rowNumber));
  const sortKeys = Array.from({ length: maxRow - 1 }, (_, index) => {
    const found = rows.find((row) => row.rowNumber === index + 2);
    return [found ? gradeSortKey(found.student.grade) : ""];
  });

  await sheets.updateValues(`${STUDENTS_SHEET}!M1:M${maxRow}`, [[TEMP_SORT_HEADER], ...sortKeys]);
  await sheets.batchUpdate([
    {
      sortRange: {
        range: {
          sheetId,
          startRowIndex: 1,
          endRowIndex: maxRow,
          startColumnIndex: 0,
          endColumnIndex: 13,
        },
        sortSpecs: [
          { dimensionIndex: 12, sortOrder: "ASCENDING" },
          { dimensionIndex: 2, sortOrder: "ASCENDING" },
          { dimensionIndex: 1, sortOrder: "ASCENDING" },
        ],
      },
    },
  ]);
  await sheets.clearValues(`${STUDENTS_SHEET}!M1:M${maxRow}`);
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
  return json({ students, grades: GRADE_ORDER });
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

  await ensureSheet(sheets, STUDENTS_SHEET, STUDENT_HEADERS);
  await sheets.appendValues(`${STUDENTS_SHEET}!A:L`, [studentToRow(validation.student)]);
  await sortActiveStudents(sheets);
  await appendAudit(sheets, { adminEmail, action: "CREATE", student: validation.student });
  return json({ student: validation.student }, 201);
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
  await sheets.updateValues(`${STUDENTS_SHEET}!A${existing.rowNumber}:L${existing.rowNumber}`, [studentToRow(validation.student)]);
  await sortActiveStudents(sheets);
  await appendAudit(sheets, { adminEmail, action: "UPDATE", student: validation.student, changed });
  return json({ student: validation.student });
}

async function handleRemove(sheets: GoogleSheetsService, payload: Record<string, unknown>, adminEmail: string) {
  const studentId = trimValue(payload.studentId);
  if (!studentId) return json({ error: "Student-ID is required." }, 400);

  const rows = await readActiveStudents(sheets);
  const existing = rows.find(({ student }) => student.studentId === studentId);
  if (!existing) return json({ error: "Student not found." }, 404);

  await ensureSheet(sheets, FORMER_STUDENTS_SHEET, ARCHIVE_HEADERS);
  const schoolYear = await readCurrentSchoolYear(sheets);
  const reason = trimValue(payload.reason) || "Removed from active roster";
  await sheets.appendValues(`${FORMER_STUDENTS_SHEET}!A:O`, [
    archiveStudentRow(existing.student, { archiveDate: new Date().toISOString(), schoolYear, reason }),
  ]);

  const sheetId = await sheets.requiredSheetId(STUDENTS_SHEET);
  await sheets.batchUpdate([
    {
      deleteDimension: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: existing.rowNumber - 1,
          endIndex: existing.rowNumber,
        },
      },
    },
  ]);
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
