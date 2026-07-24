import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const TUITION_INVOICES_STORE_KEY = "wvcs-tuition-invoices-v1";
const INCIDENTAL_INVOICES_STORE_KEY = "wvcs-incidental-invoices-v1";

function loadLocalRecords(storeKey) {
  try {
    return JSON.parse(localStorage.getItem(storeKey) || "[]");
  } catch {
    return [];
  }
}

function saveLocalRecords(storeKey, records) {
  localStorage.setItem(storeKey, JSON.stringify(records));
}

function loadLocalInvoices() {
  return loadLocalRecords(TUITION_INVOICES_STORE_KEY);
}

function saveLocalInvoices(invoices) {
  saveLocalRecords(TUITION_INVOICES_STORE_KEY, invoices);
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

function mapIncidentalInvoiceFromDatabase(row) {
  return {
    id: row.id,
    publicToken: row.public_token || "",
    familyName: row.family_name || "",
    familyKey: row.family_key || row.invoice_json?.familyKey || "",
    studentIds: row.student_ids || row.invoice_json?.studentIds || [],
    status: row.status || "Draft",
    paymentStatus: row.payment_status || "Unpaid",
    invoice: row.invoice_json || {},
    paymentUrl: row.payment_url || "",
    sentAt: row.sent_at || "",
    sentTo: row.sent_to || [],
    paidAt: row.paid_at || "",
    receiptNumber: row.receipt_number || row.invoice_json?.receiptNumber || "",
    paymentHistory: row.payment_history || row.invoice_json?.paymentHistory || [],
    paidInOffice: Boolean(row.paid_in_office || row.invoice_json?.paidInOffice),
    paymentMethod: row.payment_method || row.invoice_json?.paymentMethod || "",
    checkNumber: row.check_number || row.invoice_json?.checkNumber || "",
    voidNote: row.void_note || row.invoice_json?.voidNote || "",
    refundNote: row.refund_note || row.invoice_json?.refundNote || "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIncidentalInvoiceToDatabase(record, updatedByEmail = "") {
  const invoice = record.invoice || record;
  const id = record.id || invoice.id || crypto.randomUUID();
  const publicToken = record.publicToken || invoice.publicToken || crypto.randomUUID().replaceAll("-", "");
  return {
    id,
    public_token: publicToken,
    family_name: invoice.familyName || record.familyName || "",
    family_key: invoice.familyKey || record.familyKey || null,
    student_ids: invoice.studentIds || record.studentIds || [],
    status: record.status || invoice.status || "Draft",
    payment_status: record.paymentStatus || invoice.paymentStatus || "Unpaid",
    invoice_json: { ...invoice, id, publicToken },
    payment_url: record.paymentUrl || invoice.paymentUrl || null,
    sent_at: record.sentAt || invoice.sentAt || null,
    sent_to: record.sentTo || invoice.sentTo || [],
    paid_at: record.paidAt || invoice.paidAt || null,
    receipt_number: record.receiptNumber || invoice.receiptNumber || null,
    payment_history: record.paymentHistory || invoice.paymentHistory || [],
    paid_in_office: Boolean(record.paidInOffice || invoice.paidInOffice),
    payment_method: record.paymentMethod || invoice.paymentMethod || null,
    check_number: record.checkNumber || invoice.checkNumber || null,
    void_note: record.voidNote || invoice.voidNote || null,
    refund_note: record.refundNote || invoice.refundNote || null,
    updated_by_email: updatedByEmail || null,
    updated_at: new Date().toISOString(),
  };
}

function mapFamilyDirectoryRows(rows = []) {
  const families = new Map();

  rows.forEach((row) => {
    const familyKey = row.family_key || row.family_name || row.student_last_name || "Family";
    const family = families.get(familyKey) || {
      familyKey,
      familyName: row.family_name || `${row.student_last_name || "Family"} Family`,
      parents: [],
      students: [],
    };

    [
      { name: [row.parent1_first_name, row.parent1_last_name].filter(Boolean).join(" "), email: row.email1 || "" },
      { name: [row.parent2_first_name, row.parent2_last_name].filter(Boolean).join(" "), email: row.email2 || "" },
    ].forEach((parent) => {
      const emailKey = parent.email.toLowerCase();
      const nameKey = parent.name.toLowerCase();
      if ((parent.email || parent.name) && !family.parents.some((item) => item.email.toLowerCase() === emailKey && item.name.toLowerCase() === nameKey)) {
        family.parents.push(parent);
      }
    });

    family.students.push({
      studentId: row.student_id,
      name: [row.student_first_name, row.student_last_name].filter(Boolean).join(" "),
      grade: row.grade || "",
    });

    families.set(familyKey, family);
  });

  return [...families.values()].sort((a, b) => a.familyName.localeCompare(b.familyName, undefined, { sensitivity: "base" }));
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

export async function fetchIncidentalInvoices() {
  if (!isSupabaseConfigured) {
    return {
      loaded: false,
      reason: "Supabase is not configured. Showing incidental invoices saved on this device.",
      invoices: loadLocalRecords(INCIDENTAL_INVOICES_STORE_KEY),
    };
  }

  const { data, error } = await supabase
    .from("incidental_invoices")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    return {
      loaded: false,
      reason: `Shared incidental invoices are not ready yet: ${error.message}. Showing invoices saved on this device.`,
      invoices: loadLocalRecords(INCIDENTAL_INVOICES_STORE_KEY),
    };
  }
  return { loaded: true, invoices: (data || []).map(mapIncidentalInvoiceFromDatabase) };
}

export async function saveIncidentalInvoice(record, updatedByEmail = "") {
  const row = mapIncidentalInvoiceToDatabase(record, updatedByEmail);
  const now = new Date().toISOString();

  if (!isSupabaseConfigured) {
    const existing = loadLocalRecords(INCIDENTAL_INVOICES_STORE_KEY);
    const invoiceRecord = {
      id: row.id,
      publicToken: row.public_token,
      familyName: row.family_name,
      familyKey: row.family_key || "",
      studentIds: row.student_ids || [],
      status: row.status,
      paymentStatus: row.payment_status,
      invoice: row.invoice_json,
      paymentUrl: row.payment_url || "",
      sentAt: row.sent_at || "",
      sentTo: row.sent_to || [],
      paidAt: row.paid_at || "",
      receiptNumber: row.receipt_number || "",
      paymentHistory: row.payment_history || [],
      paidInOffice: row.paid_in_office || false,
      paymentMethod: row.payment_method || "",
      checkNumber: row.check_number || "",
      voidNote: row.void_note || "",
      refundNote: row.refund_note || "",
      createdAt: existing.find((item) => item.id === row.id)?.createdAt || now,
      updatedAt: now,
    };
    const next = [invoiceRecord, ...existing.filter((item) => item.id !== row.id)];
    saveLocalRecords(INCIDENTAL_INVOICES_STORE_KEY, next);
    return { saved: true, invoice: invoiceRecord, local: true };
  }

  const { data, error } = await supabase
    .from("incidental_invoices")
    .upsert(
      {
        ...row,
        created_by_email: updatedByEmail || null,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();

  if (error) {
    const existing = loadLocalRecords(INCIDENTAL_INVOICES_STORE_KEY);
    const invoiceRecord = {
      id: row.id,
      publicToken: row.public_token,
      familyName: row.family_name,
      familyKey: row.family_key || "",
      studentIds: row.student_ids || [],
      status: row.status,
      paymentStatus: row.payment_status,
      invoice: row.invoice_json,
      paymentUrl: row.payment_url || "",
      sentAt: row.sent_at || "",
      sentTo: row.sent_to || [],
      paidAt: row.paid_at || "",
      receiptNumber: row.receipt_number || "",
      paymentHistory: row.payment_history || [],
      paidInOffice: row.paid_in_office || false,
      paymentMethod: row.payment_method || "",
      checkNumber: row.check_number || "",
      voidNote: row.void_note || "",
      refundNote: row.refund_note || "",
      createdAt: existing.find((item) => item.id === row.id)?.createdAt || now,
      updatedAt: now,
    };
    const next = [invoiceRecord, ...existing.filter((item) => item.id !== row.id)];
    saveLocalRecords(INCIDENTAL_INVOICES_STORE_KEY, next);
    return { saved: true, invoice: invoiceRecord, local: true, reason: error.message };
  }
  return { saved: true, invoice: mapIncidentalInvoiceFromDatabase(data) };
}

export async function deleteIncidentalInvoice(invoiceId) {
  if (!isSupabaseConfigured) {
    saveLocalRecords(
      INCIDENTAL_INVOICES_STORE_KEY,
      loadLocalRecords(INCIDENTAL_INVOICES_STORE_KEY).filter((invoice) => invoice.id !== invoiceId)
    );
    return { deleted: true, local: true };
  }

  const { error } = await supabase
    .from("incidental_invoices")
    .delete()
    .eq("id", invoiceId);

  if (error) {
    saveLocalRecords(
      INCIDENTAL_INVOICES_STORE_KEY,
      loadLocalRecords(INCIDENTAL_INVOICES_STORE_KEY).filter((invoice) => invoice.id !== invoiceId)
    );
    return { deleted: true, local: true, reason: error.message };
  }
  return { deleted: true };
}

export async function fetchIncidentalInvoiceByToken(token) {
  if (!isSupabaseConfigured) {
    const record = loadLocalRecords(INCIDENTAL_INVOICES_STORE_KEY).find((invoice) => invoice.publicToken === token);
    return { loaded: false, found: Boolean(record), invoice: record || null, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("incidental-payment-portal", {
    body: { token },
  });

  if (error) throw error;
  return data || { loaded: true, found: false };
}

export async function createIncidentalCheckoutSession(token) {
  if (!isSupabaseConfigured) {
    return { created: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("create-stripe-checkout", {
    body: { token },
  });

  if (error) throw error;
  return data || { created: false, reason: "Stripe checkout session was not created." };
}

export async function sendIncidentalInvoiceEmail(payload) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-incidental-invoice-email", {
    body: payload,
  });

  if (error) throw error;
  return data || { sent: true };
}

export async function fetchOfficeFamilyDirectory() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", families: [] };
  }

  const { data, error } = await supabase.rpc("get_office_family_directory");
  if (error) throw error;
  return { loaded: true, families: mapFamilyDirectoryRows(data || []) };
}
