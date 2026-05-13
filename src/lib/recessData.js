import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

function mapEntryFromDatabase(row) {
  return {
    id: row.id,
    date: row.entry_date,
    studentName: row.student_name,
    teacherName: row.teacher_name,
    recessType: row.recess_type,
    duration: row.duration === "ALL" ? "ALL" : Number(row.duration),
    reason: row.reason || "",
    notes: row.notes || "",
    status: row.status,
    createdAt: row.created_at,
  };
}

function mapEntryToDatabase(entry) {
  return {
    id: entry.id,
    entry_date: entry.date,
    student_name: entry.studentName,
    teacher_name: entry.teacherName,
    recess_type: entry.recessType,
    duration: String(entry.duration),
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
