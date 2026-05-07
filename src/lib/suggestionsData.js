import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

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
    .select("*")
    .single();

  if (error) throw error;
  return { saved: true, suggestion: mapSuggestionFromDatabase(data) };
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
