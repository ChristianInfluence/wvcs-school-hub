import { createClient } from "npm:@supabase/supabase-js@2";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export async function recordEmailAudit(entry: Record<string, unknown>) {
  try {
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: existing } = await supabase
      .from("office_finance_settings")
      .select("settings")
      .eq("id", "email_audit")
      .maybeSingle();

    const previousEntries = Array.isArray(existing?.settings?.entries) ? existing.settings.entries : [];
    const recipients = Array.isArray(entry.recipients) ? entry.recipients.map(cleanEmail).filter(Boolean) : [];
    const nextEntry = {
      id: crypto.randomUUID(),
      sentAt: new Date().toISOString(),
      module: String(entry.module || "Hub Email"),
      subject: String(entry.subject || ""),
      recipients,
      senderEmail: cleanEmail(entry.senderEmail),
      actorEmail: cleanEmail(entry.actorEmail),
      status: String(entry.status || "sent"),
      messageIds: Array.isArray(entry.messageIds) ? entry.messageIds : [],
      metadata: entry.metadata || {},
    };
    const entries = [nextEntry, ...previousEntries].slice(0, 500);

    await supabase
      .from("office_finance_settings")
      .upsert(
        {
          id: "email_audit",
          settings: { entries },
          updated_by_email: nextEntry.actorEmail || null,
        },
        { onConflict: "id" }
      );
  } catch (error) {
    console.error("Email audit logging failed", error instanceof Error ? error.message : error);
  }
}
