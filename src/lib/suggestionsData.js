import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const DEFAULT_SUPPORT_REQUEST_SETTINGS = {
  itRecipients: [],
  maintenanceRecipients: [],
  facilitiesRecipients: [],
  suppliesRecipients: [],
};

export const SUPPORT_REQUEST_CATEGORIES = ["IT Support", "Maintenance", "Facilities", "Supplies", "Other"];

function mapSuggestionFromDatabase(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    body: row.body,
    submitterEmail: row.submitter_email || "",
    anonymous: row.anonymous,
    status: row.status,
    adminResponse: row.admin_response || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSuggestionToDatabase(suggestion) {
  return {
    id: suggestion.id,
    title: suggestion.title,
    category: suggestion.category,
    body: suggestion.body,
    submitter_email: suggestion.submitterEmail || null,
    anonymous: Boolean(suggestion.anonymous),
    status: suggestion.status || "new",
    admin_response: suggestion.adminResponse || null,
    updated_at: new Date().toISOString(),
  };
}

export function parseEmailList(value) {
  return String(value || "")
    .split(/[,\n;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeSupportRequestSettings(settings = {}) {
  return {
    itRecipients: Array.isArray(settings.itRecipients) ? settings.itRecipients : parseEmailList(settings.itRecipients),
    maintenanceRecipients: Array.isArray(settings.maintenanceRecipients) ? settings.maintenanceRecipients : parseEmailList(settings.maintenanceRecipients),
    facilitiesRecipients: Array.isArray(settings.facilitiesRecipients) ? settings.facilitiesRecipients : parseEmailList(settings.facilitiesRecipients),
    suppliesRecipients: Array.isArray(settings.suppliesRecipients) ? settings.suppliesRecipients : parseEmailList(settings.suppliesRecipients),
  };
}

export function getSupportRecipientsForCategory(settings = DEFAULT_SUPPORT_REQUEST_SETTINGS, category = "") {
  const normalized = normalizeSupportRequestSettings(settings);
  if (category === "IT Support") return normalized.itRecipients;
  if (category === "Maintenance") return normalized.maintenanceRecipients;
  if (category === "Facilities") return normalized.facilitiesRecipients;
  if (category === "Supplies") return normalized.suppliesRecipients;
  return normalized.itRecipients;
}

export async function fetchSuggestions() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", suggestions: [] };
  }

  const { data, error } = await supabase
    .from("staff_suggestions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return { loaded: true, suggestions: (data || []).map(mapSuggestionFromDatabase) };
}

export async function fetchSupportRequestSettings() {
  if (!isSupabaseConfigured) return { loaded: false, settings: DEFAULT_SUPPORT_REQUEST_SETTINGS, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .select("settings,updated_by_email,updated_at")
    .eq("id", "support_requests")
    .maybeSingle();

  if (error) return { loaded: false, settings: DEFAULT_SUPPORT_REQUEST_SETTINGS, reason: "Support request settings are not available yet." };
  return {
    loaded: true,
    settings: normalizeSupportRequestSettings(data?.settings || DEFAULT_SUPPORT_REQUEST_SETTINGS),
    updatedByEmail: data?.updated_by_email || "",
    updatedAt: data?.updated_at || "",
  };
}

export async function saveSupportRequestSettings(settings, updatedByEmail = "") {
  const normalized = normalizeSupportRequestSettings(settings);
  if (!isSupabaseConfigured) return { saved: false, settings: normalized, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .upsert(
      {
        id: "support_requests",
        settings: normalized,
        updated_by_email: updatedByEmail || null,
      },
      { onConflict: "id" }
    )
    .select("settings,updated_by_email,updated_at")
    .single();

  if (error) throw error;
  return {
    saved: true,
    settings: normalizeSupportRequestSettings(data?.settings || normalized),
    updatedByEmail: data?.updated_by_email || "",
    updatedAt: data?.updated_at || "",
  };
}

export async function saveSuggestion(suggestion) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("staff_suggestions")
    .upsert(mapSuggestionToDatabase(suggestion), { onConflict: "id" })
    .select("*")
    .single();

  if (error) throw error;
  return { saved: true, suggestion: mapSuggestionFromDatabase(data) };
}

export async function submitSupportRequest(suggestion) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { data, error } = await supabase.functions.invoke("support-request", {
    body: { action: "create", request: suggestion },
  });

  if (error) throw error;
  if (!data?.saved) return { saved: false, reason: data?.reason || data?.error || "Support request was not saved." };
  return { saved: true, suggestion: mapSuggestionFromDatabase(data.suggestion), notified: data.notified || [] };
}

export async function updateSuggestionStatus(suggestionId, patch) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const update = {
    status: patch.status,
    admin_response: patch.adminResponse || null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("staff_suggestions")
    .update(update)
    .eq("id", suggestionId)
    .select("*");

  if (error) throw error;
  const savedRow = Array.isArray(data) ? data[0] : data;
  if (!savedRow) throw new Error("Support request was not found or you do not have permission to update it.");
  return { saved: true, suggestion: mapSuggestionFromDatabase(savedRow) };
}

export async function deleteSuggestion(suggestionId) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("staff_suggestions")
    .delete()
    .eq("id", suggestionId);

  if (error) throw error;
  return { saved: true };
}
