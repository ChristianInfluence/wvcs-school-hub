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

function buildClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function summarizeAnswers(submission: Record<string, any>, template: Record<string, any> | null | undefined) {
  const answers = submission?.answers || {};
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  return fields.map((field) => ({
    label: field.label || field.pdfFieldName || field.id || "Field",
    value: answers[field.id],
    type: field.type || "text",
  }));
}

function formatActionStatus(action: Record<string, any>, submission: Record<string, any>) {
  const now = Date.now();
  if (action.used_at) return { valid: false, reason: "This approval link has already been used." };
  if (new Date(action.expires_at).getTime() < now) return { valid: false, reason: "This approval link has expired." };
  if (submission.status !== "Submitted") {
    return { valid: false, reason: `This form is already ${submission.status}.` };
  }
  return { valid: true, reason: "" };
}

function uniqueEmails(values: string[]) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

async function sendStatusNotification({
  submission,
  template,
  status,
  notes,
}: {
  submission: Record<string, any>;
  template: Record<string, any> | null | undefined;
  status: string;
  notes: string;
}) {
  const templateRecipients = Array.isArray(template?.recipients) ? template.recipients : [];
  const finalCopyRecipients = Array.isArray(template?.finalCopyRecipients) ? template.finalCopyRecipients : [];
  const recipients =
    status === "Approved"
      ? uniqueEmails([submission.submitterEmail, ...templateRecipients, ...finalCopyRecipients])
      : uniqueEmails([submission.submitterEmail, ...templateRecipients]);

  if (!recipients.length) return null;

  const response = await fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/send-form-notification`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      submission,
      template,
      status,
      notes,
      recipients,
      attachments: [],
    }),
  });

  if (!response.ok) {
    throw new Error(`Status email failed: ${await response.text()}`);
  }

  return response.json();
}

async function loadAction(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: action, error: actionError } = await supabase
    .from("form_approval_actions")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (actionError) throw actionError;
  if (!action) throw new Error("Approval link not found.");

  const { data: submissionRow, error: submissionError } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("id", action.submission_id)
    .maybeSingle();

  if (submissionError) throw submissionError;
  if (!submissionRow) throw new Error("Form submission not found.");

  const { data: template, error: templateError } = await supabase
    .from("form_templates")
    .select("*")
    .eq("id", submissionRow.template_id)
    .maybeSingle();

  if (templateError) throw templateError;

  const submission = {
    ...(submissionRow.submission || {}),
    id: submissionRow.id,
    templateId: submissionRow.template_id,
    templateTitle: submissionRow.template_title,
    submitterName: submissionRow.submitter_name,
    submitterEmail: submissionRow.submitter_email,
    submittedAt: submissionRow.submitted_at || submissionRow.submission?.submittedAt,
    status: submissionRow.status,
    answers: submissionRow.answers || submissionRow.submission?.answers || {},
  };
  const templateData = template?.template || template;

  return { action, submissionRow, submission, template: templateData };
}

function response(body: Record<string, any>, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await request.json();
    const token = String(payload.token || "").trim();
    if (!token) throw new Error("Missing approval token.");

    const supabase = buildClient();
    const loaded = await loadAction(supabase, token);
    const validity = formatActionStatus(loaded.action, loaded.submission);

    if (payload.operation !== "resolve") {
      return response({
        ok: true,
        action: loaded.action.action,
        recipientEmail: loaded.action.recipient_email,
        valid: validity.valid,
        reason: validity.reason,
        submission: {
          id: loaded.submission.id,
          templateTitle: loaded.submission.templateTitle,
          submitterName: loaded.submission.submitterName,
          submitterEmail: loaded.submission.submitterEmail,
          submittedAt: loaded.submission.submittedAt,
          status: loaded.submission.status,
        },
        answers: summarizeAnswers(loaded.submission, loaded.template),
      });
    }

    if (!validity.valid) {
      return response({ ok: false, reason: validity.reason, status: loaded.submission.status }, { status: 409 });
    }

    const reviewedAt = new Date().toISOString();
    const reviewNotes =
      String(payload.notes || "").trim() ||
      `${loaded.action.action} from email by ${loaded.action.recipient_email}.`;
    const approvalSignature =
      loaded.action.action === "Approved"
        ? {
            type: "email-action",
            value: loaded.action.recipient_email,
            signedAt: reviewedAt,
            signerRole: loaded.template?.approver || "Administration",
          }
        : loaded.submissionRow.approval_signature || loaded.submission.approvalSignature || null;
    const nextSubmission = {
      ...(loaded.submissionRow.submission || {}),
      id: loaded.submission.id,
      templateId: loaded.submission.templateId,
      templateTitle: loaded.submission.templateTitle,
      submitterName: loaded.submission.submitterName,
      submitterEmail: loaded.submission.submitterEmail,
      submittedAt: loaded.submission.submittedAt,
      answers: loaded.submission.answers,
      status: loaded.action.action,
      reviewer: loaded.action.recipient_email,
      reviewedAt,
      reviewNotes,
      emailStatus:
        loaded.action.action === "Approved"
          ? "Approved from email; completed PDF still needs to be generated"
          : "Rejected from email",
      approvalSignature,
    };

    const { error: updateError } = await supabase
      .from("form_submissions")
      .update({
        status: loaded.action.action,
        reviewer: loaded.action.recipient_email,
        reviewed_at: reviewedAt,
        review_notes: reviewNotes,
        email_status: nextSubmission.emailStatus,
        approval_signature: approvalSignature,
        submission: nextSubmission,
        updated_at: reviewedAt,
      })
      .eq("id", loaded.action.submission_id)
      .eq("status", "Submitted");

    if (updateError) throw updateError;

    const { error: tokenError } = await supabase
      .from("form_approval_actions")
      .update({ used_at: reviewedAt })
      .eq("token", token);

    if (tokenError) throw tokenError;

    let statusEmail = null;
    let emailWarning = "";
    try {
      statusEmail = await sendStatusNotification({
        submission: nextSubmission,
        template: loaded.template,
        status: loaded.action.action,
        notes: reviewNotes,
      });
    } catch (emailError) {
      emailWarning = emailError.message;
    }

    return response({
      ok: true,
      status: loaded.action.action,
      reviewedAt,
      statusEmail,
      emailWarning,
      message:
        loaded.action.action === "Approved"
          ? "The form was approved. The completed PDF can be generated from the Forms Admin queue."
          : "The form was rejected.",
    });
  } catch (error) {
    return response({ ok: false, error: error.message }, { status: 500 });
  }
});
