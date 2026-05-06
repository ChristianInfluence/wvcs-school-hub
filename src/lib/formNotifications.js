import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export async function sendFormNotification(payload) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-form-notification", {
    body: payload,
  });

  if (error) throw error;
  return data || { sent: true };
}

