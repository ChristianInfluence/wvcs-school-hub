import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const SUPERUSER_EMAIL = "mconniry@wvcs.org";

function mapStaffAccess(row) {
  const email = row.email?.toLowerCase() || "";
  return {
    email,
    canUseHub: row.can_use_hub,
    canUseAdmin: row.can_use_admin,
    canUseScheduler: row.can_use_scheduler,
    canUseDigitalSlips: row.can_use_digital_slips,
    canUseOfficePayroll: row.can_use_office_payroll,
    canManageUsers: email === SUPERUSER_EMAIL || Boolean(row.can_manage_users),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    superuser: email === SUPERUSER_EMAIL || Boolean(row.can_manage_users),
    protectedSuperuser: email === SUPERUSER_EMAIL,
  };
}

function mapStaffAccessToDatabase(access) {
  const row = {
    email: access.email.toLowerCase(),
    can_use_hub: access.canUseHub !== false,
    can_use_admin: Boolean(access.canUseAdmin),
    can_use_scheduler: Boolean(access.canUseScheduler),
    can_use_digital_slips: Boolean(access.canUseDigitalSlips),
    updated_at: new Date().toISOString(),
  };
  if ("canUseOfficePayroll" in access) {
    row.can_use_office_payroll = Boolean(access.canUseOfficePayroll);
  }
  if ("canManageUsers" in access) {
    row.can_manage_users = access.email.toLowerCase() === SUPERUSER_EMAIL || Boolean(access.canManageUsers);
  }
  return row;
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

  const row = mapStaffAccessToDatabase(access);
  const { error } = await supabase
    .from("staff_access")
    .upsert(row, { onConflict: "email" });

  if (error && /can_use_office_payroll|can_manage_users/i.test(error.message || "")) {
    const legacyRow = { ...row };
    delete legacyRow.can_use_office_payroll;
    delete legacyRow.can_manage_users;
    const { error: legacyError } = await supabase
      .from("staff_access")
      .upsert(legacyRow, { onConflict: "email" });
    if (legacyError) throw legacyError;
    return { saved: true, legacy: true };
  }

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
