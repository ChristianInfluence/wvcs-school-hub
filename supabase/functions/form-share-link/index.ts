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

function serviceClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function response(body: Record<string, any>, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(init.headers || {}) },
  });
}

function sanitizeSubmission(payload: Record<string, any>, template: Record<string, any>) {
  const submitterName = String(payload.submitterName || "").trim();
  const submitterEmail = String(payload.submitterEmail || "").trim().toLowerCase();
  if (!submitterName) throw new Error("Missing submitter name.");
  if (!submitterEmail || !submitterEmail.includes("@")) throw new Error("Missing valid submitter email.");

  const answers = payload.answers || {};
  const missingField = (template.fields || []).find((field: Record<string, any>) => {
    if (!field.required) return false;
    const value = answers[field.id];
    if (field.type === "checkbox") return value !== true;
    if (field.type === "file") return !value?.storagePath && !value?.dataUrl;
    if (Array.isArray(value)) return value.length === 0;
    return value === undefined || value === null || value === "";
  });
  if (missingField) throw new Error(`Missing required field: ${missingField.label || "Required field"}`);

  const submittedAt = new Date().toISOString();
  return {
    id: payload.submissionId || `sub-${crypto.randomUUID()}`,
    templateId: template.id,
    templateTitle: template.title,
    submitterName,
    submitterEmail,
    submittedAt,
    status: "Submitted",
    reviewer: "",
    reviewedAt: "",
    reviewNotes: "",
    answers,
    emailStatus: "Pending approval",
    source: "public-share-link",
  };
}

function publicTemplate(template: Record<string, any>) {
  return {
    id: template.id,
    title: template.title,
    category: template.category || "",
    description: template.description || "",
    pdfName: template.pdfName || "",
    fields: template.fields || [],
  };
}

async function loadSharedTemplate(supabase: ReturnType<typeof createClient>, token: string) {
  const { data: share, error: shareError } = await supabase
    .from("form_share_links")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  if (shareError) throw shareError;
  if (!share || !share.active) throw new Error("This form share link is not available.");
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) {
    throw new Error("This form share link has expired.");
  }

  const { data: templateRow, error: templateError } = await supabase
    .from("form_templates")
    .select("*")
    .eq("id", share.template_id)
    .maybeSingle();

  if (templateError) throw templateError;
  if (!templateRow || templateRow.active === false) throw new Error("This form is not currently available.");

  return {
    share,
    template: {
      ...(templateRow.template || {}),
      id: templateRow.id,
      title: templateRow.title,
      category: templateRow.category || "",
      description: templateRow.description || "",
      pdfName: templateRow.pdf_name || templateRow.template?.pdfName || "",
      approver: templateRow.approver || templateRow.template?.approver || "",
      recipients: templateRow.recipients || [],
      finalCopyRecipients: templateRow.final_copy_recipients || [],
      active: templateRow.active,
      fields: templateRow.fields || templateRow.template?.fields || [],
    },
  };
}

async function requireAdmin(request: Request, supabase: ReturnType<typeof createClient>) {
  const bearerToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!bearerToken) throw new Error("Sign in is required to create share links.");

  const { data: userResult, error: userError } = await supabase.auth.getUser(bearerToken);
  if (userError) throw userError;
  const email = userResult.user?.email?.toLowerCase();
  if (!email) throw new Error("Sign in is required to create share links.");

  const { data: access, error: accessError } = await supabase
    .from("staff_access")
    .select("can_use_admin")
    .eq("email", email)
    .maybeSingle();

  if (accessError) throw accessError;
  if (!access?.can_use_admin) throw new Error("Only Forms Admin users can create share links.");
  return email;
}

async function sendSubmissionNotice({
  submission,
  template,
  approvalBaseUrl,
}: {
  submission: Record<string, any>;
  template: Record<string, any>;
  approvalBaseUrl: string;
}) {
  const recipients = Array.from(new Set([...(template.recipients || [])].map((item) => String(item || "").trim()).filter(Boolean)));
  if (!recipients.length) return null;

  const noticeResponse = await fetch(`${requiredEnv("SUPABASE_URL").replace(/\/$/, "")}/functions/v1/send-form-notification`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredEnv("SUPABASE_SERVICE_ROLE_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      submission,
      template,
      status: "Submitted",
      notes: "A shared public form was submitted for approval.",
      recipients,
      attachments: [],
      approvalBaseUrl,
    }),
  });

  if (!noticeResponse.ok) {
    throw new Error(`Submission notice failed: ${await noticeResponse.text()}`);
  }

  return noticeResponse.json();
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await request.json();
    const operation = payload.operation || "preview";
    const supabase = serviceClient();

    if (operation === "create") {
      const creatorEmail = await requireAdmin(request, supabase);
      const templateId = String(payload.templateId || "").trim();
      if (!templateId) throw new Error("Missing templateId.");

      const { data: template, error: templateError } = await supabase
        .from("form_templates")
        .select("id, active")
        .eq("id", templateId)
        .maybeSingle();

      if (templateError) throw templateError;
      if (!template) throw new Error("Form template not found.");

      const token = crypto.randomUUID();
      const { error: insertError } = await supabase
        .from("form_share_links")
        .insert({
          token,
          template_id: templateId,
          created_by_email: creatorEmail,
          expires_at: payload.expiresAt || null,
        });

      if (insertError) throw insertError;

      const baseUrl = String(payload.shareBaseUrl || "").replace(/\/$/, "");
      return response({
        ok: true,
        token,
        url: baseUrl ? `${baseUrl}#/form-share/${encodeURIComponent(token)}` : "",
      });
    }

    const token = String(payload.token || "").trim();
    if (!token) throw new Error("Missing share token.");

    const { template } = await loadSharedTemplate(supabase, token);

    if (operation !== "submit") {
      return response({ ok: true, template: publicTemplate(template) });
    }

    const submission = sanitizeSubmission(payload, template);
    const now = new Date().toISOString();
    const { error: insertError } = await supabase
      .from("form_submissions")
      .upsert(
        {
          id: submission.id,
          template_id: submission.templateId,
          template_title: submission.templateTitle,
          submitter_name: submission.submitterName,
          submitter_email: submission.submitterEmail,
          status: submission.status,
          email_status: submission.emailStatus,
          answers: submission.answers,
          submission,
          submitted_at: submission.submittedAt,
          updated_at: now,
        },
        { onConflict: "id" },
      );

    if (insertError) throw insertError;

    let notice = null;
    let emailWarning = "";
    try {
      notice = await sendSubmissionNotice({
        submission,
        template,
        approvalBaseUrl: payload.approvalBaseUrl || payload.shareBaseUrl || "",
      });
    } catch (noticeError) {
      emailWarning = noticeError.message;
    }

    return response({
      ok: true,
      submission,
      notice,
      emailWarning,
    });
  } catch (error) {
    return response({ ok: false, error: error.message }, { status: 500 });
  }
});
