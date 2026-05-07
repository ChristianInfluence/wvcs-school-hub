import { useEffect, useState } from "react";
import { CheckCircle2, Database, Mail, Plus, ServerCog, ShieldCheck, Trash2, TriangleAlert } from "lucide-react";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";
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
  const [draft, setDraft] = useState({ email: "", canUseAdmin: true, canUseScheduler: true });
  const [status, setStatus] = useState("Loading authorized users...");
  const [pendingDelete, setPendingDelete] = useState(null);

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
        canUseHub: true,
        canUseAdmin: draft.canUseAdmin,
        canUseScheduler: draft.canUseScheduler,
      });
      setDraft({ email: "", canUseAdmin: true, canUseScheduler: true });
      setStatus(`${email} added.`);
      await loadStaff();
    } catch (error) {
      setStatus(`Unable to add user: ${error.message}`);
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
            Authorized Admin Users
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Manage who can access Admin and the Master Scheduler. {SUPERUSER_EMAIL} is the protected superuser.
          </p>
        </div>
        <div className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1 text-xs font-semibold text-slate-300">
          {status}
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_150px_170px_auto] lg:items-end">
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
            className="grid gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 last:border-b-0 md:grid-cols-[1fr_120px_140px_140px] md:items-center"
          >
            <div>
              <div className="font-semibold text-white">{user.email}</div>
              {user.superuser && <div className="mt-1 text-xs font-semibold text-sky-300">Superuser</div>}
            </div>
            <div className="text-sm font-semibold text-slate-300">{user.canUseAdmin ? "Admin" : "No Admin"}</div>
            <div className="text-sm font-semibold text-slate-300">
              {user.canUseScheduler ? "Scheduler" : "No Scheduler"}
            </div>
            <div className="flex justify-end">
              {user.superuser ? (
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

export default function InfrastructureModule() {
  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Infrastructure</div>
          <h1 className="mt-2 text-2xl font-bold text-white">Email and Supabase Setup</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            This is the first backend layer for shared records, notification emails, and calendar invites.
          </p>
        </div>

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
              Database Schema
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Run the schema in <span className="font-mono text-slate-200">supabase/schema.sql</span> to create the
              meeting request and admin configuration tables.
            </p>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Mail size={16} className="text-emerald-300" />
              Gmail Function
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-400">
              Deploy <span className="font-mono text-slate-200">send-meeting-request</span> and add these Edge Function
              secrets:
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

        <div className="mt-5 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-sm font-semibold text-white">Current Behavior</div>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Meeting requests still work locally without backend keys. Once Supabase and the Gmail Edge Function are
            configured, the app will also save the request to Supabase and ask the function to email the calendar invite.
          </p>
        </div>

        <StaffAccessManager />
      </div>
    </section>
  );
}
