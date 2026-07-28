import { createClient } from "npm:@supabase/supabase-js@2";
import { recordEmailAudit } from "../_shared/emailAudit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeHeader(value: unknown) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

function encodeBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function parseRecipients(value: unknown) {
  if (Array.isArray(value)) return value.map(normalizeEmail).filter(Boolean);
  return String(value || "")
    .split(/[,\n;]+/)
    .map(normalizeEmail)
    .filter(Boolean);
}

function recipientsForCategory(settings: Record<string, any>, category: string) {
  if (category === "IT Support") return parseRecipients(settings.itRecipients);
  if (category === "Maintenance") return parseRecipients(settings.maintenanceRecipients);
  if (category === "Facilities") return parseRecipients(settings.facilitiesRecipients);
  if (category === "Supplies") return parseRecipients(settings.suppliesRecipients);
  return parseRecipients(settings.itRecipients);
}

async function requireHubUser(request: Request, supabase: ReturnType<typeof createClient>) {
  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("Please sign in before submitting a support request.");

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError) throw userError;
  const email = normalizeEmail(userData?.user?.email);
  if (!email) throw new Error("Please sign in before submitting a support request.");

  const { data: staff, error: staffError } = await supabase
    .from("staff_access")
    .select("email, can_use_hub")
    .eq("email", email)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff?.can_use_hub) throw new Error("This email is not approved for Hub access.");
  return email;
}

async function getAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requiredEnv("GOOGLE_CLIENT_ID"),
      client_secret: requiredEnv("GOOGLE_CLIENT_SECRET"),
      refresh_token: requiredEnv("GOOGLE_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) throw new Error(`Google token refresh failed: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

function buildMessage(ticket: Record<string, any>, senderEmail: string, recipientEmail: string) {
  const subject = `WVCS Support Request: ${ticket.title || "New request"}`;
  const body = [
    "A new support request was submitted from WVCS School Hub.",
    "",
    `Title: ${ticket.title || ""}`,
    `Category: ${ticket.category || ""}`,
    `Submitted by: ${ticket.submitter_email || ""}`,
    `Submitted: ${ticket.created_at || ""}`,
    "",
    ticket.body || "",
    "",
    "Open the Hub Support Requests admin area to update the ticket.",
  ].join("\r\n");

  return [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipientEmail}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
  ].join("\r\n");
}

async function sendNotifications(ticket: Record<string, any>, recipients: string[]) {
  if (!recipients.length) return [];
  const senderEmail = requiredEnv("GMAIL_SENDER_EMAIL");
  const accessToken = await getAccessToken();
  const uniqueRecipients = Array.from(new Set(recipients));
  const sent = [];

  for (const recipient of uniqueRecipients) {
    const raw = encodeBase64Url(buildMessage(ticket, senderEmail, recipient));
    const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!response.ok) throw new Error(`Gmail send failed: ${await response.text()}`);
    const data = await response.json();
    sent.push({ recipient, gmailMessageId: data.id });
  }
  return sent;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const actorEmail = await requireHubUser(request, supabase);
    const payload = await request.json();
    if (payload.action !== "create") throw new Error("Unsupported support request action.");

    const supportRequest = payload.request || {};
    const title = String(supportRequest.title || "").trim();
    const body = String(supportRequest.body || "").trim();
    const category = String(supportRequest.category || "IT Support").trim();
    if (!title || !body) throw new Error("Support request needs a title and details.");

    const { data: saved, error: saveError } = await supabase
      .from("staff_suggestions")
      .insert({
        id: supportRequest.id || crypto.randomUUID(),
        title,
        category,
        body,
        submitter_email: actorEmail,
        anonymous: false,
        status: "new",
        admin_response: "",
      })
      .select("*")
      .single();
    if (saveError) throw saveError;

    const { data: settingsRow } = await supabase
      .from("office_finance_settings")
      .select("settings")
      .eq("id", "support_requests")
      .maybeSingle();
    const recipients = recipientsForCategory(settingsRow?.settings || {}, category);
    const notified = await sendNotifications(saved, recipients);
    await recordEmailAudit({
      module: "Support Request",
      subject: `WVCS Support Request: ${saved.title || "New request"}`,
      recipients,
      senderEmail: Deno.env.get("GMAIL_SENDER_EMAIL") || "",
      actorEmail,
      status: notified.length ? "sent" : "no recipients",
      messageIds: notified.map((message) => message.gmailMessageId),
      metadata: { itemId: saved.id, category },
    });

    return new Response(JSON.stringify({ saved: true, suggestion: saved, notified }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ saved: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
