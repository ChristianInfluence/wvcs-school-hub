import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const TABLE_NAME = "substitute_absences";

function mapAbsenceFromDatabase(row) {
  return {
    id: row.id,
    staffName: row.staff_name,
    absenceDate: row.absence_date,
    periods: row.periods || [],
    notes: row.notes || "",
    coverage: row.coverage || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAbsenceToDatabase(absence) {
  return {
    id: absence.id,
    staff_name: absence.staffName,
    absence_date: absence.absenceDate,
    periods: absence.periods || [],
    notes: absence.notes || null,
    coverage: absence.coverage || [],
    created_at: absence.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export async function fetchSubstituteAbsences() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", absences: [] };
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("*")
    .order("absence_date", { ascending: true })
    .order("staff_name", { ascending: true });

  if (error) throw error;
  return { loaded: true, absences: (data || []).map(mapAbsenceFromDatabase) };
}

export async function saveSubstituteAbsence(absence) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from(TABLE_NAME)
    .upsert(mapAbsenceToDatabase(absence), { onConflict: "id" });

  if (error) throw error;
  return { saved: true };
}

export async function deleteSubstituteAbsence(absenceId) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq("id", absenceId);

  if (error) throw error;
  return { saved: true };
}
