import { createClient } from "npm:@supabase/supabase-js@2";
import { typedSignatureRecord } from "../_shared/eSignature.ts";

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

function isFacilitiesUsageTemplate(template: Record<string, any> | null | undefined) {
  const title = String(template?.title || "").toLowerCase();
  return (title.includes("facility") || title.includes("facilities")) && title.includes("usage");
}

function normalizeRepeatableDateAnswer(value: any) {
  if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.entries)) {
    return value.entries.map((entry: any) => ({
      date: entry?.date || "",
      startTime: entry?.startTime || "",
      endTime: entry?.endTime || "",
    }));
  }
  if (Array.isArray(value)) {
    return value.map((item) => typeof item === "object" ? item : { date: item || "", startTime: "", endTime: "" });
  }
  return [{ date: value || "", startTime: "", endTime: "" }];
}

function renderAnswerValue(value: any) {
  if (value && typeof value === "object" && "name" in value) return value.name || "";
  if (value && typeof value === "object" && Array.isArray(value.entries)) {
    return normalizeRepeatableDateAnswer(value)
      .filter((entry) => entry.date || entry.startTime || entry.endTime)
      .map((entry) => [entry.date, [entry.startTime, entry.endTime].filter(Boolean).join(" - ")].filter(Boolean).join(" "))
      .join(", ");
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value || "");
}

