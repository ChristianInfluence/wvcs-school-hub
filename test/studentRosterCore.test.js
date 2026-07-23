import test from "node:test";
import assert from "node:assert/strict";
import {
  ARCHIVE_HEADERS,
  LEGACY_ARCHIVE_HEADERS,
  csvExportRows,
  archiveStudentRow,
  gradeSortKey,
  hasAdminAccess,
  locateStudentRow,
  migrateArchiveRows,
  promoteStudent,
  removeRowByStudentId,
  rowToStudent,
  schoolYearFromSettingsValues,
  sortStudents,
  studentToRow,
  updateRowByStudentId,
  validateStudent,
} from "../supabase/functions/_shared/studentRosterCore.js";

test("sorts grades in WVCS order", () => {
  const sorted = sortStudents([
    { grade: "10", studentLastName: "A", studentFirstName: "A" },
    { grade: "PK", studentLastName: "A", studentFirstName: "A" },
    { grade: "PS", studentLastName: "A", studentFirstName: "A" },
    { grade: "K", studentLastName: "A", studentFirstName: "A" },
    { grade: "9", studentLastName: "A", studentFirstName: "A" },
    { grade: "12", studentLastName: "A", studentFirstName: "A" },
  ]);
  assert.deepEqual(sorted.map((student) => student.grade), ["PS", "PK", "K", "9", "10", "12"]);
});

test("maps all 12 sheet columns to the student model and back", () => {
  const row = ["3", "Addie", "Marks", "Jordan", "Marks", "j@example.com", "503", "Taylor", "Marks", "971", "t@example.com", "id-123"];
  const student = rowToStudent(row);
  assert.equal(student.studentId, "id-123");
  assert.equal(student.email2, "t@example.com");
  assert.deepEqual(studentToRow(student), row);
});

test("validates required fields and supported grades", () => {
  const invalid = validateStudent({ grade: "college", studentFirstName: "", studentLastName: "Marks", studentId: "id-123" });
  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(" "), /supported grade/);
  assert.match(invalid.errors.join(" "), /first name/);

  const valid = validateStudent({ grade: "K", studentFirstName: "Addie", studentLastName: "Marks", studentId: "id-123" });
  assert.equal(valid.valid, true);
});

test("editing and sorting preserves Student-ID", () => {
  const sorted = sortStudents([
    { grade: "2", studentFirstName: "Zoe", studentLastName: "Zimmer", studentId: "id-z" },
    { grade: "1", studentFirstName: "Addie", studentLastName: "Marks", studentId: "id-a" },
  ]);
  assert.deepEqual(sorted.map((student) => student.studentId), ["id-a", "id-z"]);
});

test("authorization helper rejects non-admin rows", () => {
  assert.equal(hasAdminAccess({ can_use_admin: true }), true);
  assert.equal(hasAdminAccess({ can_use_admin: false }), false);
  assert.equal(hasAdminAccess(null), false);
});

test("remove behavior builds an archive row instead of discarding the record", () => {
  const student = rowToStudent(["4", "Addie", "Marks", "Jordan", "Marks", "j@example.com", "503", "", "", "", "", "id-123"]);
  const archiveRow = archiveStudentRow(student, {
    archiveDate: "2026-07-23T00:00:00.000Z",
    schoolYear: "2026-2027",
    reason: "Moved",
  });
  assert.equal(archiveRow.length, 15);
  assert.equal(archiveRow[11], "id-123");
  assert.deepEqual(archiveRow.slice(12), ["2026-07-23T00:00:00.000Z", "2026-2027", "Moved"]);
});

test("migrates legacy 14-column archive layout to 15 columns", () => {
  let idCounter = 0;
  const result = migrateArchiveRows(
    [
      LEGACY_ARCHIVE_HEADERS,
      ["4", "Addie", "Marks", "Jordan", "Marks", "j@example.com", "503", "", "", "", "", "2026-07-01", "2026-27", "Moved"],
    ],
    () => `archived-${++idCounter}`
  );
  assert.equal(result.changed, true);
  assert.deepEqual(result.headers, ARCHIVE_HEADERS);
  assert.equal(result.rows[0][11], "archived-1");
  assert.deepEqual(result.rows[0].slice(12), ["2026-07-01", "2026-27", "Moved"]);
});

