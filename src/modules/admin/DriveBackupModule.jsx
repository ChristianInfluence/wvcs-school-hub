import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Cloud, Database, FolderTree, RefreshCw, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  DEFAULT_DRIVE_BACKUP_SETTINGS,
  fetchDriveBackupJobs,
  fetchDriveBackupSettings,
  saveDriveBackupSettings,
  testDriveBackupConnection,
} from "../../lib/driveBackupData.js";

function StatusPill({ tone = "slate", children }) {
  const classes = {
    emerald: "border-emerald-400/50 bg-emerald-500/15 text-emerald-100",
    amber: "border-amber-400/50 bg-amber-500/15 text-amber-100",
    rose: "border-rose-400/50 bg-rose-500/15 text-rose-100",
    slate: "border-slate-700 bg-slate-950 text-slate-300",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${classes[tone] || classes.slate}`}>
      {children}
    </span>
  );
}

function formatDate(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function jobTone(status) {
  if (status === "uploaded") return "emerald";
  if (status === "failed") return "rose";
  if (status === "skipped") return "amber";
  return "slate";
}

export default function DriveBackupModule({ currentUserEmail = "" }) {
  const [settings, setSettings] = useState(DEFAULT_DRIVE_BACKUP_SETTINGS);
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState("Loading Drive backup settings...");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const readyChecks = useMemo(
    () => [
      {
        label: "Shared Drive folder",
        complete: Boolean(settings.rootFolderId || settings.rootFolderName),
        detail: settings.rootFolderId
          ? `Folder ID saved: ${settings.rootFolderId}`
          : `Will use folder name: ${settings.rootFolderName || DEFAULT_DRIVE_BACKUP_SETTINGS.rootFolderName}`,
      },
      {
        label: "Service account",
        complete: Boolean(settings.serviceAccountEmail),
        detail: settings.serviceAccountEmail || "Add the service account email after it is created.",
      },
      {
        label: "Server secret",
        complete: false,
        detail: "Add GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON in Supabase function secrets before live uploads.",
      },
    ],
    [settings.rootFolderId, settings.rootFolderName, settings.serviceAccountEmail]
  );

  async function loadDriveBackup() {
    try {
      const [settingsResult, jobsResult] = await Promise.all([
        fetchDriveBackupSettings(),
        fetchDriveBackupJobs(20),
      ]);
      setSettings(settingsResult.settings || DEFAULT_DRIVE_BACKUP_SETTINGS);
      setJobs(jobsResult.jobs || []);
      setStatus(settingsResult.loaded ? "Drive backup settings loaded." : settingsResult.reason);
    } catch (error) {
      setStatus(`Unable to load Drive backup settings: ${error.message}`);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(loadDriveBackup, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function saveSettings() {
    setSaving(true);
    setStatus("Saving Drive backup settings...");
    try {
      const result = await saveDriveBackupSettings(settings, currentUserEmail);
      setSettings(result.settings || settings);
      setStatus(result.saved ? "Drive backup settings saved." : result.reason);
    } catch (error) {
      setStatus(`Unable to save Drive backup settings: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function testConnection() {
    setTesting(true);
    setStatus("Checking Drive backup function...");
    try {
      const result = await testDriveBackupConnection(settings);
      if (result.ok) {
        setStatus(result.ready ? "Drive backup function is ready." : result.message || "Drive backup function is reachable.");
      } else {
        setStatus(result.reason || result.error || "Drive backup function did not report ready.");
      }
    } catch (error) {
      setStatus(`Drive backup test failed: ${error.message}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Drive Backup</div>
          <h1 className="mt-2 text-2xl font-bold text-white">Google Drive Backup Connection</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Prepare automatic backups for signed permission slips and approved form PDFs. This page stores the folder plan and
            queues backup records; Google credentials stay server-side.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={loadDriveBackup}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          <StatusPill tone={settings.enabled ? "emerald" : "amber"}>
            {settings.enabled ? "Enabled" : "Not Enabled"}
          </StatusPill>
        </div>
      </div>

      <div className="mb-5 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200">
        {status}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
            <Cloud size={16} className="text-sky-300" />
            Connection Settings
          </div>

          <div className="grid gap-4">
            <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-3 py-3 text-sm font-semibold text-slate-200">
              <input
                type="checkbox"
                checked={settings.enabled}
                onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })}
                className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
              />
              Turn on automatic Drive backup after server credentials are configured
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Root Folder Name
                <input
                  value={settings.rootFolderName}
                  onChange={(event) => setSettings({ ...settings, rootFolderName: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Root Folder ID
                <input
                  value={settings.rootFolderId}
                  onChange={(event) => setSettings({ ...settings, rootFolderId: event.target.value })}
                  placeholder="Optional, but best for a shared Drive folder"
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
            </div>

            <label className="space-y-1 text-sm font-medium text-slate-200">
              Service Account Email
              <input
                value={settings.serviceAccountEmail}
                onChange={(event) => setSettings({ ...settings, serviceAccountEmail: event.target.value })}
                placeholder="drive-backup@project.iam.gserviceaccount.com"
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
              />
              <span className="block text-xs leading-5 text-slate-500">
                Share the Google Drive root folder with this email as Editor. Do not paste the private key here.
              </span>
            </label>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={testConnection}
                disabled={testing}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-60"
              >
                <ShieldCheck size={16} />
                {testing ? "Testing..." : "Test Connection"}
              </button>
              <button
                type="button"
                onClick={saveSettings}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-60"
              >
                <Save size={16} />
                {saving ? "Saving..." : "Save Drive Settings"}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <CheckCircle2 size={16} className="text-emerald-300" />
              Setup Checklist
            </div>
            <div className="grid gap-2">
              {readyChecks.map((check) => (
                <div key={check.label} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{check.label}</div>
                    <StatusPill tone={check.complete ? "emerald" : "amber"}>{check.complete ? "Ready" : "Needed"}</StatusPill>
                  </div>
                  <div className="mt-2 text-xs leading-5 text-slate-400">{check.detail}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-amber-400/30 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <TriangleAlert size={18} className="mt-0.5 text-amber-200" />
              <p className="text-xs leading-5 text-amber-100/90">
                This is the backup framework. The final live upload step needs the Google service account JSON saved as a Supabase
                function secret so PDFs can be copied server-to-server.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[420px_minmax(0,1fr)]">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <FolderTree size={16} className="text-sky-300" />
            Folder Organization
          </div>
          <div className="space-y-3 text-sm text-slate-300">
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Permission Slips</div>
              <div className="mt-2 break-words font-mono text-xs text-slate-200">
                {settings.rootFolderName || "WVCS Hub Backups"} / Digital Permission Slips / School Year / Trip / Signed PDFs
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Forms</div>
              <div className="mt-2 break-words font-mono text-xs text-slate-200">
                {settings.rootFolderName || "WVCS Hub Backups"} / Forms / Form Name / School Year / Status
              </div>
            </div>
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-2 border-b border-slate-800 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Database size={16} className="text-sky-300" />
                Recent Backup Queue
              </div>
              <div className="mt-1 text-xs text-slate-500">Signed slips and approved form PDFs will appear here before upload.</div>
            </div>
            <StatusPill>{jobs.length} records</StatusPill>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {jobs.length ? (
              jobs.map((job) => (
                <div key={job.id} className="grid gap-3 border-b border-slate-800 px-4 py-3 last:border-b-0 lg:grid-cols-[160px_1fr_120px_130px] lg:items-center">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                    {job.sourceType === "permission_submission" ? "Permission Slip" : "Form"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-white">{job.filename || job.sourceId}</div>
                    <div className="mt-1 truncate text-xs text-slate-500">{(job.targetFolderPath || []).join(" / ")}</div>
                    {job.errorMessage && <div className="mt-1 text-xs text-rose-200">{job.errorMessage}</div>}
                  </div>
                  <StatusPill tone={jobTone(job.status)}>{job.status}</StatusPill>
                  <div className="text-xs text-slate-500">{formatDate(job.createdAt)}</div>
                </div>
              ))
            ) : (
              <div className="p-6 text-sm text-slate-400">No backup records queued yet.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
