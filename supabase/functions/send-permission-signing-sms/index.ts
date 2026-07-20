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

function optionalEnv(name: string) {
  return Deno.env.get(name) || "";
}

function isSmsEnabled() {
  return optionalEnv("TWILIO_SMS_ENABLED").toLowerCase() === "true";
}

function firstName(value: string) {
  return String(value || "").trim().split(/\s+/)[0] || "your student";
}

const defaultSmsTemplate =
  "Willamette Valley Christian School: A permission slip for {studentName} is ready for {eventTitle}. Review and sign: {signingUrl} Reply STOP to opt out. Msg & data rates may apply.";

function renderTemplate(template: string, values: Record<string, string>) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) => values[key] || match);
}

function normalizePhone(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("+")) return trimmed.replace(/[^\d+]/g, "");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

function buildSigningUrl(payload: Record<string, any>, recipient: Record<string, any>) {
  if (payload.signingBaseUrl) {
    return `${String(payload.signingBaseUrl).replace(/\/$/, "")}#/permission-sign/${encodeURIComponent(recipient.signing_token)}`;
  }
  if (payload.signingUrl) return payload.signingUrl;
  throw new Error("Missing signingBaseUrl.");
}

function buildSmsMessage({
  recipient,
  event,
  signingUrl,
}: {
  recipient: Record<string, any>;
  event: Record<string, any>;
  signingUrl: string;
}) {
  const eventJson = event.event || {};
  const savedTemplate = eventJson.messageTemplates?.sms?.body || defaultSmsTemplate;
  const studentFirstName = firstName(recipient.student_name);
  const eventTitle = event.title || "Field Trip";
  return renderTemplate(savedTemplate, {
    parentName: recipient.parent_name || "Parent/Guardian",
    studentName: studentFirstName,
    eventTitle,
    eventDate: event.event_date || eventJson.eventDate || "",
    destination: event.destination || eventJson.destination || "WVCS field trip",
    signingUrl,
    schoolName: "Willamette Valley Christian School",
  });
}

async function sendTwilioSms({ to, body }: { to: string; body: string }) {
  const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
  const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
  const fromNumber = optionalEnv("TWILIO_FROM_NUMBER");
  const messagingServiceSid = optionalEnv("TWILIO_MESSAGING_SERVICE_SID");

  if (!fromNumber && !messagingServiceSid) {
    throw new Error("Missing TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.");
  }

  const params = new URLSearchParams({
    To: to,
    Body: body,
  });
  if (messagingServiceSid) params.set("MessagingServiceSid", messagingServiceSid);
  else params.set("From", fromNumber);

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.message || JSON.stringify(data));
  }
  return data;
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

    const smsEnabled = isSmsEnabled();
    const messages = [];
    const skipped = [];
    const failed = [];

    for (const recipient of recipients || []) {
      const to = normalizePhone(recipient.parent_phone);
      if (!to) {
        skipped.push({ recipientId: recipient.id, reason: "No parent phone" });
        continue;
      }

      const signingUrl = buildSigningUrl(payload, recipient);
      const body = buildSmsMessage({ recipient, event, signingUrl });
      const now = new Date().toISOString();

      if (!smsEnabled) {
        await supabase
          .from("permission_recipients")
          .update({
            status: recipient.status === "Signed" ? recipient.status : "SMS Previewed",
            delivery_channel: recipient.delivery_channel || "sms",
            sent_at: recipient.sent_at || now,
            sms_status: "Previewed",
            sms_queued_at: now,
            sms_error: null,
            updated_at: now,
          })
          .eq("id", recipient.id);

        await supabase
          .from("permission_audit_log")
          .insert({
            event_id: eventId,
            recipient_id: recipient.id,
            action: "permission_signing_sms_previewed",
            actor_label: "WVCS School Hub",
            actor_email: actor.email,
            details: {
              parentPhone: to,
              studentName: recipient.student_name,
              eventTitle: event.title,
              body,
            },
          });

        messages.push({ recipientId: recipient.id, parentPhone: to, preview: true, body, sentAt: now });
        continue;
      }

      try {
        const twilioData = await sendTwilioSms({ to, body });
        await supabase
          .from("permission_recipients")
          .update({
            status: recipient.status === "Signed" ? recipient.status : "SMS Sent",
            delivery_channel: recipient.delivery_channel === "email" ? "email+sms" : "sms",
            sent_at: recipient.sent_at || now,
            sms_status: "Sent",
            sms_sent_at: now,
            sms_error: null,
            twilio_message_sid: twilioData.sid || null,
            updated_at: now,
          })
          .eq("id", recipient.id);

        await supabase
          .from("permission_audit_log")
          .insert({
            event_id: eventId,
            recipient_id: recipient.id,
            action: "permission_signing_sms_sent",
            actor_label: "WVCS School Hub",
            actor_email: actor.email,
            details: {
              parentPhone: to,
              studentName: recipient.student_name,
              eventTitle: event.title,
              twilioMessageSid: twilioData.sid,
            },
          });

        messages.push({ recipientId: recipient.id, parentPhone: to, twilioMessageSid: twilioData.sid, sentAt: now });
      } catch (error) {
        failed.push({
          recipientId: recipient.id,
          parentPhone: to,
          studentName: recipient.student_name,
          reason: error.message,
        });
        await supabase
          .from("permission_recipients")
          .update({
            sms_status: "Failed",
            sms_error: error.message,
            updated_at: now,
          })
          .eq("id", recipient.id);
      }
    }

    return new Response(JSON.stringify({ sent: true, smsEnabled, messages, skipped, failed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
