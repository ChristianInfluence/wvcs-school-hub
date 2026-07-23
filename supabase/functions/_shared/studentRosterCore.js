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
