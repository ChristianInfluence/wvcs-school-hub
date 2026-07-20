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

function encodeBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function sanitizeHeader(value: string) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

function firstName(value: string) {
  return String(value || "").trim().split(/\s+/)[0] || "your student";
}

const defaultInitialTemplate = {
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
};

function formatDate(value: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function renderTemplate(template: string, values: Record<string, string>) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => values[key] || match);
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
}: {
  senderEmail: string;
  recipient: Record<string, any>;
  event: Record<string, any>;
  signingUrl: string;
}) {
  const eventJson = event.event || {};
  const savedTemplate = eventJson.messageTemplates?.initial || {};
  const template = { ...defaultInitialTemplate, ...savedTemplate };
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

  return [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipient.parent_email}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
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
    if (!eventId) throw new Error("Missing eventId.");
    if (!recipientIds.length) throw new Error("Missing recipientIds.");

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

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
      const raw = encodeBase64Url(buildMessage({ senderEmail, recipient, event, signingUrl }));
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
          status: "Email Sent",
          delivery_channel: "email",
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
          action: "permission_signing_email_sent",
          actor_label: "WVCS School Hub",
          details: {
            recipientEmail: recipient.parent_email,
            studentName: recipient.student_name,
            eventTitle: event.title,
            gmailMessageId: gmailData.id,
          },
        });

      sentMessages.push({
        recipientId: recipient.id,
        recipientEmail: recipient.parent_email,
        gmailMessageId: gmailData.id,
        sentAt,
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
