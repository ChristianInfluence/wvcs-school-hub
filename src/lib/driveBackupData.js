import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const DEFAULT_DRIVE_BACKUP_SETTINGS = {
  id: "primary",
  enabled: false,
  provider: "google_drive",
  rootFolderId: "",
  rootFolderName: "WVCS Hub Backups",
  serviceAccountEmail: "",
  folderStrategy: {
    permissionSlips: ["Digital Permission Slips", "{schoolYear}", "{eventTitle}", "Signed PDFs"],
    forms: ["Forms", "{templateTitle}", "{schoolYear}", "{status}"],
  },
  connectedAt: "",
  updatedAt: "",
  updatedByEmail: "",
};

const LOCAL_SETTINGS_KEY = "wvcs-drive-backup-settings-v1";
const LOCAL_JOBS_KEY = "wvcs-drive-backup-jobs-v1";

function readLocalSettings() {
  try {
    return { ...DEFAULT_DRIVE_BACKUP_SETTINGS, ...(JSON.parse(localStorage.getItem(LOCAL_SETTINGS_KEY) || "{}")) };
  } catch {
    return DEFAULT_DRIVE_BACKUP_SETTINGS;
  }
}

function writeLocalSettings(settings) {
  localStorage.setItem(LOCAL_SETTINGS_KEY, JSON.stringify(settings));
}

function readLocalJobs() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_JOBS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeLocalJobs(jobs) {
  localStorage.setItem(LOCAL_JOBS_KEY, JSON.stringify(jobs.slice(0, 100)));
}

function mapSettingsFromDatabase(row) {
  if (!row) return DEFAULT_DRIVE_BACKUP_SETTINGS;
  return {
    ...DEFAULT_DRIVE_BACKUP_SETTINGS,
    id: row.id || "primary",
    enabled: Boolean(row.enabled),
    provider: row.provider || "google_drive",
    rootFolderId: row.root_folder_id || "",
    rootFolderName: row.root_folder_name || DEFAULT_DRIVE_BACKUP_SETTINGS.rootFolderName,
    serviceAccountEmail: row.service_account_email || "",
    folderStrategy: row.folder_strategy || DEFAULT_DRIVE_BACKUP_SETTINGS.folderStrategy,
    connectedAt: row.connected_at || "",
    updatedAt: row.updated_at || "",
    updatedByEmail: row.updated_by_email || "",
  };
}

function mapSettingsToDatabase(settings, updatedByEmail = "") {
  return {
    id: "primary",
    enabled: Boolean(settings.enabled),
    provider: "google_drive",
    root_folder_id: String(settings.rootFolderId || "").trim() || null,
    root_folder_name: String(settings.rootFolderName || "").trim() || DEFAULT_DRIVE_BACKUP_SETTINGS.rootFolderName,
    service_account_email: String(settings.serviceAccountEmail || "").trim() || null,
    folder_strategy: settings.folderStrategy || DEFAULT_DRIVE_BACKUP_SETTINGS.folderStrategy,
    connected_at: settings.enabled ? settings.connectedAt || new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    updated_by_email: updatedByEmail || settings.updatedByEmail || null,
  };
}

function mapJobFromDatabase(row) {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceId: row.source_id,
    status: row.status || "pending",
    targetFolderPath: row.target_folder_path || [],
    driveFolderId: row.drive_folder_id || "",
    driveFileId: row.drive_file_id || "",
    driveWebUrl: row.drive_web_url || "",
    filename: row.filename || "",
    errorMessage: row.error_message || "",
    attempts: row.attempts || 0,
    lastAttemptAt: row.last_attempt_at || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
    metadata: row.metadata || {},
  };
}

function mapJobToDatabase(job) {
  return {
    id: job.id || crypto.randomUUID(),
    source_type: job.sourceType,
    source_id: job.sourceId,
    status: job.status || "pending",
    target_folder_path: job.targetFolderPath || [],
    drive_folder_id: job.driveFolderId || null,
    drive_file_id: job.driveFileId || null,
    drive_web_url: job.driveWebUrl || null,
    filename: job.filename || null,
    error_message: job.errorMessage || null,
    attempts: job.attempts || 0,
    last_attempt_at: job.lastAttemptAt || null,
    metadata: job.metadata || {},
    updated_at: new Date().toISOString(),
  };
}

export async function fetchDriveBackupSettings() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", settings: readLocalSettings() };
  }

  const { data, error } = await supabase
    .from("drive_backup_settings")
    .select("*")
    .eq("id", "primary")
    .maybeSingle();
  if (error) {
    return { loaded: false, reason: "Drive backup database tables are not installed yet.", settings: readLocalSettings() };
  }
  return { loaded: true, settings: mapSettingsFromDatabase(data) };
}

export async function saveDriveBackupSettings(settings, updatedByEmail = "") {
  const normalized = mapSettingsFromDatabase(mapSettingsToDatabase(settings, updatedByEmail));
  if (!isSupabaseConfigured) {
    writeLocalSettings(normalized);
    return { saved: false, reason: "Supabase is not configured.", settings: normalized };
  }

  const { data, error } = await supabase
    .from("drive_backup_settings")
    .upsert(mapSettingsToDatabase(settings, updatedByEmail), { onConflict: "id" })
    .select("*")
    .single();
  if (error) {
    writeLocalSettings(normalized);
    return { saved: false, reason: "Saved in this browser. Drive backup database tables are not installed yet.", settings: normalized };
  }
  return { saved: true, settings: mapSettingsFromDatabase(data) };
}

export async function fetchDriveBackupJobs(limit = 25) {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", jobs: readLocalJobs() };
  }

  const { data, error } = await supabase
    .from("drive_backup_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return { loaded: false, reason: "Drive backup database tables are not installed yet.", jobs: readLocalJobs() };
  }
  return { loaded: true, jobs: (data || []).map(mapJobFromDatabase) };
}

export async function queueDriveBackupJob(job) {
  if (!job?.sourceType || !job?.sourceId) return { queued: false, reason: "Missing backup source." };

  const nextJob = {
    id: job.id || crypto.randomUUID(),
    status: "pending",
    createdAt: new Date().toISOString(),
    ...job,
  };

  if (!isSupabaseConfigured) {
    const jobs = [nextJob, ...readLocalJobs().filter((item) => item.id !== nextJob.id)];
    writeLocalJobs(jobs);
    return { queued: false, reason: "Supabase is not configured.", job: nextJob };
  }

  const { data, error } = await supabase
    .from("drive_backup_jobs")
    .upsert(mapJobToDatabase(nextJob), { onConflict: "source_type,source_id,filename" })
    .select("*")
    .single();
  if (error) {
    const jobs = [nextJob, ...readLocalJobs().filter((item) => item.id !== nextJob.id)];
    writeLocalJobs(jobs);
    return { queued: false, reason: "Saved in this browser. Drive backup database tables are not installed yet.", job: nextJob };
  }
  return { queued: true, job: mapJobFromDatabase(data) };
}

export async function testDriveBackupConnection(settings) {
  if (!isSupabaseConfigured) {
    return { ok: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("google-drive-backup", {
    body: { action: "test", settings },
  });
  if (error) throw error;
  return data || { ok: false, reason: "No response from Drive backup function." };
}