function parsePacificDateTime(dateValue: string, timeValue = "") {
  const dateText = String(dateValue || "").trim();
  const dateMatch = dateText.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!dateMatch) return null;
  const timeMatch = String(timeValue || "").match(/(\d{1,2}):(\d{2})/);
  const month = Number(dateMatch[2]);
  const offset = month >= 3 && month <= 10 ? "-07:00" : "-08:00";
  const time = `${String(timeMatch ? Number(timeMatch[1]) : 9).padStart(2, "0")}:${String(timeMatch ? Number(timeMatch[2]) : 0).padStart(2, "0")}:00`;
  const parsed = new Date(`${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T${time}${offset}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildFacilitiesCalendarEvents({
  submission,
  template,
  reviewedAt,
  createdByEmail,
}: {
  submission: Record<string, any>;
  template: Record<string, any> | null | undefined;
  reviewedAt: string;
  createdByEmail: string;
}) {
  if (!isFacilitiesUsageTemplate(template)) return [];
  const answers = submission?.answers || {};
  const fields = Array.isArray(template?.fields) ? template.fields : [];
  const answerList = fields.map((field) => ({
    label: field.label || field.pdfFieldName || field.id || "Field",
    value: answers[field.id],
    type: field.type || "text",
  }));
  const dateAnswer = answerList.find((answer) => {
    const label = String(answer.label || "").toLowerCase();
    return answer.type === "date" || answer.type === "dateTime" || label.includes("date") || label.includes("day");
  });
  if (!dateAnswer) return [];
  const timeAnswer = answerList.find((answer) => {
    const label = String(answer.label || "").toLowerCase();
    return answer.type === "time" || label.includes("time") || label.includes("start");
  });
  const locationAnswer = answerList.find((answer) => {
    const label = String(answer.label || "").toLowerCase();
    return ["facility", "location", "room", "space", "area"].some((term) => label.includes(term));
  });
  const answerLines = answerList.map((answer) => `${answer.label}: ${renderAnswerValue(answer.value)}`).join("\n");
  return normalizeRepeatableDateAnswer(dateAnswer.value)
    .filter((entry) => entry.date)
    .map((entry, index) => {
      const start = parsePacificDateTime(entry.date, entry.startTime || timeAnswer?.value);
      if (!start) return null;
      const hasTime = Boolean(entry.startTime || timeAnswer?.value);
      const explicitEnd = entry.endTime ? parsePacificDateTime(entry.date, entry.endTime) : null;
      const end = explicitEnd || new Date(start.getTime() + (hasTime ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000));
      return {
        id: `${submission.id}-calendar-${index + 1}`,
        submission_id: submission.id,
        template_id: submission.templateId || null,
        template_title: submission.templateTitle || template?.title || "Facilities Use Request",
        submitter_name: submission.submitterName || "",
        submitter_email: submission.submitterEmail || "",
        title: `${submission.templateTitle || template?.title || "Facilities Use"} - ${submission.submitterName || "WVCS"}`,
        start_at: start.toISOString(),
        end_at: end.toISOString(),
        all_day: !hasTime,
        location: renderAnswerValue(locationAnswer?.value) || null,
        description: [
          `Approved WVCS facilities request: ${submission.templateTitle || template?.title || "Facilities Use"}`,
          `Submitted by: ${submission.submitterName || ""} <${submission.submitterEmail || ""}>`,
          `Approved at: ${new Date(reviewedAt).toLocaleString()}`,
          "",
          answerLines,
        ].join("\n"),
        status: "Active",
        created_by_email: createdByEmail || null,
        updated_at: reviewedAt,
      };
    })
    .filter(Boolean);
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

function formatApproverIdentity(name: string, email: string) {
  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim();
  if (trimmedName && trimmedEmail) return `${trimmedName} <${trimmedEmail}>`;
  return trimmedName || trimmedEmail || "Administration";
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
        template: {
          id: loaded.template?.id || loaded.submission.templateId,
          title: loaded.template?.title || loaded.submission.templateTitle,
          fields: loaded.template?.fields || [],
        },
        answers: summarizeAnswers(loaded.submission, loaded.template),
      });
    }

    if (!validity.valid) {
      return response({ ok: false, reason: validity.reason, status: loaded.submission.status }, { status: 409 });
    }

    const reviewedAt = new Date().toISOString();
    const approverName = String(payload.signerName || "").trim();
    const approverEmail = loaded.action.recipient_email;
    const approverIdentity = formatApproverIdentity(approverName, approverEmail);
    const reviewNotes =
      String(payload.notes || "").trim() ||
      `${loaded.action.action} from email by ${approverIdentity}.`;
    const approvalSignature =
      loaded.action.action === "Approved"
        ? {
            ...typedSignatureRecord({
              name: approverName || approverEmail,
              email: approverEmail,
              role: loaded.template?.approver || "Administration",
              signedAt: reviewedAt,
              agreementText: "I reviewed this form submission and agree that this approval action records my electronic signature.",
              request,
            }),
            type: "email-action",
            value: approverIdentity,
            signerName: approverName || null,
            signerEmail: approverEmail,
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
      reviewer: approverIdentity,
      reviewedAt,
      reviewNotes,
      emailStatus:
        loaded.action.action === "Approved"
          ? "Approved from email; completed PDF still needs to be generated"
          : "Rejected from email",
      approvalSignature,
    };

    const { data: updatedRows, error: updateError } = await supabase
      .from("form_submissions")
      .update({
        status: loaded.action.action,
        reviewer: approverIdentity,
        reviewed_at: reviewedAt,
        review_notes: reviewNotes,
        email_status: nextSubmission.emailStatus,
        approval_signature: approvalSignature,
        submission: nextSubmission,
        updated_at: reviewedAt,
      })
      .eq("id", loaded.action.submission_id)
      .eq("status", "Submitted")
      .select("id,status");

    if (updateError) throw updateError;
    if (!updatedRows?.length) {
      throw new Error("The approval was not saved because the submission was no longer pending. Refresh the Forms Admin queue and try again.");
    }

    const calendarRows = loaded.action.action === "Approved"
      ? buildFacilitiesCalendarEvents({
          submission: nextSubmission,
          template: loaded.template,
          reviewedAt,
          createdByEmail: approverEmail,
        })
      : [];
    let calendarEvents: Record<string, any>[] = [];
    let calendarWarning = "";
    if (calendarRows.length) {
      try {
        const { data: savedCalendarRows, error: calendarError } = await supabase
          .from("form_calendar_events")
          .upsert(calendarRows, { onConflict: "id" })
          .select("*");
        if (calendarError) throw calendarError;
        calendarEvents = savedCalendarRows || [];
      } catch (error) {
        calendarWarning = error.message || "Calendar records could not be created.";
      }
    }

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
      calendarEvents: calendarEvents.map((event) => ({
        id: event.id,
        submissionId: event.submission_id,
        title: event.title,
        startAt: event.start_at,
        endAt: event.end_at,
        allDay: event.all_day,
        location: event.location,
        description: event.description,
        status: event.status,
      })),
      statusEmail,
      emailWarning,
      calendarWarning,
      message:
        loaded.action.action === "Approved"
          ? "The form was approved. The completed PDF can be generated from the Forms Admin queue."
          : "The form was rejected.",
    });
  } catch (error) {
    return response({ ok: false, error: error.message }, { status: 500 });
  }
});
