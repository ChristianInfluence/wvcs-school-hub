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

function escapeHtml(value: unknown) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const requesterEmail = normalizeEmail(ticket.submitter_email);
  const submittedAt = ticket.created_at ? new Date(ticket.created_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "";
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
  const detailsHtml = escapeHtml(ticket.body || "").replace(/\r?\n/g, "<br>");
  const boundary = `wvcs-support-${crypto.randomUUID()}`;
  const html = `<!doctype html>
<html>
  <body style="margin:0;background:#f1f5f9;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="background:#0f172a;padding:22px 24px;color:#ffffff;">
          <div style="font-size:12px;letter-spacing:0.14em;text-transform:uppercase;color:#7dd3fc;font-weight:700;">WVCS School Hub</div>
          <div style="font-size:24px;line-height:1.25;font-weight:800;margin-top:6px;">New Support Request</div>
        </td>
      </tr>
      <tr>
        <td style="padding:24px;">
          <div style="font-size:20px;font-weight:800;margin-bottom:14px;">${escapeHtml(ticket.title || "New request")}</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin-bottom:18px;">
            <tr>
              <td style="padding:10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;font-weight:700;color:#475569;">Category</td>
              <td style="padding:10px;border:1px solid #e2e8f0;font-size:14px;">${escapeHtml(ticket.category || "")}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;font-weight:700;color:#475569;">Submitted by</td>
              <td style="padding:10px;border:1px solid #e2e8f0;font-size:14px;">${escapeHtml(ticket.submitter_email || "")}</td>
            </tr>
            <tr>
              <td style="padding:10px;border:1px solid #e2e8f0;background:#f8fafc;font-size:12px;font-weight:700;color:#475569;">Submitted</td>
              <td style="padding:10px;border:1px solid #e2e8f0;font-size:14px;">${escapeHtml(submittedAt || ticket.created_at || "")}</td>
            </tr>
          </table>
          <div style="font-size:13px;font-weight:800;color:#334155;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px;">Request Details</div>
          <div style="border:1px solid #e2e8f0;background:#f8fafc;border-radius:10px;padding:14px;font-size:14px;line-height:1.6;color:#1e293b;">${detailsHtml}</div>
          <div style="margin-top:20px;padding:14px;border-radius:10px;background:#e0f2fe;border:1px solid #bae6fd;color:#075985;font-size:14px;line-height:1.5;">
            Replying to this email will reply to ${escapeHtml(ticket.submitter_email || "the requester")}. Open the Hub Support Requests admin area to update the ticket status.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipientEmail}`,
    ...(requesterEmail ? [`Reply-To: ${requesterEmail}`] : []),
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "",
    body,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    html,
    "",
    `--${boundary}--`,
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
