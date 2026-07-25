import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const FOS_SCHOOL_YEAR = "2026-2027";
export const FOS_REQUIRED_HOURS = 50;
export const FOS_BUYOUT_AMOUNT = 500;
export const FOS_HOUR_VALUE = 10;
export const DEFAULT_FOS_REMINDER_TEMPLATE = {
  id: "reminder",
  subject: "WVCS FOS Balance Reminder: {familyName}",
  heading: "FOS Balance Reminder",
  body: `Hello {familyName},

This is a reminder that your current FOS amount owed is {amountOwed}.

You currently have {approvedHours} approved volunteer hours and {remainingHours} hours remaining.

If you have completed volunteer hours that have not yet been reported, please log into your WVCS Family Portal and submit them for office review.

Family Portal: {portalLoginUrl}`,
  schedule: {
    enabled: false,
    frequency: "monthly",
    dayOfMonth: 1,
    onlyWithBalance: true,
    skipRecentlyRemindedDays: 14,
  },
  updatedAt: "",
  updatedByEmail: "",
};

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
    lastParentLoginAt: row.last_parent_login_at || "",
    lastParentLoginEmail: row.last_parent_login_email || "",
    lastFosReminderSentAt: row.last_fos_reminder_sent_at || "",
    lastFosReminderSentByEmail: row.last_fos_reminder_sent_by_email || "",
  };
}

function mapFosAuditEvent(row) {
  return {
    id: row.id,
    eventType: row.event_type || "",
    familyKey: row.family_key || "",
    familyName: row.family_name || "",
    actorEmail: row.actor_email || "",
    recipientEmails: row.recipient_emails || [],
    metadata: row.metadata || {},
    createdAt: row.created_at || "",
  };
}

function mapFosReminderTemplate(row) {
  if (!row) return DEFAULT_FOS_REMINDER_TEMPLATE;
  return {
    ...DEFAULT_FOS_REMINDER_TEMPLATE,
    id: row.id || "reminder",
    subject: row.subject || DEFAULT_FOS_REMINDER_TEMPLATE.subject,
    heading: row.heading || DEFAULT_FOS_REMINDER_TEMPLATE.heading,
    body: row.body || DEFAULT_FOS_REMINDER_TEMPLATE.body,
    schedule: { ...DEFAULT_FOS_REMINDER_TEMPLATE.schedule, ...(row.reminder_schedule || {}) },
    updatedAt: row.updated_at || "",
    updatedByEmail: row.updated_by_email || "",
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
    .select("family_key,family_name,contact_emails,public_token,fos_liability_amount,fos_hour_value,last_parent_login_at,last_parent_login_email,last_fos_reminder_sent_at,last_fos_reminder_sent_by_email")
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
      lastParentLoginAt: accessRecord.last_parent_login_at || "",
      lastParentLoginEmail: accessRecord.last_parent_login_email || "",
      lastFosReminderSentAt: accessRecord.last_fos_reminder_sent_at || "",
      lastFosReminderSentByEmail: accessRecord.last_fos_reminder_sent_by_email || "",
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
    .select("family_key,family_name,contact_emails,public_token,fos_liability_amount,fos_hour_value,last_parent_login_at,last_parent_login_email,last_fos_reminder_sent_at,last_fos_reminder_sent_by_email")
    .single();

  if (error) throw error;
  return { saved: true, access: mapFamilyAccess(data) };
}

export async function fetchFosAuditEvents(limit = 80) {
  if (!isSupabaseConfigured) return { loaded: false, events: [], reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("fos_audit_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { loaded: false, events: [], reason: "FOS audit table is not installed yet." };
  return { loaded: true, events: (data || []).map(mapFosAuditEvent) };
}

export async function fetchFosReminderTemplate() {
  if (!isSupabaseConfigured) return { loaded: false, template: DEFAULT_FOS_REMINDER_TEMPLATE, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("fos_email_templates")
    .select("*")
    .eq("id", "reminder")
    .maybeSingle();
  if (error) return { loaded: false, template: DEFAULT_FOS_REMINDER_TEMPLATE, reason: "FOS reminder template table is not installed yet." };
  return { loaded: true, template: mapFosReminderTemplate(data) };
}

export async function saveFosReminderTemplate(template, updatedByEmail = "") {
  const schedule = {
    ...DEFAULT_FOS_REMINDER_TEMPLATE.schedule,
    ...(template.schedule || {}),
    dayOfMonth: Math.min(Math.max(Number(template.schedule?.dayOfMonth || 1), 1), 28),
    skipRecentlyRemindedDays: Math.max(Number(template.schedule?.skipRecentlyRemindedDays || 14), 0),
    enabled: Boolean(template.schedule?.enabled),
    onlyWithBalance: template.schedule?.onlyWithBalance !== false,
  };
  const normalized = {
    ...DEFAULT_FOS_REMINDER_TEMPLATE,
    ...template,
    id: "reminder",
    schedule,
  };
  if (!isSupabaseConfigured) return { saved: false, template: normalized, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("fos_email_templates")
    .upsert(
      {
        id: "reminder",
        subject: normalized.subject,
        heading: normalized.heading,
        body: normalized.body,
        reminder_schedule: normalized.schedule || DEFAULT_FOS_REMINDER_TEMPLATE.schedule,
        updated_by_email: updatedByEmail || null,
      },
      { onConflict: "id" }
    )
    .select("*")
    .single();
  if (error) throw error;
  return { saved: true, template: mapFosReminderTemplate(data) };
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

export async function submitLunchOrders(orders) {
  if (!isSupabaseConfigured) return { submitted: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("submit-lunch-order", {
    body: { orders },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || { submitted: false };
}

export async function updateLunchMenuOrder({ menuId, studentId, orders }) {
  if (!isSupabaseConfigured) return { updated: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("update-family-lunch-order", {
    body: { menuId, studentId, orders },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || { updated: false };
}

export async function createLunchCheckout(amount) {
  if (!isSupabaseConfigured) return { created: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("create-lunch-checkout", {
    body: { amount },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || { created: false };
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

export async function sendFamilyLoginLink(email) {
  if (!isSupabaseConfigured) return { sent: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("send-family-login-link", {
    body: { email },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || { sent: false };
}

export async function sendFamilyFosReminder(familyKey, recipients = []) {
  if (!isSupabaseConfigured) return { sent: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("send-family-fos-reminder", {
    body: Array.isArray(familyKey) ? { familyKeys: familyKey, recipientsByFamily: recipients } : { familyKey, recipients },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || { sent: false };
}
