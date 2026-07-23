import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const TUITION_INVOICES_STORE_KEY = "wvcs-tuition-invoices-v1";

function loadLocalInvoices() {
  try {
    return JSON.parse(localStorage.getItem(TUITION_INVOICES_STORE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalInvoices(invoices) {
  localStorage.setItem(TUITION_INVOICES_STORE_KEY, JSON.stringify(invoices));
}

function mapInvoiceFromDatabase(row) {
  return {
    id: row.id,
    familyName: row.family_name || "",
    schoolYear: row.school_year || "",
    status: row.status || "Draft",
    invoice: row.invoice_json || {},
    sentAt: row.sent_at || "",
    sentTo: row.sent_to || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapInvoiceToDatabase(record, updatedByEmail = "") {
  const invoice = record.invoice || record;
  return {
    id: record.id || invoice.id || crypto.randomUUID(),
    family_name: invoice.familyName || record.familyName || "",
    school_year: invoice.schoolYear || record.schoolYear || "",
    status: record.status || invoice.status || "Draft",
    invoice_json: invoice,
    sent_at: record.sentAt || null,
    sent_to: record.sentTo || [],
    updated_by_email: updatedByEmail || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchTuitionInvoices() {
  if (!isSupabaseConfigured) {
    return {
      loaded: false,
      reason: "Supabase is not configured. Showing invoices saved on this device.",
      invoices: loadLocalInvoices(),
    };
  }

  const { data, error } = await supabase
    .from("tuition_invoices")
    .select("*")
    .order("school_year", { ascending: false })
    .order("family_name", { ascending: true });

  if (error) throw error;
  return { loaded: true, invoices: (data || []).map(mapInvoiceFromDatabase) };
}

export async function saveTuitionInvoice(record, updatedByEmail = "") {
  const row = mapInvoiceToDatabase(record, updatedByEmail);
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const existing = loadLocalInvoices();
    const invoiceRecord = {
      id: row.id,
      familyName: row.family_name,
      schoolYear: row.school_year,
      status: row.status,
      invoice: { ...row.invoice_json, id: row.id },
      sentAt: row.sent_at || "",
      sentTo: row.sent_to || [],
      createdAt: existing.find((item) => item.id === row.id)?.createdAt || now,
      updatedAt: now,
    };
    const next = [invoiceRecord, ...existing.filter((item) => item.id !== row.id)];
    saveLocalInvoices(next);
    return { saved: true, invoice: invoiceRecord, local: true };
  }

  const { data, error } = await supabase
    .from("tuition_invoices")
    .upsert(
      {
        ...row,
        invoice_json: { ...row.invoice_json, id: row.id },
        created_by_email: updatedByEmail || null,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) throw error;
  return { saved: true, invoice: mapInvoiceFromDatabase(data) };
}

export async function deleteTuitionInvoice(invoiceId) {
  if (!isSupabaseConfigured) {
    saveLocalInvoices(loadLocalInvoices().filter((invoice) => invoice.id !== invoiceId));
    return { deleted: true, local: true };
  }

  const { error } = await supabase
    .from("tuition_invoices")
    .delete()
    .eq("id", invoiceId);

  if (error) throw error;
  return { deleted: true };
}

export async function sendTuitionInvoiceEmail(payload) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-tuition-invoice-email", {
    body: payload,
  });

  if (error) throw error;
  return data || { sent: true };
}
