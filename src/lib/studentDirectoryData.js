import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

async function invokeStudentDirectory(action, payload = {}) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("admin-students", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message || "Student Directory request failed.");
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getStudents({ grade = "all", q = "" } = {}) {
  const data = await invokeStudentDirectory("list", { grade, q });
  return data.students || [];
}

export async function getStudent(studentId) {
  const data = await invokeStudentDirectory("get", { studentId });
  return data.student;
}

export async function createStudent(student) {
  const data = await invokeStudentDirectory("create", { student });
  return data.student;
}

export async function updateStudent(studentId, student) {
  const data = await invokeStudentDirectory("update", { studentId, student });
  return data.student;
}

export async function removeStudent(studentId, reason = "") {
  return invokeStudentDirectory("remove", { studentId, reason });
}

export const STUDENT_GRADES = ["PS", "PK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
