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

function buildApprovalUrl(payload: Record<string, any>, token: string) {
  const baseUrl = String(payload.approvalBaseUrl || "").replace(/\/$/, "");
  if (!baseUrl) return "";
  return `${baseUrl}#/form-approval/${encodeURIComponent(token)}`;
}

function buildMessage(payload: Record<string, any>, senderEmail: string, recipientEmail: string) {
  const boundary = `wvcs-form-${crypto.randomUUID()}`;
  const { submission, template, status, notes, attachments = [] } = payload;
  const approved = status === "Approved" || status === "Sent";
  const submitted = status === "Submitted";
  const hasAttachments = attachments.length > 0;
  const subject = `${submitted ? "Form submitted for approval" : approved ? "Approved form" : "Form status"}: ${submission.templateTitle}`;
  const answerLines = buildAnswerLines(submission, template);
  const recipientActions = payload.approvalActions?.[recipientEmail.toLowerCase()] || {};
  const approvalLines =
    submitted && (recipientActions.Approved || recipientActions.Rejected)
      ? [
          "Email approval actions:",
          recipientActions.Approved ? `Approve form: ${buildApprovalUrl(payload, recipientActions.Approved)}` : "",
          recipientActions.Rejected ? `Reject form: ${buildApprovalUrl(payload, recipientActions.Rejected)}` : "",
          "",
          "These links are intended only for this recipient and can be used once.",
          "",
        ].filter(Boolean)
      : [];
  const textBody = [
    submitted
      ? "A form has been submitted and is ready for administrative review."
      : approved
        ? hasAttachments
          ? "A form has been approved. The completed PDF is attached."
          : "A form has been approved. The completed PDF can be generated from the Forms Admin queue."
        : "A form has been reviewed. See the status and notes below.",
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
    `Notes: ${notes || submission.reviewNotes || "No notes provided."}`,
  ].join("\r\n");

  const parts = [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipientEmail}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 7bit",
    "",
    textBody,
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
