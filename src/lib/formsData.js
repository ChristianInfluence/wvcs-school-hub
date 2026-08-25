import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const FORM_UPLOADS_BUCKET = "form-uploads";
const FORM_PDFS_BUCKET = "form-pdfs";

function isMissingFormCalendarEventsTable(error) {
  const message = String(error?.message || "");
  return message.includes("form_calendar_events") || message.includes("schema cache");
}

function sanitizePathPart(value) {
  return String(value || "file")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "file";
}

function dataUrlToBlob(dataUrl) {
  const [metadata, contentBase64] = dataUrl.split(",");
  const mimeType = metadata?.match(/^data:(.*?);base64$/)?.[1] || "application/octet-stream";
  const binary = atob(contentBase64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function blobToBase64(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return String(dataUrl).split(",")[1];
}

function mapTemplateToDatabase(template) {
  return {
    id: template.id,
    title: template.title,
    category: template.category || null,
    description: template.description || null,
    pdf_name: template.pdfName || null,
    approver: template.approver || null,
    recipients: template.recipients || [],
    final_copy_recipients: template.finalCopyRecipients || [],
    active: template.active !== false,
    fields: template.fields || [],
    template,
    updated_at: new Date().toISOString(),
  };
}

function mapTemplateFromDatabase(row) {
  return {
    ...row.template,
    id: row.id,
    title: row.title,
    category: row.category || "",
    description: row.description || "",
    pdfName: row.pdf_name || row.template?.pdfName || "",
    approver: row.approver || row.template?.approver || "",
    recipients: row.recipients || [],
    finalCopyRecipients: row.final_copy_recipients || [],
    active: row.active,
    fields: row.fields || row.template?.fields || [],
  };
}

export async function fetchFormTemplates() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", templates: [] };
  }

  const { data, error } = await supabase
    .from("form_templates")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return { loaded: true, templates: (data || []).map(mapTemplateFromDatabase) };
}

export async function saveFormTemplate(template) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("form_templates")
    .upsert(mapTemplateToDatabase(template), { onConflict: "id" });

  if (error) throw error;
  return { saved: true };
}

export async function deleteFormTemplate(templateId) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("form_templates")
    .delete()
    .eq("id", templateId);

  if (error) throw error;
  return { saved: true };
}

function mapSubmissionToDatabase(submission) {
  return {
    id: submission.id,
    template_id: submission.templateId,
    template_title: submission.templateTitle,
    submitter_name: submission.submitterName,
    submitter_email: submission.submitterEmail,
    status: submission.status,
    reviewer: submission.reviewer || null,
    reviewed_at: submission.reviewedAt || null,
    review_notes: submission.reviewNotes || null,
    email_status: submission.emailStatus || null,
    emailed_at: submission.emailedAt || null,
    generated_pdf_name: submission.generatedPdfName || null,
    generated_pdf_at: submission.generatedPdfAt || null,
    answers: submission.answers || {},
    approval_signature: submission.approvalSignature || null,
    submission,
    submitted_at: submission.submittedAt,
    updated_at: new Date().toISOString(),
  };
}

function mapSubmissionFromDatabase(row) {
  return {
    ...row.submission,
    id: row.id,
    templateId: row.template_id,
    templateTitle: row.template_title,
    submitterName: row.submitter_name,
    submitterEmail: row.submitter_email,
    submittedAt: row.submitted_at || row.submission?.submittedAt,
    status: row.status,
    reviewer: row.reviewer || "",
    reviewedAt: row.reviewed_at || "",
    reviewNotes: row.review_notes || "",
    answers: row.answers || row.submission?.answers || {},
    emailStatus: row.email_status || row.submission?.emailStatus || "",
    emailedAt: row.emailed_at || row.submission?.emailedAt,
    generatedPdfName: row.generated_pdf_name || row.submission?.generatedPdfName,
    generatedPdfAt: row.generated_pdf_at || row.submission?.generatedPdfAt,
    approvalSignature: row.approval_signature || row.submission?.approvalSignature,
    source: row.submission?.source || "",
  };
}

export async function fetchFormSubmissions() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", submissions: [] };
  }

  const { data, error } = await supabase
    .from("form_submissions")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) throw error;
  return { loaded: true, submissions: (data || []).map(mapSubmissionFromDatabase) };
}

export async function saveFormSubmission(submission) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("form_submissions")
    .upsert(mapSubmissionToDatabase(submission), { onConflict: "id" });

  if (error) throw error;
  return { saved: true };
}

