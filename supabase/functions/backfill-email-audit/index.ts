import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function cleanEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function emails(values: unknown) {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(cleanEmail).filter(Boolean)));
}

function entryId(prefix: string, id: unknown, suffix = "") {
  return `backfill:${prefix}:${String(id || "").trim() || crypto.randomUUID()}${suffix ? `:${suffix}` : ""}`;
}

async function requireOfficeFinance(request: Request, supabase: ReturnType<typeof createClient>) {
  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("Please sign in before backfilling the email audit.");

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError) throw userError;
  const email = cleanEmail(userData?.user?.email);
  if (!email) throw new Error("Please sign in before backfilling the email audit.");

  const { data: staff, error: staffError } = await supabase
    .from("staff_access")
    .select("email, can_use_hub, can_use_admin, can_use_office_payroll, can_manage_users")
    .eq("email", email)
    .maybeSingle();
  if (staffError) throw staffError;
  if (email !== "mconniry@wvcs.org" && (!staff?.can_use_hub || (!staff.can_use_admin && !staff.can_use_office_payroll && !staff.can_manage_users))) {
    throw new Error("Office & Finance access is required.");
  }
  return email;
}

function makeEntry({
  id,
  sentAt,
  module,
  subject,
  recipients,
  actorEmail = "",
  metadata = {},
}: {
  id: string;
  sentAt: string;
  module: string;
  subject: string;
  recipients: string[];
  actorEmail?: string;
  metadata?: Record<string, unknown>;
}) {
  return {
    id,
    sentAt,
    module,
    subject,
    recipients,
    senderEmail: "",
    actorEmail: cleanEmail(actorEmail),
    status: "backfilled",
    messageIds: [],
    metadata: { ...metadata, backfilled: true },
  };
}

function warnIfFailed(skipped: string[], label: string, error: unknown) {
  if (!error) return;
  const message = error instanceof Error ? error.message : String((error as { message?: string })?.message || error);
  skipped.push(`${label}: ${message}`);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const actorEmail = await requireOfficeFinance(request, supabase);

    const [
      { data: existingAudit },
      { data: tuitionInvoices, error: tuitionError },
      { data: incidentalInvoices, error: incidentalError },
      { data: formSubmissions, error: formError },
      { data: permissionRecipients, error: permissionError },
      { data: permissionAudits, error: permissionAuditError },
    ] = await Promise.all([
      supabase.from("office_finance_settings").select("settings").eq("id", "email_audit").maybeSingle(),
      supabase.from("tuition_invoices").select("id,family_name,school_year,sent_at,sent_to,updated_by_email,created_by_email,invoice_json").not("sent_at", "is", null).limit(300),
      supabase.from("incidental_invoices").select("id,family_name,sent_at,sent_to,updated_by_email,created_by_email,invoice_json").not("sent_at", "is", null).limit(300),
      supabase.from("form_submissions").select("id,template_id,template_title,submitter_email,email_status,emailed_at,submission,answers").not("emailed_at", "is", null).limit(300),
      supabase.from("permission_recipients").select("id,event_id,parent_email,parent_name,student_name,emailed_at,sent_at,status,recipient").not("emailed_at", "is", null).limit(500),
      supabase.from("permission_audit_log").select("id,event_id,recipient_id,actor_email,action,details,created_at").in("action", ["permission_signing_email_sent", "permission_signing_reminder_sent"]).limit(500),
    ]);

    const skipped: string[] = [];
    warnIfFailed(skipped, "tuition_invoices", tuitionError);
    warnIfFailed(skipped, "incidental_invoices", incidentalError);
    warnIfFailed(skipped, "form_submissions", formError);
    warnIfFailed(skipped, "permission_recipients", permissionError);
    warnIfFailed(skipped, "permission_audit_log", permissionAuditError);

    const backfilled = [];

    for (const invoice of tuitionInvoices || []) {
      backfilled.push(makeEntry({
        id: entryId("tuition", invoice.id),
        sentAt: invoice.sent_at,
        module: "Tuition Breakdown",
        subject: `WVCS Tuition Breakdown: ${invoice.family_name || "Family"}`,
        recipients: emails(invoice.sent_to),
        actorEmail: invoice.updated_by_email || invoice.created_by_email || "",
        metadata: { source: "tuition_invoices", invoiceId: invoice.id, familyName: invoice.family_name, schoolYear: invoice.school_year },
      }));
    }

    for (const invoice of incidentalInvoices || []) {
      backfilled.push(makeEntry({
        id: entryId("incidental", invoice.id),
        sentAt: invoice.sent_at,
        module: "Incidental Invoice",
        subject: `WVCS Incidental Invoice: ${invoice.family_name || "Family"}`,
        recipients: emails(invoice.sent_to),
        actorEmail: invoice.updated_by_email || invoice.created_by_email || "",
        metadata: { source: "incidental_invoices", invoiceId: invoice.id, familyName: invoice.family_name },
      }));
    }

    for (const submission of formSubmissions || []) {
      const submissionJson = submission.submission || {};
      const recipients = emails(submissionJson.recipients || submissionJson.emailRecipients || submissionJson.approvalRecipients || []);
      backfilled.push(makeEntry({
        id: entryId("form", submission.id),
        sentAt: submission.emailed_at,
        module: "Form Notification",
        subject: `Form submitted: ${submission.template_title || "WVCS Form"}`,
        recipients,
        actorEmail: submission.submitter_email || "",
        metadata: { source: "form_submissions", submissionId: submission.id, templateId: submission.template_id, emailStatus: submission.email_status },
      }));
    }

    for (const recipient of permissionRecipients || []) {
      backfilled.push(makeEntry({
        id: entryId("permission-recipient", recipient.id),
        sentAt: recipient.emailed_at || recipient.sent_at,
        module: "Permission Slip",
        subject: `WVCS Permission Slip: ${recipient.student_name || "Student"}`,
        recipients: emails([recipient.parent_email]),
        metadata: { source: "permission_recipients", eventId: recipient.event_id, recipientId: recipient.id, status: recipient.status },
      }));
    }

    for (const audit of permissionAudits || []) {
      const details = audit.details || {};
      backfilled.push(makeEntry({
        id: entryId("permission-audit", audit.id),
        sentAt: audit.created_at,
        module: "Permission Slip",
        subject: `${audit.action === "permission_signing_email_sent" ? "WVCS Permission Slip" : "WVCS Permission Slip Reminder"}: ${details.eventTitle || "Field Trip"}`,
        recipients: emails([details.recipientEmail]),
        actorEmail: audit.actor_email || "",
        metadata: { source: "permission_audit_log", eventId: audit.event_id, recipientId: audit.recipient_id, auditId: audit.id },
      }));
    }

    const previousEntries = Array.isArray(existingAudit?.settings?.entries) ? existingAudit.settings.entries : [];
    const merged = new Map<string, Record<string, unknown>>();
    [...previousEntries, ...backfilled]
      .filter((entry) => entry?.id && entry?.sentAt)
      .forEach((entry) => merged.set(String(entry.id), entry));
    const entries = [...merged.values()]
      .sort((a, b) => new Date(String(b.sentAt || 0)).getTime() - new Date(String(a.sentAt || 0)).getTime())
      .slice(0, 500);

    const { error: saveError } = await supabase
      .from("office_finance_settings")
      .upsert(
        {
          id: "email_audit",
          settings: { entries },
          updated_by_email: actorEmail,
        },
        { onConflict: "id" }
      );
    if (saveError) throw saveError;

    return new Response(JSON.stringify({ backfilled: true, added: backfilled.length, total: entries.length, skipped }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ backfilled: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
