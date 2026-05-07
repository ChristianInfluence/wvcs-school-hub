import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const SUPERUSER_EMAIL = "mconniry@wvcs.org";

function mapStaffAccess(row) {
  return {
    email: row.email,
    canUseHub: row.can_use_hub,
    canUseAdmin: row.can_use_admin,
    canUseScheduler: row.can_use_scheduler,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    superuser: row.email === SUPERUSER_EMAIL,
  };
}

function mapStaffAccessToDatabase(access) {
  return {
    email: access.email.toLowerCase(),
    can_use_hub: access.canUseHub !== false,
    can_use_admin: Boolean(access.canUseAdmin),
    can_use_scheduler: Boolean(access.canUseScheduler),
    updated_at: new Date().toISOString(),
  };
}

export async function fetchStaffAccessList() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", staff: [] };
  }

  const { data, error } = await supabase
    .from("staff_access")
    .select("*")
    .order("email", { ascending: true });

  if (error) throw error;
  return { loaded: true, staff: (data || []).map(mapStaffAccess) };
}

export async function saveStaffAccess(access) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("staff_access")
    .upsert(mapStaffAccessToDatabase(access), { onConflict: "email" });

  if (error) throw error;
  return { saved: true };
}

export async function deleteStaffAccess(email) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };
  if (email.toLowerCase() === SUPERUSER_EMAIL) throw new Error("The superuser cannot be deleted.");

  const { error } = await supabase
    .from("staff_access")
    .delete()
    .eq("email", email.toLowerCase());

  if (error) throw error;
  return { saved: true };
}
