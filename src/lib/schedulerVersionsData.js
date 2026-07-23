import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const LOCAL_STORE_KEY = "wvcs-master-scheduler-versions";

function loadLocalVersions() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_STORE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalVersions(versions) {
  localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(versions));
}

function mapVersionFromDatabase(row) {
  return {
    id: row.id,
    name: row.name || "Untitled Version",
    savedAt: row.saved_at || row.updated_at || row.created_at,
    data: row.schedule_json || {},
    createdByEmail: row.created_by_email || "",
    updatedByEmail: row.updated_by_email || "",
  };
}

function mapVersionToDatabase(version, updatedByEmail = "") {
  return {
    id: version.id || crypto.randomUUID(),
    name: version.name || "Untitled Version",
    saved_at: version.savedAt || new Date().toISOString(),
    schedule_json: version.data || {},
    updated_by_email: updatedByEmail || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchSchedulerVersions() {
  if (!isSupabaseConfigured) {
    return {
      loaded: false,
      reason: "Supabase is not configured. Showing versions saved on this device.",
      versions: loadLocalVersions(),
    };
  }

  const { data, error } = await supabase
    .from("scheduler_versions")
    .select("*")
    .order("saved_at", { ascending: false });

  if (error) {
    return {
      loaded: false,
      reason: `Shared scheduler versions are not ready yet: ${error.message}. Showing versions saved on this device.`,
      versions: loadLocalVersions(),
    };
  }

  return { loaded: true, versions: (data || []).map(mapVersionFromDatabase) };
}

export async function saveSchedulerVersion(version, updatedByEmail = "") {
  const row = mapVersionToDatabase(version, updatedByEmail);

  if (!isSupabaseConfigured) {
    const existing = loadLocalVersions();
    const localVersion = {
      id: row.id,
      name: row.name,
      savedAt: row.saved_at,
      data: row.schedule_json,
      updatedByEmail,
    };
    saveLocalVersions([localVersion, ...existing.filter((item) => item.id !== row.id)]);
    return { saved: true, version: localVersion, local: true };
  }

  const { data, error } = await supabase
    .from("scheduler_versions")
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
    const existing = loadLocalVersions();
    const localVersion = {
      id: row.id,
      name: row.name,
      savedAt: row.saved_at,
      data: row.schedule_json,
      updatedByEmail,
    };
    saveLocalVersions([localVersion, ...existing.filter((item) => item.id !== row.id)]);
    return { saved: true, version: localVersion, local: true, reason: error.message };
  }

  return { saved: true, version: mapVersionFromDatabase(data) };
}

export async function deleteSchedulerVersion(versionId) {
  if (!isSupabaseConfigured) {
    saveLocalVersions(loadLocalVersions().filter((version) => version.id !== versionId));
    return { deleted: true, local: true };
  }

  const { error } = await supabase
    .from("scheduler_versions")
    .delete()
    .eq("id", versionId);

  if (error) {
    saveLocalVersions(loadLocalVersions().filter((version) => version.id !== versionId));
    return { deleted: true, local: true, reason: error.message };
  }

  return { deleted: true };
}
