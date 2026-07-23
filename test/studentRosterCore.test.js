import test from "node:test";
import assert from "node:assert/strict";
import {
  archiveStudentRow,
  hasAdminAccess,
  rowToStudent,
  sortStudents,
  studentToRow,
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
