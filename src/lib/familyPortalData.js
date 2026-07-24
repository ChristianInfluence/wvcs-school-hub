import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const FOS_SCHOOL_YEAR = "2026-2027";
export const FOS_REQUIRED_HOURS = 50;
export const FOS_BUYOUT_AMOUNT = 500;
export const FOS_HOUR_VALUE = 10;

export function normalizeFosSettings(settings = {}) {
  const liabilityAmount = Number(settings.liabilityAmount ?? settings.fosLiabilityAmount ?? FOS_BUYOUT_AMOUNT);
  const hourValue = Number(settings.hourValue ?? settings.fosHourValue ?? FOS_HOUR_VALUE);
  return {
    liabilityAmount: Number.isFinite(liabilityAmount) ? liabilityAmount : FOS_BUYOUT_AMOUNT,
    hourValue: Number.isFinite(hourValue) && hourValue > 0 ? hourValue : FOS_HOUR_VALUE,
  };
}

export function calculateFosBalance(entries = [], settings = {}) {
  const fosSettings = normalizeFosSettings(settings);
  const approvedHours = entries
    .filter((entry) => entry.status === "Approved" || entry.status === "Adjusted")
    .reduce((total, entry) => total + Number(entry.approvedHours || 0), 0);
  const requiredHours = fosSettings.liabilityAmount / fosSettings.hourValue;
  const remainingHours = Math.max(requiredHours - approvedHours, 0);
  const remainingBalance = Math.max(fosSettings.liabilityAmount - approvedHours * fosSettings.hourValue, 0);
  return { approvedHours, remainingHours, remainingBalance, liabilityAmount: fosSettings.liabilityAmount, hourValue: fosSettings.hourValue, requiredHours };
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

function mapFamilyAccess(row) {
  return {
    familyKey: row.family_key || "",
    familyName: row.family_name || "",
    contactEmails: row.contact_emails || [],
    publicToken: row.public_token || "",
    liabilityAmount: Number(row.fos_liability_amount ?? FOS_BUYOUT_AMOUNT),
    hourValue: Number(row.fos_hour_value ?? FOS_HOUR_VALUE),
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

export async function fetchFamilyPortalAccessRecords() {
  if (!isSupabaseConfigured) return { loaded: false, access: [], reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("family_portal_access")
    .select("family_key,family_name,contact_emails,public_token,fos_liability_amount,fos_hour_value")
    .order("family_name", { ascending: true });

  if (error) throw error;
  return { loaded: true, access: (data || []).map(mapFamilyAccess) };
}

export async function ensureFamilyPortalAccess(family, currentUserEmail = "") {
  if (!isSupabaseConfigured) return { ready: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("ensure-family-portal-access", {
    body: { family, currentUserEmail },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  const access = Array.isArray(data) ? data[0] : data;
  const accessRecord = access?.access || access;
  if (!accessRecord?.public_token) throw new Error("The portal link could not be generated. Please confirm this user has Office & Finance access.");
  return {
    ready: true,
    access: {
      familyKey: accessRecord.family_key,
      familyName: accessRecord.family_name,
      contactEmails: accessRecord.contact_emails || [],
      publicToken: accessRecord.public_token,
      liabilityAmount: Number(accessRecord.fos_liability_amount ?? FOS_BUYOUT_AMOUNT),
      hourValue: Number(accessRecord.fos_hour_value ?? FOS_HOUR_VALUE),
      updatedByEmail: currentUserEmail,
    },
  };
}

export async function updateFamilyFosSettings(familyKey, settings) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("family_portal_access")
    .update({
      fos_liability_amount: Number(settings.liabilityAmount),
      fos_hour_value: Number(settings.hourValue || FOS_HOUR_VALUE),
    })
    .eq("family_key", familyKey)
    .select("family_key,family_name,contact_emails,public_token,fos_liability_amount,fos_hour_value")
    .single();

  if (error) throw error;
  return { saved: true, access: mapFamilyAccess(data) };
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
  const body = typeof token === "object" && token !== null ? token : { token };
  const { data, error } = await supabase.functions.invoke("family-portal-data", {
    body,
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
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

export async function sendFamilyPortalInvite(family, currentUserEmail = "", recipients = []) {
  if (!isSupabaseConfigured) return { sent: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("send-family-portal-invite", {
    body: { family, currentUserEmail, recipients },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || { sent: false };
}