function mapCalendarEventFromDatabase(row) {
  return {
    ...(row.event || {}),
    id: row.id,
    submissionId: row.submission_id,
    templateId: row.template_id || row.event?.templateId || "",
    templateTitle: row.template_title || row.event?.templateTitle || "",
    submitterName: row.submitter_name || row.event?.submitterName || "",
    submitterEmail: row.submitter_email || row.event?.submitterEmail || "",
    title: row.title || row.event?.title || "",
    startAt: row.start_at || row.event?.startAt || "",
    endAt: row.end_at || row.event?.endAt || "",
    allDay: Boolean(row.all_day ?? row.event?.allDay),
    location: row.location || row.event?.location || "",
    description: row.description || row.event?.description || "",
    status: row.status || row.event?.status || "Active",
    createdByEmail: row.created_by_email || row.event?.createdByEmail || "",
    createdAt: row.created_at || row.event?.createdAt || "",
    updatedAt: row.updated_at || row.event?.updatedAt || "",
  };
}

function mapCalendarEventToDatabase(event, createdByEmail = "") {
  const id = event.id || crypto.randomUUID();
  return {
    id,
    submission_id: event.submissionId,
    template_id: event.templateId || null,
    template_title: event.templateTitle || "",
    submitter_name: event.submitterName || "",
    submitter_email: event.submitterEmail || "",
    title: event.title || "WVCS Facilities Use",
    start_at: event.startAt,
    end_at: event.endAt,
    all_day: Boolean(event.allDay),
    location: event.location || null,
    description: event.description || null,
    status: event.status || "Active",
    event: { ...event, id },
    created_by_email: createdByEmail || event.createdByEmail || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchFormCalendarEvents() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", events: [] };
  }

  const { data, error } = await supabase
    .from("form_calendar_events")
    .select("*")
    .order("start_at", { ascending: true });

  if (error) {
    if (isMissingFormCalendarEventsTable(error)) {
      return { loaded: false, reason: "Form calendar events table is not ready yet.", events: [] };
    }
    throw error;
  }
  return { loaded: true, events: (data || []).map(mapCalendarEventFromDatabase) };
}

export async function saveFormCalendarEvents(events = [], createdByEmail = "") {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured.", events: [] };
  if (!events.length) return { saved: true, events: [] };

  const { data, error } = await supabase
    .from("form_calendar_events")
    .upsert(events.map((event) => mapCalendarEventToDatabase(event, createdByEmail)), { onConflict: "id" })
    .select("*");

  if (error) {
    if (isMissingFormCalendarEventsTable(error)) {
      return { saved: false, reason: "Form calendar events table is not ready yet.", events };
    }
    throw error;
  }
  return { saved: true, events: (data || []).map(mapCalendarEventFromDatabase) };
}

export async function uploadFormAnswerFile({ submissionId, fieldId, file }) {
  if (!isSupabaseConfigured || !file?.dataUrl) {
    return { uploaded: false, file };
  }

  const extension = file.name?.includes(".") ? file.name.split(".").pop() : "bin";
  const path = `${sanitizePathPart(submissionId)}/${sanitizePathPart(fieldId)}-${crypto.randomUUID()}.${sanitizePathPart(extension)}`;
  const blob = dataUrlToBlob(file.dataUrl);
  const { error } = await supabase.storage
    .from(FORM_UPLOADS_BUCKET)
    .upload(path, blob, {
      contentType: file.type || blob.type || "application/octet-stream",
      upsert: true,
    });

  if (error) throw error;

  return {
    uploaded: true,
    file: {
      name: file.name,
      type: file.type || blob.type || "application/octet-stream",
      size: file.size || blob.size,
      uploadedAt: new Date().toISOString(),
      storageBucket: FORM_UPLOADS_BUCKET,
      storagePath: path,
    },
  };
}

export async function uploadFormPdfBlob({ submissionId, filename, blob }) {
  if (!isSupabaseConfigured) return { uploaded: false };

  const path = `${sanitizePathPart(submissionId)}/${sanitizePathPart(filename || "approved-form.pdf")}`;
  const { error } = await supabase.storage
    .from(FORM_PDFS_BUCKET)
    .upload(path, blob, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) throw error;
  return { uploaded: true, bucket: FORM_PDFS_BUCKET, path };
}

export async function createStoredFileUrl(file) {
  if (!isSupabaseConfigured || !file?.storageBucket || !file?.storagePath) return "";

  const { data, error } = await supabase.storage
    .from(file.storageBucket)
    .createSignedUrl(file.storagePath, 60 * 10, {
      download: file.name || undefined,
    });

  if (error) throw error;
  return data?.signedUrl || "";
}

export async function storedFileToAttachment(file) {
  if (!isSupabaseConfigured || !file?.storageBucket || !file?.storagePath) return null;

  const { data, error } = await supabase.storage
    .from(file.storageBucket)
    .download(file.storagePath);

  if (error) throw error;
  return {
    filename: file.name || "attachment",
    mimeType: file.type || data.type || "application/octet-stream",
    contentBase64: await blobToBase64(data),
  };
}
