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

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatAnswerValue(field: Record<string, any>, value: any) {
  if (field?.type === "checkbox") return value ? "Yes" : "No";
  if (field?.type === "file") {
    if (!value) return "No file uploaded";
    return [value.name || "Uploaded file", value.type, value.size ? `${value.size} bytes` : ""]
      .filter(Boolean)
      .join(" | ");
  }
  if (Array.isArray(value)) return value.length ? value.join(", ") : "No answer";
  if (value && typeof value === "object") return JSON.stringify(value);
  return value === undefined || value === null || value === "" ? "No answer" : String(value);
}

function buildAnswerLines(submission: Record<string, any>, template: Record<string, any> | null | undefined) {
  const answers = submission?.answers || {};
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  if (!fields.length) {
    return Object.entries(answers).map(([key, value]) => `${key}: ${formatAnswerValue({}, value)}`);
  }
  return fields.map((field) => {
    const label = field.label || field.pdfFieldName || field.id || "Field";
    return `${label}: ${formatAnswerValue(field, answers[field.id])}`;
  });
}

function buildAnswerRows(submission: Record<string, any>, template: Record<string, any> | null | undefined) {
  const answers = submission?.answers || {};
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  if (!fields.length) {
    return Object.entries(answers).map(([key, value]) => ({
      label: key,
      value: formatAnswerValue({}, value),
    }));
  }
  return fields.map((field) => ({
    label: field.label || field.pdfFieldName || field.id || "Field",
    value: formatAnswerValue(field, answers[field.id]),
  }));
}

function buildApprovalUrl(payload: Record<string, any>, token: string) {
  const baseUrl = String(payload.approvalBaseUrl || "").replace(/\/$/, "");
  if (!baseUrl) return "";
  return `${baseUrl}#/form-approval/${encodeURIComponent(token)}`;
}

