export const STUDENT_HEADERS = [
  "Grade",
  "Student-FN",
  "Student-LN",
  "Parent-1-FN",
  "Parent-1-LN",
  "EMAIL-1",
  "Parent-1-#",
  "Parent-2-FN",
  "Parent-2-LN",
  "Parent-2-#",
  "EMAIL-2",
  "Student-ID",
];

export const ARCHIVE_HEADERS = [
  ...STUDENT_HEADERS,
  "Archive-Date",
  "School-Year",
  "Reason",
];

export const LEGACY_ARCHIVE_HEADERS = [
  ...STUDENT_HEADERS.slice(0, 11),
  "Archive-Date",
  "School-Year",
  "Reason",
];

export const GRADE_ORDER = ["PS", "PK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const FIELD_MAP = [
  "grade",
  "studentFirstName",
  "studentLastName",
  "parent1FirstName",
  "parent1LastName",
  "email1",
  "phone1",
  "parent2FirstName",
  "parent2LastName",
  "phone2",
  "email2",
  "studentId",
];

export function trimValue(value) {
  return String(value ?? "").trim();
}

export function normalizeGrade(value) {
  const clean = trimValue(value).toUpperCase();
  if (clean === "PREK" || clean === "PRE-K") return "PK";
  if (clean === "KINDERGARTEN") return "K";
  return clean;
}

export function rowToStudent(row = []) {
  const values = FIELD_MAP.map((_, index) => trimValue(row[index]));
  return {
    grade: normalizeGrade(values[0]),
    studentFirstName: values[1],
    studentLastName: values[2],
    parent1FirstName: values[3],
    parent1LastName: values[4],
    email1: values[5],
    phone1: values[6],
    parent2FirstName: values[7],
    parent2LastName: values[8],
    phone2: values[9],
    email2: values[10],
    studentId: values[11],
  };
}

export function studentToRow(student) {
  return [
    normalizeGrade(student.grade),
    trimValue(student.studentFirstName),
    trimValue(student.studentLastName),
    trimValue(student.parent1FirstName),
    trimValue(student.parent1LastName),
    trimValue(student.email1),
    trimValue(student.phone1),
    trimValue(student.parent2FirstName),
    trimValue(student.parent2LastName),
    trimValue(student.phone2),
    trimValue(student.email2),
    trimValue(student.studentId),
  ];
}

export function sanitizeStudent(input = {}, existingStudentId = "") {
  return {
    grade: normalizeGrade(input.grade),
    studentFirstName: trimValue(input.studentFirstName),
    studentLastName: trimValue(input.studentLastName),
    parent1FirstName: trimValue(input.parent1FirstName),
    parent1LastName: trimValue(input.parent1LastName),
    email1: trimValue(input.email1),
    phone1: trimValue(input.phone1),
    parent2FirstName: trimValue(input.parent2FirstName),
    parent2LastName: trimValue(input.parent2LastName),
    phone2: trimValue(input.phone2),
    email2: trimValue(input.email2),
    studentId: trimValue(existingStudentId || input.studentId),
  };
}

export function validateStudent(input = {}, { requireStudentId = true } = {}) {
  const student = sanitizeStudent(input);
  const errors = [];
  if (requireStudentId && !student.studentId) errors.push("Student-ID is required.");
  if (!GRADE_ORDER.includes(student.grade)) errors.push("Choose a supported grade.");
  if (!student.studentFirstName) errors.push("Student first name is required.");
  if (!student.studentLastName) errors.push("Student last name is required.");
  return { valid: errors.length === 0, errors, student };
}

export function compareStudents(a, b) {
  const gradeA = GRADE_ORDER.indexOf(normalizeGrade(a.grade));
  const gradeB = GRADE_ORDER.indexOf(normalizeGrade(b.grade));
  const safeGradeA = gradeA === -1 ? 999 : gradeA;
  const safeGradeB = gradeB === -1 ? 999 : gradeB;
  if (safeGradeA !== safeGradeB) return safeGradeA - safeGradeB;

  const last = trimValue(a.studentLastName).localeCompare(trimValue(b.studentLastName), undefined, { sensitivity: "base" });
  if (last !== 0) return last;
  return trimValue(a.studentFirstName).localeCompare(trimValue(b.studentFirstName), undefined, { sensitivity: "base" });
}

export function sortStudents(students = []) {
  return [...students].sort(compareStudents);
}

