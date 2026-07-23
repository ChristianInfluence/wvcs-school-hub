import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const GRADE_LABELS = {
  PS: "Preschool",
  PK: "Pre-K",
  K: "Kindergarten",
  1: "Grade 1",
  2: "Grade 2",
  3: "Grade 3",
  4: "Grade 4",
  5: "Grade 5",
  6: "Grade 6",
  7: "Grade 7",
  8: "Grade 8",
  9: "Grade 9",
  10: "Grade 10",
  11: "Grade 11",
  12: "Grade 12",
};

function compareStudentsByFirstName(a, b) {
  const displayA = String(a || "").replace(/^([^,]+),\s*(.+)$/, "$2 $1");
  const displayB = String(b || "").replace(/^([^,]+),\s*(.+)$/, "$2 $1");
  return displayA.localeCompare(displayB, undefined, { numeric: true, sensitivity: "base" });
}

function gradeSortValue(gradeLabel) {
  const match = String(gradeLabel || "").match(/\d+/);
  if (gradeLabel === "Preschool") return -2;
  if (gradeLabel === "Pre-K") return -1;
  if (gradeLabel === "Kindergarten") return 0;
  return match ? Number(match[0]) : 999;
}

function mapEntryFromDatabase(row) {
  return {
    id: row.id,
    date: row.entry_date,
    studentGrade: row.student_grade || "",
    studentName: row.student_name,
    teacherName: row.teacher_name,
    recessType: row.recess_type,
    duration: row.duration === "ALL" ? "ALL" : Number(row.duration),
    needsStructuredRecess: row.needs_structured_recess !== false,
    needsWorkTime: Boolean(row.needs_work_time),
    reason: row.reason || "",
    notes: row.notes || "",
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapStudentDirectoryRow(row) {
  const firstName = String(row.student_first_name || "").trim();
  const lastName = String(row.student_last_name || "").trim();
  return {
    grade: GRADE_LABELS[row.grade] || row.grade || "Unlisted",
    studentName: [lastName, firstName].filter(Boolean).join(", "),
  };
}

function mapEntryToDatabase(entry) {
  return {
    id: entry.id,
    entry_date: entry.date,
    student_grade: entry.studentGrade || null,
    student_name: entry.studentName,
    teacher_name: entry.teacherName,
    recess_type: entry.recessType,
    duration: String(entry.duration),
    needs_structured_recess: entry.needsStructuredRecess !== false,
    needs_work_time: Boolean(entry.needsWorkTime),
    reason: entry.reason || null,
    notes: entry.notes || null,
    status: entry.status,
    created_at: entry.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function getAttendanceId(record) {
  return `${record.date}::${record.recessId}::${record.slotId}::${record.grade}::${record.studentName}`;
}

function mapAttendanceFromDatabase(rows) {
  return rows.reduce((attendance, row) => {
    const dateRecords = attendance[row.attendance_date] || {};
    dateRecords[`${row.recess_id}::${row.slot_id}::${row.grade}::${row.student_name}`] = {
      recessId: row.recess_id,
      slotId: row.slot_id,
      grade: row.grade,
      studentName: row.student_name,
      status: row.status || "",
      note: row.note || "",
      updatedAt: row.updated_at,
    };
    attendance[row.attendance_date] = dateRecords;
    return attendance;
  }, {});
}

export async function fetchRecessEntries() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", entries: [] };
  }

  const { data, error } = await supabase
    .from("structured_recess_entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return { loaded: true, entries: (data || []).map(mapEntryFromDatabase) };
}

export async function saveRecessEntry(entry) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("structured_recess_entries")
    .upsert(mapEntryToDatabase(entry), { onConflict: "id" });

  if (error) throw error;
  return { saved: true };
}

export async function updateRecessEntryStatus(entryId, status) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("structured_recess_entries")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", entryId);

  if (error) throw error;
  return { saved: true };
}

export async function deleteRecessEntry(entryId) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("structured_recess_entries")
    .delete()
    .eq("id", entryId);

  if (error) throw error;
  return { saved: true };
}

export async function fetchRecessAttendance() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", attendance: {} };
  }

  const { data, error } = await supabase
    .from("recess_attendance_records")
    .select("*")
    .order("attendance_date", { ascending: false })
    .order("grade", { ascending: true })
    .order("student_name", { ascending: true });

  if (error) throw error;
  return { loaded: true, attendance: mapAttendanceFromDatabase(data || []) };
}

export async function fetchStructuredRecessRoster() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", roster: [] };
  }

  const rpcResult = await supabase.rpc("get_student_directory_basic");
  let data = rpcResult.data;

  if (rpcResult.error) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("student_directory")
      .select("grade, student_first_name, student_last_name")
      .eq("active", true)
      .order("student_last_name", { ascending: true })
      .order("student_first_name", { ascending: true });

    if (fallbackError) {
      throw new Error(
        "Shared roster access is not ready for Structured Recess. Apply the student directory roster database migration."
      );
    }

    data = fallbackData;
  }

  const groupedRoster = (data || []).reduce((groups, row) => {
    const student = mapStudentDirectoryRow(row);
    if (!student.studentName) return groups;
    const group = groups.get(student.grade) || { grade: student.grade, students: [] };
    group.students.push(student.studentName);
    groups.set(student.grade, group);
    return groups;
  }, new Map());

  return {
    loaded: true,
    roster: [...groupedRoster.values()]
      .map((group) => ({
        ...group,
        students: [...new Set(group.students)].sort(compareStudentsByFirstName),
      }))
      .sort((a, b) => gradeSortValue(a.grade) - gradeSortValue(b.grade) || a.grade.localeCompare(b.grade)),
  };
}

export async function saveRecessAttendanceRecord(record) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const id = getAttendanceId(record);
  const { error } = await supabase
    .from("recess_attendance_records")
    .upsert(
      {
        id,
        attendance_date: record.date,
        recess_id: record.recessId,
        slot_id: record.slotId,
        grade: record.grade,
        student_name: record.studentName,
        status: record.status || "",
        note: record.note || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) throw error;
  return { saved: true };
}

export function subscribeToRecessDataChanges(onChange) {
  if (!isSupabaseConfigured) {
    return { subscribed: false, unsubscribe: () => {} };
  }

  const channel = supabase
    .channel(`recess-data-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "recess_attendance_records" },
      (payload) => onChange({ type: "attendance", payload })
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "structured_recess_entries" },
      (payload) => onChange({ type: "entries", payload })
    )
    .subscribe();

  return {
    subscribed: true,
    unsubscribe: () => {
      supabase.removeChannel(channel);
    },
  };
}
