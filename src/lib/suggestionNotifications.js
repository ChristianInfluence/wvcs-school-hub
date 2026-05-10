import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function sendSuggestionEmail(payload) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-suggestion-email", {
    body: payload,
  });

  if (error) throw error;
  return data || { sent: true };
}
