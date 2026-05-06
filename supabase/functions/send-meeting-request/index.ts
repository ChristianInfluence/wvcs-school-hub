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

function formatTime(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return new Date(2026, 0, 1, hour, minute).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function buildMessage(
  { request, administrator, slot, calendarInvite, declineNote, type }: Record<string, any>,
  senderEmail: string,
  recipientEmail: string,
) {
  const boundary = `wvcs-${crypto.randomUUID()}`;
  const confirmed = request.status === "confirmed";
  const declined = type === "declined" || request.status === "declined";
  const cancelled = type === "cancelled" || request.status === "cancelled" || request.status === "cancelled-held";
  const subjectPrefix = cancelled
    ? "Cancelled meeting"
    : declined
      ? "Declined meeting request"
      : confirmed
        ? "Confirmed meeting"
        : "Meeting request";
  const subject = `${subjectPrefix}: ${request.teacherName} with ${administrator.name}`;
  const when = `${slot.date} ${formatTime(slot.start)}-${formatTime(slot.end)}`;
  const textBody = [
    declined
      ? `This meeting request has been declined.`
      : cancelled
        ? `This meeting has been cancelled.`
        : confirmed
          ? `This meeting has been confirmed.`
          : `A meeting request has been submitted.`,
    ``,
    `Administrator: ${administrator.name} (${administrator.role})`,
    `Teacher: ${request.teacherName} <${request.teacherEmail}>`,
    `When: ${when}`,
    `Topic: ${request.topic}`,
    ``,
    declined ? `Reason: ${declineNote || request.declineNote || "No reason provided."}` : "",
    cancelled ? `Reason: ${request.cancelNote || request.cancel_note || "No reason provided."}` : "",
    cancelled ? `Time slot: ${request.releasesSlot ? "returned to availability" : "kept unavailable"}` : "",
    declined || cancelled ? `` : "",
    request.notes || "No notes provided.",
  ].join("\r\n");

  const parts = [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipientEmail}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
  ];

  if (calendarInvite && !declined) {
    parts.push(
      "",
      `--${boundary}`,
      "Content-Type: text/calendar; charset=UTF-8; method=REQUEST; name=meeting.ics",
      "Content-Transfer-Encoding: 7bit",
      "Content-Disposition: attachment; filename=meeting.ics",
      "",
      calendarInvite,
    );
  }

  parts.push("", `--${boundary}--`);
  return parts.join("\r\n");
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
    const senderEmail = requiredEnv("GMAIL_SENDER_EMAIL");
    const accessToken = await getAccessToken();
    const recipients = Array.from(new Set([
      payload.administrator?.email,
      payload.request?.teacherEmail,
    ].filter(Boolean)));
    const sentMessages = [];

    for (const recipient of recipients) {
      const raw = encodeBase64Url(buildMessage(payload, senderEmail, recipient));
      const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ raw }),
      });

      if (!response.ok) {
        throw new Error(`Gmail send failed: ${await response.text()}`);
      }

      const data = await response.json();
      sentMessages.push({ recipient, gmailMessageId: data.id });
    }

    return new Response(JSON.stringify({ sent: true, messages: sentMessages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
