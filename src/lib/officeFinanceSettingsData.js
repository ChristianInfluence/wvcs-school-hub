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
