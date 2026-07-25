import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFosMessage, calculateFosBalance, corsHeaders, formatCurrency, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

const defaultTemplate = {
  subject: "WVCS FOS Balance Reminder: {familyName}",
  heading: "FOS Balance Reminder",
  body: `Hello {familyName},

This is a reminder that your current FOS amount owed is {amountOwed}.

You currently have {approvedHours} approved volunteer hours and {remainingHours} hours remaining.

If you have completed volunteer hours that have not yet been reported, please log into your WVCS Family Portal and submit them for office review.

Family Portal: {portalLoginUrl}`,
};

function renderTemplate(template: string, values: Record<string, string>) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}

function uniqueStrings(values: unknown[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const payload = await request.json();
    const familyKeys = uniqueStrings(Array.isArray(payload.familyKeys) ? payload.familyKeys : [payload.familyKey]);
    if (!familyKeys.length) throw new Error("Missing family record.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    const requesterEmail = normalizeEmail(userData?.user?.email || "");
    if (!requesterEmail) throw new Error("Missing user identity.");

    const { data: staffRows, error: staffError } = await supabase
      .from("staff_access")
      .select("email, can_use_hub, can_manage_users, can_use_office_payroll")
      .eq("email", requesterEmail)
      .limit(1);
    if (staffError) throw staffError;
    const staff = staffRows?.[0];
    if (
      requesterEmail !== "mconniry@wvcs.org" &&
      (!staff?.can_use_hub || (!staff.can_use_office_payroll && !staff.can_manage_users))
    ) throw new Error("Not authorized.");

    const { data: templateRow } = await supabase
      .from("fos_email_templates")
      .select("subject,heading,body")
      .eq("id", "reminder")
      .maybeSingle();
    const template = { ...defaultTemplate, ...(templateRow || {}) };

    const { data: accessRows, error: accessError } = await supabase
      .from("family_portal_access")
      .select("*")
      .in("family_key", familyKeys)
      .eq("active", true);
    if (accessError) throw accessError;
    if (!accessRows?.length) throw new Error("No active family portal access records found.");

    const { data: entryRows, error: entriesError } = await supabase
      .from("fos_hour_entries")
      .select("*")
      .in("family_key", familyKeys)
      .eq("school_year", "2026-2027");
    if (entriesError) throw entriesError;

    const loginUrl = `${request.headers.get("origin") || "https://wvcshub.org"}/#/family-login`;
    const recipientsByFamily = payload.recipientsByFamily && typeof payload.recipientsByFamily === "object" ? payload.recipientsByFamily : {};
    const results = [];
    let sentCount = 0;

    for (const access of accessRows) {
      const requestedRecipients = Array.isArray(recipientsByFamily[access.family_key])
        ? recipientsByFamily[access.family_key]
        : Array.isArray(payload.recipients)
          ? payload.recipients
          : access.contact_emails || [];
      const selectedRecipients = requestedRecipients.map((email: string) => normalizeEmail(email)).filter(Boolean);
      const authorizedSet = new Set((access.contact_emails || []).map((email: string) => normalizeEmail(email)));
      const authorizedRecipients = selectedRecipients.filter((email: string) => authorizedSet.has(email));

      if (!authorizedRecipients.length) {
        results.push({
          familyKey: access.family_key,
          familyName: access.family_name,
          sent: false,
          recipients: [],
          error: "No selected recipients are authorized for this family portal. Send an invite first.",
        });
        continue;
      }

      const entries = (entryRows || []).filter((entry: Record<string, any>) => entry.family_key === access.family_key);
      const balance = calculateFosBalance(entries || [], access);
      const values = {
        familyName: access.family_name || "WVCS Family",
        amountOwed: formatCurrency(balance.remainingBalance),
        approvedHours: String(balance.approvedHours),
        remainingHours: String(balance.remainingHours),
        liabilityAmount: formatCurrency(balance.liabilityAmount),
        hourValue: formatCurrency(balance.hourValue),
        requiredHours: String(balance.requiredHours),
        portalLoginUrl: loginUrl,
        schoolYear: "2026-2027",
      };
      const subject = renderTemplate(template.subject, values);
      const heading = renderTemplate(template.heading, values);
      const body = renderTemplate(template.body, values).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

      await Promise.all(authorizedRecipients.map((email: string) =>
        sendEmail(
          buildFosMessage({
            recipientEmail: email,
            subject,
            title: heading,
            body,
            balance,
          }),
        )
      ));
      const sentAt = new Date().toISOString();
      await supabase
        .from("family_portal_access")
        .update({
          last_fos_reminder_sent_at: sentAt,
          last_fos_reminder_sent_by_email: requesterEmail,
        })
        .eq("family_key", access.family_key);
      await supabase.from("fos_audit_events").insert({
        event_type: "fos_reminder_sent",
        family_key: access.family_key,
        family_name: access.family_name,
        actor_email: requesterEmail,
        recipient_emails: authorizedRecipients,
        metadata: {
          balance,
          templateSubject: subject,
          sentAt,
        },
      });
      sentCount += authorizedRecipients.length;
      results.push({ familyKey: access.family_key, familyName: access.family_name, sent: true, recipients: authorizedRecipients, balance });
    }

    return new Response(JSON.stringify({ sent: sentCount > 0, sentCount, results, loginUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