test("archive migration is idempotent after layout is current", () => {
  const currentRows = [
    ARCHIVE_HEADERS,
    ["4", "Addie", "Marks", "Jordan", "Marks", "j@example.com", "503", "", "", "", "", "id-123", "2026-07-01", "2026-27", "Moved"],
  ];
  const result = migrateArchiveRows(currentRows, () => "new-id");
  assert.equal(result.changed, false);
  assert.equal(result.rows[0][11], "id-123");
});

test("school year comes from Settings values", () => {
  assert.equal(schoolYearFromSettingsValues([["2026-27"]]), "2026-27");
  assert.throws(() => schoolYearFromSettingsValues([[""]]), /Settings!B2/);
});

test("exact-row update preserves Student-ID", () => {
  const rows = [
    ["1", "Addie", "Marks", "", "", "", "", "", "", "", "", "id-a"],
    ["2", "Zoe", "Zimmer", "", "", "", "", "", "", "", "", "id-z"],
  ];
  const updated = updateRowByStudentId(rows, "id-z", {
    grade: "3",
    studentFirstName: "Zoey",
    studentLastName: "Zimmer",
  });
  assert.equal(updated[1][0], "3");
  assert.equal(updated[1][1], "Zoey");
  assert.equal(updated[1][11], "id-z");
  assert.deepEqual(updated[0], rows[0]);
});

test("exact-row removal returns archived student and remaining rows", () => {
  const rows = [
    ["1", "Addie", "Marks", "", "", "", "", "", "", "", "", "id-a"],
    ["2", "Zoe", "Zimmer", "", "", "", "", "", "", "", "", "id-z"],
  ];
  const result = removeRowByStudentId(rows, "id-a");
  assert.equal(result.removed.studentId, "id-a");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0][11], "id-z");
});

test("locates student by Student-ID without a permanent row number", () => {
  const rows = [
    ["1", "Addie", "Marks", "", "", "", "", "", "", "", "", "id-a"],
    ["2", "Zoe", "Zimmer", "", "", "", "", "", "", "", "", "id-z"],
  ];
  const located = locateStudentRow(rows, "id-z");
  assert.equal(located.rowNumber, 3);
  assert.equal(located.student.studentFirstName, "Zoe");
});

test("sorting keeps A:L rows together via grade sort keys", () => {
  assert.equal(gradeSortKey("PS"), 0);
  assert.equal(gradeSortKey("PK"), 1);
  assert.equal(gradeSortKey("K"), 2);
  const sorted = sortStudents([
    rowToStudent(["K", "Kid", "Three", "", "", "", "", "", "", "", "", "id-k"]),
    rowToStudent(["PS", "Kid", "One", "", "", "", "", "", "", "", "", "id-ps"]),
    rowToStudent(["PK", "Kid", "Two", "", "", "", "", "", "", "", "", "id-pk"]),
  ]);
  assert.deepEqual(sorted.map(studentToRow).map((row) => row[11]), ["id-ps", "id-pk", "id-k"]);
});

test("promotion supports PS to PK to K and keeps Student-ID", () => {
  const ps = promoteStudent(rowToStudent(["PS", "Little", "One", "", "", "", "", "", "", "", "", "id-ps"]));
  const pk = promoteStudent(ps.student);
  assert.equal(ps.student.grade, "PK");
  assert.equal(pk.student.grade, "K");
  assert.equal(pk.student.studentId, "id-ps");
});

test("promotion moves 12th grade to graduates", () => {
  const result = promoteStudent(rowToStudent(["12", "Senior", "Student", "", "", "", "", "", "", "", "", "id-12"]));
  assert.equal(result.graduate, true);
  assert.equal(result.student.studentId, "id-12");
});

test("CSV export excludes Student-ID", () => {
  const rows = csvExportRows([rowToStudent(["4", "Addie", "Marks", "Jordan", "Marks", "j@example.com", "503", "", "", "", "", "id-123"])]);
  assert.equal(rows[0].length, 11);
  assert.equal(rows[1].length, 11);
  assert.equal(rows[1].includes("id-123"), false);
});

test("documented Apps Script keeps existing menu commands available", async () => {
  const script = await import("node:fs/promises").then((fs) => fs.readFile(new URL("../docs/student-roster-apps-script.gs", import.meta.url), "utf8"));
  [
    "Add Student from Form",
    "Remove Selected Student",
    "Sort Students",
    "Advance to Next School Year",
    "Export Active Roster CSV",
    "Ensure Student IDs",
  ].forEach((label) => assert.match(script, new RegExp(label)));
});