function buildHtmlEmail({
  payload,
  intro,
  subject,
  answerRows,
  approveUrl,
  rejectUrl,
  notesText,
}: {
  payload: Record<string, any>;
  intro: string;
  subject: string;
  answerRows: Array<{ label: string; value: string }>;
  approveUrl: string;
  rejectUrl: string;
  notesText: string;
}) {
  const { submission, template, status } = payload;
  const statusColor =
    status === "Submitted"
      ? "#0369a1"
      : status === "Approved" || status === "Sent"
        ? "#047857"
        : "#be123c";
  const answerTable = answerRows.length
    ? answerRows
        .map(
          (row) => `
            <tr>
              <td style="width: 34%; padding: 12px 14px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; color: #475569; font-size: 13px; font-weight: 700;">${escapeHtml(row.label)}</td>
              <td style="padding: 12px 14px; border-bottom: 1px solid #e2e8f0; color: #0f172a; font-size: 14px; line-height: 1.45;">${escapeHtml(row.value)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td style="padding: 12px 14px; color: #64748b; font-size: 14px;">No submitted field information was included.</td></tr>`;
  const actionButtons =
    approveUrl || rejectUrl
      ? `
        <div style="margin: 24px 0 4px;">
          <div style="margin-bottom: 12px; color: #334155; font-size: 14px; font-weight: 700;">Review action</div>
          ${approveUrl ? `<a href="${escapeHtml(approveUrl)}" style="display: inline-block; margin: 0 10px 10px 0; padding: 12px 18px; border-radius: 8px; background: #059669; color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none;">Approve form</a>` : ""}
          ${rejectUrl ? `<a href="${escapeHtml(rejectUrl)}" style="display: inline-block; margin: 0 0 10px 0; padding: 12px 18px; border-radius: 8px; background: #e11d48; color: #ffffff; font-size: 14px; font-weight: 800; text-decoration: none;">Deny form</a>` : ""}
          <div style="margin-top: 4px; color: #64748b; font-size: 12px; line-height: 1.5;">These links are intended only for this recipient and can be used once. You will confirm the decision on the next page.</div>
        </div>
      `
      : "";

  return `<!doctype html>
<html>
  <body style="margin: 0; padding: 0; background: #eef2f7; font-family: Arial, Helvetica, sans-serif;">
    <div style="display: none; max-height: 0; overflow: hidden; color: transparent;">${escapeHtml(intro)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background: #eef2f7; padding: 28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width: 720px; overflow: hidden; border-radius: 12px; background: #ffffff; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);">
            <tr>
              <td style="padding: 24px 28px; background: #0f172a;">
                <div style="color: #93c5fd; font-size: 12px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase;">WVCS School Hub</div>
                <h1 style="margin: 8px 0 0; color: #ffffff; font-size: 24px; line-height: 1.2;">${escapeHtml(subject)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding: 24px 28px;">
                <p style="margin: 0 0 18px; color: #334155; font-size: 15px; line-height: 1.6;">${escapeHtml(intro)}</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom: 22px; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                  <tr>
                    <td style="padding: 12px 14px; background: #f8fafc; color: #475569; font-size: 13px; font-weight: 700;">Form</td>
                    <td style="padding: 12px 14px; color: #0f172a; font-size: 14px; font-weight: 700;">${escapeHtml(submission.templateTitle)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 14px; background: #f8fafc; color: #475569; font-size: 13px; font-weight: 700;">Submitter</td>
                    <td style="padding: 12px 14px; color: #0f172a; font-size: 14px;">${escapeHtml(submission.submitterName)} &lt;${escapeHtml(submission.submitterEmail)}&gt;</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 14px; background: #f8fafc; color: #475569; font-size: 13px; font-weight: 700;">Status</td>
                    <td style="padding: 12px 14px; color: ${statusColor}; font-size: 14px; font-weight: 800;">${escapeHtml(status)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 12px 14px; background: #f8fafc; color: #475569; font-size: 13px; font-weight: 700;">Approver</td>
                    <td style="padding: 12px 14px; color: #0f172a; font-size: 14px;">${escapeHtml(template?.approver || submission.reviewer || "Administration")}</td>
                  </tr>
                </table>
                ${actionButtons}
                <div style="margin-top: 24px;">
                  <div style="margin-bottom: 10px; color: #0f172a; font-size: 16px; font-weight: 800;">Submitted information</div>
                  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;">
                    ${answerTable}
                  </table>
                </div>
                <div style="margin-top: 22px; padding: 14px 16px; border-left: 4px solid #38bdf8; border-radius: 8px; background: #f0f9ff;">
                  <div style="margin-bottom: 4px; color: #075985; font-size: 13px; font-weight: 800;">Notes</div>
                  <div style="color: #334155; font-size: 14px; line-height: 1.55;">${escapeHtml(notesText)}</div>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding: 16px 28px; background: #f8fafc; color: #64748b; font-size: 12px; line-height: 1.5;">
                Sent by WVCS School Hub. If a button does not work, use the plain-text link in this email.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function buildMessage(payload: Record<string, any>, senderEmail: string, recipientEmail: string) {
  const boundary = `wvcs-form-${crypto.randomUUID()}`;
  const altBoundary = `wvcs-form-alt-${crypto.randomUUID()}`;
  const { submission, template, status, notes, attachments = [] } = payload;
  const approved = status === "Approved" || status === "Sent";
  const submitted = status === "Submitted";
  const hasAttachments = attachments.length > 0;
  const subject = `${submitted ? "Form submitted for approval" : approved ? "Approved form" : "Form status"}: ${submission.templateTitle}`;
  const answerLines = buildAnswerLines(submission, template);
  const answerRows = buildAnswerRows(submission, template);
  const recipientActions = payload.approvalActions?.[recipientEmail.toLowerCase()] || {};
  const approveUrl = recipientActions.Approved ? buildApprovalUrl(payload, recipientActions.Approved) : "";
  const rejectUrl = recipientActions.Rejected ? buildApprovalUrl(payload, recipientActions.Rejected) : "";
  const approvalLines =
    submitted && (approveUrl || rejectUrl)
      ? [
          "Email approval actions:",
          approveUrl ? `Approve form: ${approveUrl}` : "",
          rejectUrl ? `Deny form: ${rejectUrl}` : "",
          "",
          "These links are intended only for this recipient and can be used once.",
          "",
        ].filter(Boolean)
      : [];
  const intro = submitted
    ? "A form has been submitted and is ready for administrative review."
    : approved
      ? hasAttachments
        ? "A form has been approved. The completed PDF is attached."
        : "A form has been approved. The completed PDF can be generated from the Forms Admin queue."
      : "A form has been reviewed. See the status and notes below.";
  const notesText = notes || submission.reviewNotes || "No notes provided.";
  const textBody = [
    intro,
    "",
    `Form: ${submission.templateTitle}`,
    `Submitter: ${submission.submitterName} <${submission.submitterEmail}>`,
    `Status: ${status}`,
    `Approver: ${template?.approver || submission.reviewer || "Administration"}`,
    "",
    "Submitted information:",
    ...(answerLines.length ? answerLines : ["No submitted field information was included."]),
    "",
    ...approvalLines,
    `Notes: ${notesText}`,
  ].join("\r\n");
  const htmlBody = buildHtmlEmail({
    payload,
    intro,
    subject,
    answerRows,
    approveUrl,
    rejectUrl,
    notesText,
  });

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

  for (const attachment of attachments) {
    parts.push(
      "",
      `--${boundary}`,
      `Content-Type: ${attachment.mimeType || "application/octet-stream"}; name="${sanitizeHeader(attachment.filename)}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${sanitizeHeader(attachment.filename)}"`,
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

async function createApprovalActions(payload: Record<string, any>, recipients: string[]) {
  if (payload.status !== "Submitted" || !payload.submission?.id || !payload.approvalBaseUrl) return {};

  const supabase = createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString();
  const actionRows = recipients.flatMap((recipientEmail) =>
    ["Approved", "Rejected"].map((action) => ({
      token: crypto.randomUUID(),
      submission_id: payload.submission.id,
      template_id: payload.submission.templateId || payload.template?.id || null,
      recipient_email: recipientEmail.toLowerCase(),
      action,
      expires_at: expiresAt,
    }))
  );

  if (!actionRows.length) return {};

  const { data, error } = await supabase
    .from("form_approval_actions")
    .insert(actionRows)
    .select("token, recipient_email, action");

  if (error) throw error;

  return (data || []).reduce((actions: Record<string, Record<string, string>>, row: Record<string, string>) => {
    actions[row.recipient_email] = {
      ...(actions[row.recipient_email] || {}),
      [row.action]: row.token,
    };
    return actions;
  }, {});
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
      new Set((payload.recipients || []).map((recipient: string) => String(recipient || "").trim()).filter(Boolean))
    );
    payload.approvalActions = await createApprovalActions(payload, recipients);
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
