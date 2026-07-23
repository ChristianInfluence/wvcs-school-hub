import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const gradeSort = {
  PS: 0,
  PK: 1,
  K: 2,
  1: 3,
  2: 4,
  3: 5,
  4: 6,
  5: 7,
  6: 8,
  7: 9,
  8: 10,
  9: 11,
  10: 12,
  11: 13,
  12: 14,
};

function normalizeStudent(row = {}) {
  return {
    studentId: row.student_id,
    grade: row.grade,
    studentFirstName: row.student_first_name,
    studentLastName: row.student_last_name,
    parent1FirstName: row.parent1_first_name || "",
    parent1LastName: row.parent1_last_name || "",
    email1: row.email1 || "",
    phone1: row.phone1 || "",
    parent2FirstName: row.parent2_first_name || "",
    parent2LastName: row.parent2_last_name || "",
    phone2: row.phone2 || "",
    email2: row.email2 || "",
  };
}

function studentToRow(student = {}) {
  return {
    grade: String(student.grade || "").trim(),
    student_first_name: String(student.studentFirstName || "").trim(),
    student_last_name: String(student.studentLastName || "").trim(),
    parent1_first_name: String(student.parent1FirstName || "").trim(),
    parent1_last_name: String(student.parent1LastName || "").trim(),
    email1: String(student.email1 || "").trim(),
    phone1: String(student.phone1 || "").trim(),
    parent2_first_name: String(student.parent2FirstName || "").trim(),
    parent2_last_name: String(student.parent2LastName || "").trim(),
    phone2: String(student.phone2 || "").trim(),
    email2: String(student.email2 || "").trim(),
  };
}

function sortStudents(students) {
  return [...students].sort((a, b) => {
    const gradeCompare = (gradeSort[a.grade] ?? 999) - (gradeSort[b.grade] ?? 999);
    if (gradeCompare) return gradeCompare;
    const last = a.studentLastName.localeCompare(b.studentLastName, undefined, { sensitivity: "base" });
    if (last) return last;
    return a.studentFirstName.localeCompare(b.studentFirstName, undefined, { sensitivity: "base" });
  });
}

function ensureSupabase() {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
}

export async function getStudents({ grade = "all", q = "" } = {}) {
  ensureSupabase();
  let query = supabase
    .from("student_directory")
    .select("*")
    .eq("active", true);

  if (grade && grade !== "all") query = query.eq("grade", grade);

  const { data, error } = await query;
  if (error) throw error;

  const needle = String(q || "").trim().toLowerCase();
  const students = (data || []).map(normalizeStudent);
  const filtered = needle
    ? students.filter((student) =>
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
          .includes(needle)
      )
    : students;
  return sortStudents(filtered);
}

export async function getStudent(studentId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from("student_directory")
    .select("*")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  return data ? normalizeStudent(data) : null;
}

export async function createStudent(student) {
  ensureSupabase();
  const { data, error } = await supabase
    .from("student_directory")
    .insert(studentToRow(student))
    .select("*")
    .single();
  if (error) throw error;
  return normalizeStudent(data);
}

export async function updateStudent(studentId, student) {
  ensureSupabase();
  const { data, error } = await supabase
    .from("student_directory")
    .update(studentToRow(student))
    .eq("student_id", studentId)
    .select("*")
    .single();
  if (error) throw error;
  return normalizeStudent(data);
}

export async function removeStudent(studentId, reason = "") {
  ensureSupabase();
  const { error } = await supabase
    .from("student_directory")
    .update({
      active: false,
      archived_at: new Date().toISOString(),
      archive_reason: String(reason || "").trim(),
    })
    .eq("student_id", studentId);
  if (error) throw error;
  return { removed: true };
}

export const STUDENT_GRADES = ["PS", "PK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
