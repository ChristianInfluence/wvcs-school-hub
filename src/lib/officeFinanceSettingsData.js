import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const DEFAULT_FAMILY_PORTAL_SETTINGS = {
  announcement: {
    enabled: false,
    title: "Family Portal Announcement",
    message: "",
  },
  help: {
    email: "office@wvcs.org",
    phone: "503-393-5236",
    message: "For help accessing your family portal, please contact the WVCS office.",
  },
};

export const DEFAULT_OFFICE_EMAIL_SETTINGS = {
  senderDisplayName: "WVCS School Hub",
  desiredSenderEmail: "",
  financeReplyToEmail: "office@wvcs.org",
  defaultReplyToEmail: "office@wvcs.org",
  bccArchiveEmail: "",
  setupNote: "Changing the actual sending mailbox requires reconnecting the Google account and updating the Gmail sender secret.",
};

export function normalizeFamilyPortalSettings(settings = {}) {
  const announcement = settings.announcement || {};
  const help = settings.help || {};
  return {
    announcement: {
      enabled: Boolean(announcement.enabled),
      title: announcement.title || DEFAULT_FAMILY_PORTAL_SETTINGS.announcement.title,
      message: announcement.message || "",
    },
    help: {
      email: help.email || DEFAULT_FAMILY_PORTAL_SETTINGS.help.email,
      phone: help.phone || DEFAULT_FAMILY_PORTAL_SETTINGS.help.phone,
      message: help.message || DEFAULT_FAMILY_PORTAL_SETTINGS.help.message,
    },
  };
}

export function normalizeOfficeEmailSettings(settings = {}) {
  return {
    senderDisplayName: settings.senderDisplayName || DEFAULT_OFFICE_EMAIL_SETTINGS.senderDisplayName,
    desiredSenderEmail: settings.desiredSenderEmail || "",
    financeReplyToEmail: settings.financeReplyToEmail || settings.defaultReplyToEmail || DEFAULT_OFFICE_EMAIL_SETTINGS.financeReplyToEmail,
    defaultReplyToEmail: settings.defaultReplyToEmail || DEFAULT_OFFICE_EMAIL_SETTINGS.defaultReplyToEmail,
    bccArchiveEmail: settings.bccArchiveEmail || "",
    setupNote: settings.setupNote || DEFAULT_OFFICE_EMAIL_SETTINGS.setupNote,
  };
}

function normalizeFosAdjustmentRecord(record = {}) {
  return {
    fullTimeStaff: Boolean(record.fullTimeStaff),
    partTimeStaff: Boolean(record.partTimeStaff),
    partTimePercent: Math.min(Math.max(Number(record.partTimePercent || 0), 0), 100),
    singleParentHousehold: Boolean(record.singleParentHousehold),
  };
}

export function normalizeFosAdjustments(settings = {}) {
  const families = settings.families || {};
  return {
    families: Object.fromEntries(
      Object.entries(families).map(([familyKey, record]) => [familyKey, normalizeFosAdjustmentRecord(record)])
    ),
  };
}

export async function fetchFamilyPortalSettings() {
  if (!isSupabaseConfigured) return { loaded: false, settings: DEFAULT_FAMILY_PORTAL_SETTINGS, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .select("settings,updated_by_email,updated_at")
    .eq("id", "family_portal")
    .maybeSingle();

  if (error) return { loaded: false, settings: DEFAULT_FAMILY_PORTAL_SETTINGS, reason: "Family portal settings table is not installed yet." };
  return {
    loaded: true,
    settings: normalizeFamilyPortalSettings(data?.settings || DEFAULT_FAMILY_PORTAL_SETTINGS),
    updatedByEmail: data?.updated_by_email || "",
    updatedAt: data?.updated_at || "",
  };
}

export async function fetchOfficeEmailSettings() {
  if (!isSupabaseConfigured) return { loaded: false, settings: DEFAULT_OFFICE_EMAIL_SETTINGS, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .select("settings,updated_by_email,updated_at")
    .eq("id", "email_settings")
    .maybeSingle();

  if (error) return { loaded: false, settings: DEFAULT_OFFICE_EMAIL_SETTINGS, reason: "Email settings are not available yet." };
  return {
    loaded: true,
    settings: normalizeOfficeEmailSettings(data?.settings || DEFAULT_OFFICE_EMAIL_SETTINGS),
    updatedByEmail: data?.updated_by_email || "",
    updatedAt: data?.updated_at || "",
  };
}

export async function fetchEmailAuditLog() {
  if (!isSupabaseConfigured) return { loaded: false, entries: [], reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .select("settings,updated_at")
    .eq("id", "email_audit")
    .maybeSingle();

  if (error) return { loaded: false, entries: [], reason: "Email audit is not available yet." };
  return {
    loaded: true,
    entries: Array.isArray(data?.settings?.entries) ? data.settings.entries : [],
    updatedAt: data?.updated_at || "",
  };
}

export async function backfillEmailAuditLog() {
  if (!isSupabaseConfigured) return { backfilled: false, reason: "Supabase is not configured." };

  const { data, error } = await supabase.functions.invoke("backfill-email-audit", { body: {} });
  if (error) throw error;
  return data || { backfilled: true };
}

export async function fetchFosAdjustmentSettings() {
  if (!isSupabaseConfigured) return { loaded: false, settings: { families: {} }, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .select("settings,updated_by_email,updated_at")
    .eq("id", "fos_adjustments")
    .maybeSingle();

  if (error) return { loaded: false, settings: { families: {} }, reason: "FOS adjustment settings are not available yet." };
  return {
    loaded: true,
    settings: normalizeFosAdjustments(data?.settings || { families: {} }),
    updatedByEmail: data?.updated_by_email || "",
    updatedAt: data?.updated_at || "",
  };
}

export async function saveFosAdjustmentSettings(settings, updatedByEmail = "") {
  const normalized = normalizeFosAdjustments(settings);
  if (!isSupabaseConfigured) return { saved: false, settings: normalized, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .upsert(
      {
        id: "fos_adjustments",
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
    settings: normalizeFosAdjustments(data?.settings || normalized),
    updatedByEmail: data?.updated_by_email || "",
    updatedAt: data?.updated_at || "",
  };
}

export async function saveFamilyPortalSettings(settings, updatedByEmail = "") {
  const normalized = normalizeFamilyPortalSettings(settings);
  if (!isSupabaseConfigured) return { saved: false, settings: normalized, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .upsert(
      {
        id: "family_portal",
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
    settings: normalizeFamilyPortalSettings(data?.settings || normalized),
    updatedByEmail: data?.updated_by_email || "",
    updatedAt: data?.updated_at || "",
  };
}

export async function saveOfficeEmailSettings(settings, updatedByEmail = "") {
  const normalized = normalizeOfficeEmailSettings(settings);
  if (!isSupabaseConfigured) return { saved: false, settings: normalized, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("office_finance_settings")
    .upsert(
      {
        id: "email_settings",
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
    settings: normalizeOfficeEmailSettings(data?.settings || normalized),
    updatedByEmail: data?.updated_by_email || "",
    updatedAt: data?.updated_at || "",
  };
}
