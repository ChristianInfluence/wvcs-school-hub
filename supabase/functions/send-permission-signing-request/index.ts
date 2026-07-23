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

async function requireDigitalSlipsStaff(request: Request, supabase: any) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Authentication required.");

  const { data: userResult, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userResult?.user?.email) throw new Error("Authentication required.");

  const { data: access, error: accessError } = await supabase
    .from("staff_access")
    .select("can_use_hub, can_use_admin, can_use_digital_slips")
    .eq("email", userResult.user.email.toLowerCase())
    .maybeSingle();
  if (accessError) throw accessError;
  if (!access?.can_use_hub || (!access.can_use_admin && !access.can_use_digital_slips)) {
    throw new Error("You do not have permission to send digital permission slips.");
  }

  return userResult.user;
}

function encodeBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function sanitizeHeader(value: string) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function firstName(value: string) {
  return String(value || "").trim().split(/\s+/)[0] || "your student";
}

const defaultTemplates = {
  initial: {
    subject: "WVCS Permission Slip: {eventTitle}",
    body: [
      "Dear {parentName},",
      "",
      "Willamette Valley Christian School has a permission slip for {studentName} for {eventTitle} on {eventDate}.",
      "",
      "Please review and sign here: {signingUrl}",
      "",
      "Thank you,",
      "Willamette Valley Christian School",
      "9075 Pueblo Ave NE, Brooks, OR 97305",
      "TEL: 503-393-5236",
    ].join("\r\n"),
    heading: "Permission Slip Ready",
    action: "Review & Sign Permission Slip",
  },
  reminder: {
    subject: "Reminder: WVCS Permission Slip for {studentName}",
    body: [
      "Dear {parentName},",
      "",
      "This is a friendly reminder that {studentName}'s permission slip for {eventTitle} is still waiting for a signature.",
      "",
      "Please review and sign here: {signingUrl}",
      "",
      "Thank you,",
      "Willamette Valley Christian School",
    ].join("\r\n"),
    heading: "Permission Slip Reminder",
    action: "Review & Sign Permission Slip",
  },
  finalReminder: {
    subject: "Final Reminder: Permission Slip Needed for {eventTitle}",
    body: [
      "Dear {parentName},",
      "",
      "We still need a signed permission slip for {studentName} for {eventTitle}. Please complete it as soon as possible so your student can participate.",
      "",
      "Sign here: {signingUrl}",
      "",
      "Thank you,",
      "Willamette Valley Christian School",
    ].join("\r\n"),
    heading: "Final Permission Slip Reminder",
    action: "Sign Permission Slip",
  },
};

function formatDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function renderTemplate(template: string, values: Record<string, string>) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => values[key] || match);
}

function textToHtmlParagraphs(value: string) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `<p style="margin:0 0 14px;color:#334155;font-size:15px;line-height:1.65;">${escapeHtml(line)}</p>`)
    .join("");
}

function buildSigningUrl(payload: Record<string, any>, recipient: Record<string, any>) {
  if (payload.signingBaseUrl) {
    return `${String(payload.signingBaseUrl).replace(/\/$/, "")}#/permission-sign/${encodeURIComponent(recipient.signing_token)}`;
  }
  if (payload.signingUrl) return payload.signingUrl;
  throw new Error("Missing signingBaseUrl.");
}

