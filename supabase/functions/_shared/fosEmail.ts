export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

export function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function encodeBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function formatCurrency(value: any) {
  const amount = Number.parseFloat(value);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number.isFinite(amount) ? amount : 0);
}

export function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
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

function sanitizeHeader(value: string) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

export function buildFosMessage({
  recipientEmail,
  subject,
  title,
  body,
  balance,
}: {
  recipientEmail: string;
  subject: string;
  title: string;
  body: string[];
  balance?: Record<string, any>;
}) {
  const senderEmail = requiredEnv("GMAIL_SENDER_EMAIL");
  const balanceLines = balance
    ? [
        `Approved hours: ${balance.approvedHours}`,
        `Remaining hours: ${balance.remainingHours}`,
        `Current FOS balance: ${formatCurrency(balance.remainingBalance)}`,
      ]
    : [];
  const textBody = [
    ...body,
    "",
    ...balanceLines,
    "",
    "Willamette Valley Christian School",
    "9075 Pueblo Ave. NE, Brooks, OR 97305",
    "503-393-5236",
    "wvcs.org",
  ].join("\r\n");

  const htmlBody = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-radius:12px;background:#ffffff;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.12);">
            <tr>
              <td style="padding:24px 28px;background:#0f172a;">
                <div style="color:#93c5fd;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Willamette Valley Christian School</div>
                <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;line-height:1.2;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;color:#334155;font-size:15px;line-height:1.6;">
                ${body.map((line) => `<p style="margin:0 0 14px;">${escapeHtml(line)}</p>`).join("")}
                ${
                  balance
                    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
                        <tr><td style="padding:11px 13px;background:#f8fafc;font-weight:700;">Approved Hours</td><td style="padding:11px 13px;font-weight:800;">${escapeHtml(balance.approvedHours)}</td></tr>
                        <tr><td style="padding:11px 13px;background:#f8fafc;font-weight:700;">Remaining Hours</td><td style="padding:11px 13px;font-weight:800;">${escapeHtml(balance.remainingHours)}</td></tr>
                        <tr><td style="padding:11px 13px;background:#f8fafc;font-weight:700;">Current FOS Balance</td><td style="padding:11px 13px;font-weight:800;">${escapeHtml(formatCurrency(balance.remainingBalance))}</td></tr>
                      </table>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">
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

  return [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipientEmail}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: multipart/alternative; boundary=\"wvcs-fos-alt\"",
    "",
    "--wvcs-fos-alt",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textBody,
    "",
    "--wvcs-fos-alt",
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
    "",
    "--wvcs-fos-alt--",
  ].join("\r\n");
}

export async function sendEmail(rawMessage: string) {
  const accessToken = await getAccessToken();
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodeBase64Url(rawMessage) }),
  });
  if (!response.ok) throw new Error(`Gmail send failed: ${await response.text()}`);
  return await response.json();
}

export function calculateFosBalance(entries: Record<string, any>[]) {
  const approvedHours = entries
    .filter((entry) => entry.status === "Approved" || entry.status === "Adjusted")
    .reduce((total, entry) => total + Number(entry.approved_hours || 0), 0);
  const remainingHours = Math.max(50 - approvedHours, 0);
  const remainingBalance = Math.max(500 - approvedHours * 10, 0);
  return { approvedHours, remainingHours, remainingBalance };
}
