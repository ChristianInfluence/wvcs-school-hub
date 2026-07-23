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

function formatCurrency(value: any) {
  const amount = Number.parseFloat(value);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function buildMessage(payload: Record<string, any>, senderEmail: string, recipientEmail: string) {
  const boundary = `wvcs-tuition-${crypto.randomUUID()}`;
  const altBoundary = `wvcs-tuition-alt-${crypto.randomUUID()}`;
  const invoice = payload.invoice || {};
  const attachment = payload.attachment || {};
  const subject = `WVCS Tuition Breakdown: ${invoice.familyName || invoice.title || "Family"}`;
  const greetingName = invoice.parentName || "Parent/Guardian";
  const total = formatCurrency(invoice.total);
  const schoolYear = invoice.schoolYear || "the school year";

  const textBody = [
    `Hello ${greetingName},`,
    "",
    `Attached is your ${schoolYear} tuition breakdown from Willamette Valley Christian School.`,
    `Total listed on the breakdown: ${total}`,
    "",
    "This breakdown is provided for families who may choose to pay tuition in full through the main office and receive the early-pay discount shown on the invoice.",
    "",
    "Please contact the school office with any questions.",
    "",
    "Willamette Valley Christian School",
    "9075 Pueblo Ave. NE, Brooks, OR 97305",
    "503-393-5236",
    "wvcs.org",
  ].join("\r\n");

  const htmlBody = `<!doctype html>
<html>
  <body style="margin:0; padding:0; background:#eef2f7; font-family:Arial, Helvetica, sans-serif;">
    <div style="display:none; max-height:0; overflow:hidden; color:transparent;">Your WVCS tuition breakdown is attached.</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7; padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px; overflow:hidden; border-radius:12px; background:#ffffff; box-shadow:0 18px 45px rgba(15, 23, 42, 0.12);">
            <tr>
              <td style="padding:24px 28px; background:#0f172a;">
                <div style="color:#93c5fd; font-size:12px; font-weight:800; letter-spacing:1.5px; text-transform:uppercase;">Willamette Valley Christian School</div>
                <h1 style="margin:8px 0 0; color:#ffffff; font-size:24px; line-height:1.2;">Tuition Breakdown</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;">
                <p style="margin:0 0 18px; color:#334155; font-size:15px; line-height:1.6;">Hello ${escapeHtml(greetingName)},</p>
                <p style="margin:0 0 18px; color:#334155; font-size:15px; line-height:1.6;">
                  Attached is your ${escapeHtml(schoolYear)} tuition breakdown from Willamette Valley Christian School.
                </p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:20px 0; border:1px solid #e2e8f0; border-radius:10px; overflow:hidden;">
                  <tr>
                    <td style="width:36%; padding:12px 14px; background:#f8fafc; color:#475569; font-size:13px; font-weight:700;">Family</td>
                    <td style="padding:12px 14px; color:#0f172a; font-size:14px; font-weight:700;">${escapeHtml(invoice.familyName || "Family")}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 14px; background:#f8fafc; color:#475569; font-size:13px; font-weight:700;">School Year</td>
                    <td style="padding:12px 14px; color:#0f172a; font-size:14px;">${escapeHtml(schoolYear)}</td>
                  </tr>
                  <tr>
                    <td style="padding:12px 14px; background:#f8fafc; color:#475569; font-size:13px; font-weight:700;">Total</td>
                    <td style="padding:12px 14px; color:#0f172a; font-size:16px; font-weight:800;">${escapeHtml(total)}</td>
                  </tr>
                </table>
                <div style="margin-top:22px; padding:14px 16px; border-left:4px solid #38bdf8; border-radius:8px; background:#f0f9ff; color:#334155; font-size:14px; line-height:1.6;">
                  This breakdown is provided for families who may choose to pay tuition in full through the main office and receive the early-pay discount shown on the invoice.
                </div>
                <p style="margin:20px 0 0; color:#475569; font-size:14px; line-height:1.6;">
                  Please contact the school office with any questions.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px; background:#f8fafc; color:#64748b; font-size:12px; line-height:1.5;">
                Willamette Valley Christian School<br>
                9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236 | wvcs.org
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
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
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

  if (attachment.contentBase64) {
    parts.push(
      "",
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType || "application/pdf"}; name="${sanitizeHeader(attachment.filename || "tuition-breakdown.pdf")}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${sanitizeHeader(attachment.filename || "tuition-breakdown.pdf")}"`,
      "",
      attachment.contentBase64,
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
    const recipients = Array.from(
      new Set((payload.recipients || []).map((recipient: string) => normalizeEmail(recipient)).filter(Boolean))
    );

    if (!recipients.length) throw new Error("No recipient email was provided.");
    if (!payload.attachment?.contentBase64) throw new Error("No tuition breakdown PDF was attached.");

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
