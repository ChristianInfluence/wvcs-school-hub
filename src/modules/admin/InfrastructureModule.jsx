import { CheckCircle2, Database, Mail, ServerCog, TriangleAlert } from "lucide-react";
import { isSupabaseConfigured } from "../../lib/supabaseClient.js";

const requiredSecrets = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "GMAIL_SENDER_EMAIL",
];

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
      </div>
    </section>
  );
}

