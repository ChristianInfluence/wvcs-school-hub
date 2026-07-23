import { useEffect, useState } from "react";
import { CheckCircle2, Cloud, Database, Mail, Plus, ServerCog, Settings, ShieldCheck, Trash2, TriangleAlert, Users } from "lucide-react";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";
import DriveBackupModule from "./DriveBackupModule.jsx";
import {
  deleteStaffAccess,
  fetchStaffAccessList,
  saveStaffAccess,
  SUPERUSER_EMAIL,
} from "../../lib/staffAccessData.js";

const requiredSecrets = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
];

function StaffAccessManager() {
  const [staff, setStaff] = useState([]);
  const [draft, setDraft] = useState({
    email: "",
    canUseHub: true,
    canUseAdmin: false,
    canUseScheduler: false,
    canUseDigitalSlips: false,
    canUseOfficePayroll: false,
    canManageUsers: false,
  });
  const [status, setStatus] = useState("Loading authorized users...");
  const [pendingDelete, setPendingDelete] = useState(null);
  const [savingEmail, setSavingEmail] = useState("");

  async function loadStaff() {
    try {
      const result = await fetchStaffAccessList();
      if (!result.loaded) {
        setStatus(result.reason);
        return;
      }
      setStaff(result.staff);
      setStatus("Authorized users loaded.");
    } catch (error) {
      setStatus(`Unable to load authorized users: ${error.message}`);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(loadStaff, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  async function addUser() {
    const email = draft.email.trim().toLowerCase();
    if (!email || !email.endsWith("@wvcs.org")) {
      setStatus("Enter a valid @wvcs.org email address.");
      return;
    }

    try {
      await saveStaffAccess({
        email,
        canUseHub: draft.canUseHub,
        canUseAdmin: draft.canUseAdmin,
        canUseScheduler: draft.canUseScheduler,
        canUseDigitalSlips: draft.canUseDigitalSlips,
        canUseOfficePayroll: draft.canUseOfficePayroll,
        canManageUsers: draft.canManageUsers,
      });
      setDraft({
        email: "",
        canUseHub: true,
        canUseAdmin: false,
        canUseScheduler: false,
        canUseDigitalSlips: false,
        canUseOfficePayroll: false,
        canManageUsers: false,
      });
      setStatus(`${email} added.`);
      await loadStaff();
    } catch (error) {
      setStatus(`Unable to add user: ${error.message}`);
    }
  }

  async function updateUserAccess(user, updates) {
    const nextUser = { ...user, ...updates };
    setSavingEmail(user.email);
    setStaff((current) => current.map((staffUser) => (staffUser.email === user.email ? nextUser : staffUser)));
    try {
      await saveStaffAccess(nextUser);
      setStatus(`${user.email} access updated.`);
      await loadStaff();
    } catch (error) {
      setStatus(`Unable to update ${user.email}: ${error.message}`);
      await loadStaff();
    } finally {
      setSavingEmail("");
    }
  }

  async function removeUser(email) {
    try {
      await deleteStaffAccess(email);
      setPendingDelete(null);
      setStatus(`${email} removed.`);
      await loadStaff();
    } catch (error) {
      setStatus(`Unable to remove user: ${error.message}`);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck size={16} className="text-sky-300" />
            Authorized Hub Users
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Only superusers can add people or change access. {SUPERUSER_EMAIL} is the protected root superuser and can grant superuser access to others.
          </p>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
          {status}
        </div>
      </div>

      <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_135px_105px_120px_140px_160px_140px_auto] xl:items-end">
        <label className="space-y-1 text-sm font-medium text-slate-200">
          WVCS Email
          <input
            type="email"
            value={draft.email}
            onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            placeholder="staff@wvcs.org"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
          />
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
          <input
            type="checkbox"
            checked={draft.canUseHub}
            onChange={(event) => setDraft({ ...draft, canUseHub: event.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
          />
          Hub Access
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
          <input
            type="checkbox"
            checked={draft.canUseAdmin}
            onChange={(event) => setDraft({ ...draft, canUseAdmin: event.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
          />
          Admin
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
          <input
            type="checkbox"
            checked={draft.canUseScheduler}
            onChange={(event) => setDraft({ ...draft, canUseScheduler: event.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
          />
          Scheduler
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
          <input
            type="checkbox"
            checked={draft.canUseDigitalSlips}
            onChange={(event) => setDraft({ ...draft, canUseDigitalSlips: event.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
          />
          Digital Slips
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
          <input
            type="checkbox"
            checked={draft.canUseOfficePayroll}
            onChange={(event) => setDraft({ ...draft, canUseOfficePayroll: event.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
          />
          Office & Payroll
        </label>
        <label className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-100">
          <input
            type="checkbox"
            checked={draft.canManageUsers}
            onChange={(event) => setDraft({ ...draft, canManageUsers: event.target.checked })}
            className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-amber-500"
          />
          Superuser
        </label>
        <button
          type="button"
          onClick={addUser}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400"
        >
          <Plus size={16} />
          Add User
        </button>
      </div>

      <div className="mt-5 overflow-hidden rounded-lg border border-slate-800">
        {staff.map((user) => (
          <div
            key={user.email}
            className="grid gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 last:border-b-0 xl:grid-cols-[1fr_95px_95px_110px_130px_145px_125px_125px] xl:items-center"
          >
            <div>
              <div className="font-semibold text-white">{user.email}</div>
              {user.superuser && <div className="mt-1 text-xs font-semibold text-sky-300">Superuser</div>}
              {savingEmail === user.email && <div className="mt-1 text-xs font-semibold text-amber-200">Saving...</div>}
            </div>
            {[
              ["canUseHub", "Hub"],
              ["canUseAdmin", "Admin"],
              ["canUseScheduler", "Scheduler"],
              ["canUseDigitalSlips", "Digital Slips"],
              ["canUseOfficePayroll", "Office & Payroll"],
              ["canManageUsers", "Superuser"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={Boolean(user[key])}
                  disabled={savingEmail === user.email || (user.protectedSuperuser && key === "canManageUsers")}
                  onChange={(event) => updateUserAccess(user, { [key]: event.target.checked })}
                  className={`h-4 w-4 rounded border-slate-600 bg-slate-900 disabled:opacity-50 ${
                    key === "canManageUsers" ? "text-amber-500" : "text-sky-500"
                  }`}
                />
                {label}
              </label>
            ))}
            <div className="flex justify-end">
              {user.protectedSuperuser ? (
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-400">
                  Protected
                </span>
              ) : pendingDelete?.email === user.email ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => removeUser(user.email)}
                    className="rounded-lg border border-rose-400 bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-400"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete(null)}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPendingDelete(user)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-rose-400 hover:text-rose-200"
                >
                  <Trash2 size={14} />
                  Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SystemStatusPanel() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Database size={16} className="text-sky-300" />
          Frontend Connection
        </div>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm">
          {isSupabaseConfigured ? (
            <>
              <CheckCircle2 size={16} className="text-emerald-300" />
              <span className="text-emerald-100">Supabase environment variables found.</span>
            </>
          ) : (
            <>
              <TriangleAlert size={16} className="text-amber-300" />
              <span className="text-amber-100">Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</span>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ServerCog size={16} className="text-violet-300" />
          Database
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Shared tables, row-level security policies, and Edge Functions are managed through Supabase migrations and deploys.
        </p>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Mail size={16} className="text-emerald-300" />
          Email Secrets
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-400">
          Gmail-powered notification functions use these server-side secrets.
        </p>
        <div className="mt-3 grid gap-2">
          {requiredSecrets.map((secret) => (
            <div key={secret} className="rounded-md border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-300">
              {secret}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminSettingsModule({ currentUserEmail = "", canManageUsers = false }) {
  const [settingsView, setSettingsView] = useState(canManageUsers ? "users" : "drive");
  const settingOptions = [
    ...(canManageUsers ? [["users", "Users", Users]] : []),
    ["drive", "Drive Backup", Cloud],
    ["system", "System Status", Settings],
  ];

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Settings</div>
            <h1 className="mt-2 text-2xl font-bold text-white">Admin Settings</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Manage connected services and backend readiness. User access controls are only available to superusers.
            </p>
          </div>
          <div className="text-xs text-slate-500">{currentUserEmail}</div>
        </div>

        <div className="mb-5 flex flex-wrap gap-2">
          {settingOptions.map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setSettingsView(id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                settingsView === id
                  ? "border-sky-400 bg-sky-500 text-white"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {settingsView === "users" && canManageUsers && <StaffAccessManager />}
        {settingsView === "drive" && <DriveBackupModule currentUserEmail={currentUserEmail} embedded />}
        {settingsView === "system" && <SystemStatusPanel />}
      </div>
    </section>
  );
}
