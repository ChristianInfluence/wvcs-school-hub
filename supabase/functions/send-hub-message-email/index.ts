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

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function buildHubThreadUrl(hubUrl: string, threadId: string) {
  const baseUrl = String(hubUrl || "").replace(/\/$/, "");
  return `${baseUrl || "https://wvcshub.org"}#/dashboard?message=${encodeURIComponent(threadId)}`;
}

function buildMessage(payload: Record<string, any>, senderEmail: string, recipientEmail: string) {
  const altBoundary = `wvcs-message-alt-${crypto.randomUUID()}`;
  const thread = payload.thread || {};
  const post = payload.post || {};
  const threadUrl = buildHubThreadUrl(payload.hubUrl, thread.id || post.threadId || post.thread_id || "");
  const subject = `Hub message: ${thread.subject || "New message"}`;
  const senderName = post.senderName || post.sender_name || post.senderEmail || post.sender_email || "WVCS staff";
  const body = String(post.body || "").trim();

  const textBody = [
    `${senderName} sent you a message in WVCS School Hub.`,
    "",
    `Subject: ${thread.subject || "New message"}`,
    "",
    body,
    "",
    `Reply in Hub: ${threadUrl}`,
  ].join("\r\n");

  const htmlBody = `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#eef2f7; font-family:Arial, Helvetica, sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; color:transparent;">${escapeHtml(senderName)} sent you a Hub message.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7; padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px; overflow:hidden; border-radius:12px; background:#ffffff; box-shadow:0 18px 45px rgba(15, 23, 42, 0.12);">
            <tr>
              <td style="padding:24px 28px; background:#0f172a;">
                <div style="color:#93c5fd; font-size:12px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;">WVCS School Hub</div>
                <h1 style="margin:8px 0 0; color:#ffffff; font-size:24px; line-height:1.2;">New Hub Message</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;">
                <p style="margin:0 0 18px; color:#334155; font-size:15px; line-height:1.6;">
                  <strong>${escapeHtml(senderName)}</strong> sent you a message.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:20px; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                  <tr>
                    <td style="width:120px; padding:12px 14px; background:#f8fafc; color:#475569; font-size:13px; font-weight:700;">Subject</td>
                    <td style="padding:12px 14px; color:#0f172a; font-size:14px; font-weight:700;">${escapeHtml(thread.subject || "New message")}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 14px; background:#f8fafc; color:#475569; font-size:13px; font-weight:700;">From</td>
                    <td style="padding:12px 14px; color:#0f172a; font-size:14px;">${escapeHtml(senderName)} &lt;${escapeHtml(post.senderEmail || post.sender_email || "")}&gt;</td>
                  </tr>
                </table>
                <div style="margin:18px 0; padding:16px 18px; border-left:4px solid #38bdf8; border-radius:8px; background:#f0f9ff; color:#0f172a; font-size:15px; line-height:1.6; white-space:pre-wrap;">${escapeHtml(body)}</div>
                <div style="margin-top:24px;">
                  <a href="${escapeHtml(threadUrl)}" style="display:inline-block; margin:0 10px 10px 0; padding:12px 18px; border-radius:8px; background:#0284c7; color:#ffffff; font-size:14px; font-weight:800; text-decoration:none;">Reply in Hub</a>
                </div>
                <p style="margin:10px 0 0; color:#64748b; font-size:12px; line-height:1.5;">
                  Use the Hub to keep the conversation stream together.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px; background:#f8fafc; color:#64748b; font-size:12px; line-height:1.5;">
                Sent by WVCS School Hub.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const parts = [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipientEmail}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
    "",
    `--${altBoundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    htmlBody,
    "",
    `--${altBoundary}--`,
  ];

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
    const postSender = normalizeEmail(payload.post?.senderEmail || payload.post?.sender_email || "");
    const recipients = Array.from(
      new Set((payload.recipients || []).map((recipient: string) => normalizeEmail(recipient)).filter(Boolean))
    ).filter((recipient) => recipient !== postSender);
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