export function searchStudents(students = [], query = "") {
  const q = trimValue(query).toLowerCase();
  if (!q) return students;
  return students.filter((student) =>
    [
      student.studentFirstName,
      student.studentLastName,
      student.parent1FirstName,
      student.parent1LastName,
      student.email1,
      student.phone1,
      student.parent2FirstName,
      student.parent2LastName,
      student.email2,
      student.phone2,
    ]
      .join(" ")
      .toLowerCase()
      .includes(q)
  );
}

export function changedFields(before = {}, after = {}) {
  return FIELD_MAP.filter((field) => field !== "studentId" && trimValue(before[field]) !== trimValue(after[field]));
}

export function hasAdminAccess(accessRow = {}) {
  if (!accessRow) return false;
  return Boolean(accessRow.can_use_admin || accessRow.canUseAdmin);
}

export function archiveStudentRow(student, { archiveDate = new Date().toISOString(), schoolYear = "", reason = "" } = {}) {
  return [...studentToRow(student), trimValue(archiveDate), trimValue(schoolYear), trimValue(reason)];
}

export function gradeSortKey(grade) {
  const index = GRADE_ORDER.indexOf(normalizeGrade(grade));
  return index === -1 ? 999 : index;
}

export function rowsMatchHeaders(actual = [], expected = []) {
  return expected.every((header, index) => trimValue(actual[index]) === header);
}

export function migrateArchiveRows(rows = [], createId = () => "") {
  if (!rows.length) return { headers: ARCHIVE_HEADERS, rows: [], changed: false };
  const [headerRow = [], ...dataRows] = rows;
  const isCurrent = rowsMatchHeaders(headerRow, ARCHIVE_HEADERS);
  const isLegacy = rowsMatchHeaders(headerRow, LEGACY_ARCHIVE_HEADERS);

  if (isCurrent) {
    const migratedRows = dataRows.map((row) => {
      const next = Array.from({ length: 15 }, (_, index) => trimValue(row[index]));
      if (next.some(Boolean) && !next[11]) next[11] = createId();
      return next;
    });
    return { headers: ARCHIVE_HEADERS, rows: migratedRows, changed: migratedRows.some((row, index) => row[11] !== trimValue(dataRows[index]?.[11])) };
  }

  if (!isLegacy) {
    throw new Error("Archive sheet headers do not match the expected legacy or current layout.");
  }

  return {
    headers: ARCHIVE_HEADERS,
    changed: true,
    rows: dataRows.map((row) => {
      const hasData = row.some((value) => trimValue(value));
      return [
        ...Array.from({ length: 11 }, (_, index) => trimValue(row[index])),
        hasData ? createId() : "",
        trimValue(row[11]),
        trimValue(row[12]),
        trimValue(row[13]),
      ];
    }),
  };
}

export function promoteStudent(student) {
  const currentIndex = GRADE_ORDER.indexOf(normalizeGrade(student.grade));
  if (currentIndex === -1) return { student, graduate: false };
  if (student.grade === "12") return { student, graduate: true };
  return { student: { ...student, grade: GRADE_ORDER[currentIndex + 1] }, graduate: false };
}

export function csvExportRows(students = []) {
  return [
    STUDENT_HEADERS.slice(0, 11),
    ...students.map((student) => studentToRow(student).slice(0, 11)),
  ];
}

export function schoolYearFromSettingsValues(values = []) {
  const schoolYear = trimValue(values[0]?.[0]);
  if (!schoolYear) throw new Error("Settings!B2 current school year is blank.");
  return schoolYear;
}

export function locateStudentRow(rows = [], studentId = "", startingRowNumber = 2) {
  const cleanId = trimValue(studentId);
  const index = rows.findIndex((row) => rowToStudent(row).studentId === cleanId);
  if (index === -1) return null;
  return { rowNumber: startingRowNumber + index, student: rowToStudent(rows[index]) };
}

export function updateRowByStudentId(rows = [], studentId = "", nextStudent = {}) {
  const located = locateStudentRow(rows, studentId);
  if (!located) throw new Error("Student not found.");
  return rows.map((row) => (rowToStudent(row).studentId === studentId ? studentToRow({ ...nextStudent, studentId }) : row));
}

export function removeRowByStudentId(rows = [], studentId = "") {
  const located = locateStudentRow(rows, studentId);
  if (!located) throw new Error("Student not found.");
  return {
    removed: located.student,
    rows: rows.filter((row) => rowToStudent(row).studentId !== studentId),
  };
}
