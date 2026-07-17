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

export async function handleFormApprovalAction({ token, operation = "preview", notes = "", signerName = "" }) {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("form-approval-action", {
    body: { token, operation, notes, signerName },
  });

  if (error) throw error;
  return data || { ok: true };
}

export async function handleFormShareLink(payload) {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("form-share-link", {
    body: payload,
  });

  if (error) throw error;
  return data || { ok: true };
}