function buildMessage({
  senderEmail,
  recipient,
  event,
  signingUrl,
  templateKey,
}: {
  senderEmail: string;
  recipient: Record<string, any>;
  event: Record<string, any>;
  signingUrl: string;
  templateKey: string;
}) {
  const eventJson = event.event || {};
  const normalizedTemplateKey = ["initial", "reminder", "finalReminder"].includes(templateKey) ? templateKey : "initial";
  const savedTemplate = eventJson.messageTemplates?.[normalizedTemplateKey] || {};
  const template = { ...defaultTemplates[normalizedTemplateKey], ...savedTemplate };
  const eventTitle = event.title || "Field Trip";
  const values = {
    parentName: recipient.parent_name || "Parent/Guardian",
    studentName: recipient.student_name || firstName(recipient.student_name),
    eventTitle,
    eventDate: formatDate(event.event_date || eventJson.eventDate),
    destination: event.destination || eventJson.destination || "WVCS field trip",
    signingUrl,
    schoolName: "Willamette Valley Christian School",
  };
  const subject = renderTemplate(template.subject, values);
  const textBody = renderTemplate(template.body, values);
  const boundary = `wvcs-permission-${crypto.randomUUID()}`;
  const htmlBody = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;margin:0;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:#0f172a;padding:24px 28px;">
                <div style="color:#93c5fd;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">WVCS School Hub</div>
                <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;line-height:1.25;">${escapeHtml(template.heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <div style="margin:0 0 20px;padding:16px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;">
                  <div style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#1d4ed8;">Field Trip</div>
                  <div style="margin-top:6px;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(eventTitle)}</div>
                  <div style="margin-top:8px;color:#475569;font-size:14px;line-height:1.6;">
                    <strong>Student:</strong> ${escapeHtml(values.studentName)}<br>
                    <strong>Date:</strong> ${escapeHtml(values.eventDate)}<br>
                    <strong>Destination:</strong> ${escapeHtml(values.destination)}
                  </div>
                </div>
                ${textToHtmlParagraphs(textBody)}
                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0;">
                  <tr>
                    <td style="border-radius:10px;background:#0284c7;">
                      <a href="${escapeHtml(signingUrl)}" style="display:inline-block;padding:13px 20px;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;border-radius:10px;">${escapeHtml(template.action)}</a>
                    </td>
                  </tr>
                </table>
                <div style="margin-top:18px;padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;">
                  <div style="font-size:12px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.08em;">Secure Link</div>
                  <a href="${escapeHtml(signingUrl)}" style="display:block;margin-top:6px;color:#0369a1;font-size:13px;line-height:1.5;word-break:break-all;">${escapeHtml(signingUrl)}</a>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;line-height:1.6;">
                Willamette Valley Christian School<br>
                9075 Pueblo Ave NE, Brooks, OR 97305<br>
                503-393-5236
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipient.parent_email}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    htmlBody,
    "",
    `--${boundary}--`,
  ].join("\r\n");
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

  if (!response.ok) {
    throw new Error(`Google token refresh failed: ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await request.json();
    const eventId = payload.eventId;
    const recipientIds = Array.isArray(payload.recipientIds) ? payload.recipientIds : [];
    const templateKey = ["initial", "reminder", "finalReminder"].includes(payload.templateKey) ? payload.templateKey : "initial";
    if (!eventId) throw new Error("Missing eventId.");
    if (!recipientIds.length) throw new Error("Missing recipientIds.");

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
    const actor = await requireDigitalSlipsStaff(request, supabase);

    const { data: event, error: eventError } = await supabase
      .from("permission_events")
      .select("*")
      .eq("id", eventId)
      .maybeSingle();

    if (eventError) throw eventError;
    if (!event) throw new Error(`Permission event not found: ${eventId}`);

    const { data: recipients, error: recipientsError } = await supabase
      .from("permission_recipients")
      .select("*")
      .eq("event_id", eventId)
      .in("id", recipientIds);

    if (recipientsError) throw recipientsError;

    const senderEmail = requiredEnv("GMAIL_SENDER_EMAIL");
    const accessToken = await getAccessToken();
    const sentMessages = [];
    const skipped = [];
    const failed = [];

    for (const recipient of recipients || []) {
      if (!recipient.parent_email) {
        skipped.push({ recipientId: recipient.id, reason: "No parent email" });
        continue;
      }

      const signingUrl = buildSigningUrl(payload, recipient);
      const raw = encodeBase64Url(buildMessage({ senderEmail, recipient, event, signingUrl, templateKey }));
      const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      });

      if (!gmailResponse.ok) {
        failed.push({
          recipientId: recipient.id,
          recipientEmail: recipient.parent_email,
          studentName: recipient.student_name,
          reason: await gmailResponse.text(),
        });
        continue;
      }

      const gmailData = await gmailResponse.json();
      const sentAt = new Date().toISOString();
      await supabase
        .from("permission_recipients")
        .update({
          status: templateKey === "finalReminder" ? "Final Reminder Sent" : templateKey === "reminder" ? "Reminder Sent" : "Email Sent",
          delivery_channel: recipient.delivery_channel === "sms" || recipient.delivery_channel === "email+sms" ? "email+sms" : "email",
          sent_at: sentAt,
          emailed_at: sentAt,
          updated_at: sentAt,
        })
        .eq("id", recipient.id);

      await supabase
        .from("permission_audit_log")
        .insert({
          event_id: eventId,
          recipient_id: recipient.id,
          action: templateKey === "initial" ? "permission_signing_email_sent" : "permission_signing_reminder_sent",
          actor_label: "WVCS School Hub",
          actor_email: actor.email,
          details: {
            recipientEmail: recipient.parent_email,
            studentName: recipient.student_name,
            eventTitle: event.title,
            gmailMessageId: gmailData.id,
            templateKey,
          },
        });

      sentMessages.push({
        recipientId: recipient.id,
        recipientEmail: recipient.parent_email,
        gmailMessageId: gmailData.id,
        sentAt,
        templateKey,
      });
    }

    return new Response(JSON.stringify({ sent: true, messages: sentMessages, skipped, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
