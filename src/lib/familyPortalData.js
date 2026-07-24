import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const FOS_SCHOOL_YEAR = "2026-2027";
export const FOS_REQUIRED_HOURS = 50;
export const FOS_BUYOUT_AMOUNT = 500;
export const FOS_HOUR_VALUE = 10;

export function calculateFosBalance(entries = []) {
  const approvedHours = entries
    .filter((entry) => entry.status === "Approved" || entry.status === "Adjusted")
    .reduce((total, entry) => total + Number(entry.approvedHours || 0), 0);
  const remainingHours = Math.max(FOS_REQUIRED_HOURS - approvedHours, 0);
  const remainingBalance = Math.max(FOS_BUYOUT_AMOUNT - approvedHours * FOS_HOUR_VALUE, 0);
  return { approvedHours, remainingHours, remainingBalance };
}

function mapFosEntry(row) {
  return {
    id: row.id,
    familyKey: row.family_key || "",
    familyName: row.family_name || "",
    schoolYear: row.school_year || FOS_SCHOOL_YEAR,
    parentName: row.parent_name || "",
    parentEmail: row.parent_email || "",
    activityDate: row.activity_date || "",
    activity: row.activity || "",
    notes: row.notes || "",
    submittedHours: Number(row.submitted_hours || 0),
    approvedHours: Number(row.approved_hours || 0),
    status: row.status || "Pending",
    officeNote: row.office_note || "",
    submittedAt: row.submitted_at || "",
    reviewedAt: row.reviewed_at || "",
    reviewedByEmail: row.reviewed_by_email || "",
  };
}

export async function fetchFosEntries() {
  if (!isSupabaseConfigured) return { loaded: false, entries: [], reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("fos_hour_entries")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) throw error;
  return { loaded: true, entries: (data || []).map(mapFosEntry) };
}

export async function ensureFamilyPortalAccess(family, currentUserEmail = "") {
  if (!isSupabaseConfigured) return { ready: false, reason: "Supabase is not configured." };
  const contactEmails = (family.parents || []).map((parent) => parent.email).filter(Boolean);
  const { data, error } = await supabase.rpc("ensure_family_portal_access", {
    target_family_key: family.familyKey,
    target_family_name: family.familyName,
    target_contact_emails: contactEmails,
  });

  if (error) throw error;
  const access = Array.isArray(data) ? data[0] : data;
  if (!access?.public_token) throw new Error("The portal link could not be generated. Please confirm this user has Office & Finance access.");
  return {
    ready: true,
    access: {
      familyKey: access.family_key,
      familyName: access.family_name,
      contactEmails: access.contact_emails || [],
      publicToken: access.public_token,
      updatedByEmail: currentUserEmail,
    },
  };
}

export async function reviewFosEntry(entryId, review) {
  if (!isSupabaseConfigured) return { reviewed: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("review-fos-hours", {
    body: { entryId, review },
  });
  if (error) throw error;
  return data || { reviewed: false };
}

export async function fetchFamilyPortalData(token) {
  if (!isSupabaseConfigured) return { loaded: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("family-portal-data", {
    body: { token },
  });
  if (error) throw error;
  return data || { loaded: false };
}

export async function submitFosHours(token, entry) {
  if (!isSupabaseConfigured) return { submitted: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("submit-fos-hours", {
    body: { token, entry },
  });
  if (error) throw error;
  return data || { submitted: false };
}
