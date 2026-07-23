import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const PERMISSION_PDFS_BUCKET = "permission-slip-pdfs";

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
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read PDF."));
    reader.readAsDataURL(blob);
  });
  return dataUrl.split(",")[1] || "";
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1),
  };
}

function mapRosterStudentToDatabase(student) {
  const { firstName, lastName } = splitName(student.studentName);
  return {
    id: student.id,
    grade: student.grade,
    student_first_name: student.studentFirstName || firstName || null,
    student_last_name: student.studentLastName || lastName || null,
    student_name: student.studentName,
    student,
    updated_at: new Date().toISOString(),
  };
}

function mapRosterParentToDatabase(student, parent, index) {
  const { firstName, lastName } = splitName(parent.parentName);
  return {
    id: parent.id,
    student_id: student.id,
    parent_order: index + 1,
    parent_first_name: parent.parentFirstName || firstName || null,
    parent_last_name: parent.parentLastName || lastName || null,
    parent_name: parent.parentName || null,
    parent_email: parent.parentEmail || null,
    parent_phone: parent.parentPhone || null,
    parent,
    updated_at: new Date().toISOString(),
  };
}

function mapRosterStudentFromDatabase(row, parents) {
  return {
    ...(row.student || {}),
    id: row.id,
    grade: row.grade,
    studentFirstName: row.student_first_name || row.student?.studentFirstName || "",
    studentLastName: row.student_last_name || row.student?.studentLastName || "",
    studentName: row.student_name,
    parents: parents
      .filter((parent) => parent.student_id === row.id)
      .sort((a, b) => (a.parent_order || 0) - (b.parent_order || 0))
      .map((parent) => ({
        ...(parent.parent || {}),
        id: parent.id,
        parentFirstName: parent.parent_first_name || parent.parent?.parentFirstName || "",
        parentLastName: parent.parent_last_name || parent.parent?.parentLastName || "",
        parentName: parent.parent_name || parent.parent?.parentName || "",
        parentEmail: parent.parent_email || parent.parent?.parentEmail || "",
        parentPhone: parent.parent_phone || parent.parent?.parentPhone || "",
      })),
  };
}

function mapEventToDatabase(event, createdByEmail = "") {
  return {
    id: event.id,
    title: event.title || "Untitled Permission Slip",
    destination: event.destination || null,
    event_date: event.eventDate || null,
    parent_intro: event.parentIntro || null,
    trip_information: event.description || null,
    transportation: event.transportation || null,
    emergency_instructions: event.emergencyInstructions || null,
    medical_release: event.medicalRelease || null,
    fields: event.fields || [],
    selected_grades: event.selectedGrades || [],
    selected_student_ids: event.selectedStudentIds || [],
    status: event.status || "Draft",
    event,
    created_by_email: createdByEmail || event.createdByEmail || null,
    updated_at: new Date().toISOString(),
  };
}

function mapEventFromDatabase(row) {
  return {
    ...(row.event || {}),
    id: row.id,
    title: row.title,
    destination: row.destination || row.event?.destination || "",
    eventDate: row.event_date || row.event?.eventDate || "",
    parentIntro: row.parent_intro || row.event?.parentIntro || "",
    description: row.trip_information || row.event?.description || "",
    transportation: row.transportation || row.event?.transportation || "",
    emergencyInstructions: row.emergency_instructions || row.event?.emergencyInstructions || "",
    medicalRelease: row.medical_release || row.event?.medicalRelease || "",
    fields: row.fields || row.event?.fields || [],
    selectedGrades: row.selected_grades || row.event?.selectedGrades || [],
    selectedStudentIds: row.selected_student_ids || row.event?.selectedStudentIds || [],
    status: row.status || row.event?.status || "Draft",
    createdByEmail: row.created_by_email || row.event?.createdByEmail || "",
  };
}

function mapRecipientToDatabase(recipient, eventId) {
  return {
    id: recipient.id,
    event_id: eventId || recipient.eventId,
    student_id: recipient.studentId || null,
    roster_parent_id: recipient.parentContactId || null,
    grade: recipient.grade || null,
    student_name: recipient.studentName,
    parent_name: recipient.parentName || null,
    parent_email: recipient.parentEmail || null,
    parent_phone: recipient.parentPhone || null,
    signing_token: recipient.token,
    status: recipient.status || "Ready",
    delivery_channel: recipient.deliveryChannel || null,
    sent_at: recipient.sentAt || null,
    emailed_at: recipient.emailedAt || null,
    sms_status: recipient.smsStatus || null,
    sms_queued_at: recipient.smsQueuedAt || null,
    sms_sent_at: recipient.smsSentAt || null,
    sms_error: recipient.smsError || null,
    twilio_message_sid: recipient.twilioMessageSid || null,
    viewed_at: recipient.viewedAt || null,
    signed_at: recipient.signedAt || null,
    recipient,
    updated_at: new Date().toISOString(),
  };
}

function mapRecipientFromDatabase(row) {
  return {
    ...(row.recipient || {}),
    id: row.id,
    eventId: row.event_id,
    studentId: row.student_id || row.recipient?.studentId || "",
    parentContactId: row.roster_parent_id || row.recipient?.parentContactId || "",
    grade: row.grade || row.recipient?.grade || "",
    studentName: row.student_name,
    parentName: row.parent_name || row.recipient?.parentName || "",
    parentEmail: row.parent_email || row.recipient?.parentEmail || "",
    parentPhone: row.parent_phone || row.recipient?.parentPhone || "",
    token: row.signing_token,
    status: row.status,
    deliveryChannel: row.delivery_channel || row.recipient?.deliveryChannel || "",
    sentAt: row.sent_at || row.recipient?.sentAt || "",
    emailedAt: row.emailed_at || row.recipient?.emailedAt || "",
    smsStatus: row.sms_status || row.recipient?.smsStatus || "",
    smsQueuedAt: row.sms_queued_at || row.recipient?.smsQueuedAt || "",
    smsSentAt: row.sms_sent_at || row.recipient?.smsSentAt || "",
    smsError: row.sms_error || row.recipient?.smsError || "",
    twilioMessageSid: row.twilio_message_sid || row.recipient?.twilioMessageSid || "",
    viewedAt: row.viewed_at || row.recipient?.viewedAt || "",
    signedAt: row.signed_at || row.recipient?.signedAt || "",
  };
}

function mapSubmissionToDatabase(submission) {
  return {
    id: submission.id,
    event_id: submission.eventId,
    recipient_id: submission.recipientId || null,
    student_id: submission.studentId || null,
    grade: submission.grade || null,
    student_name: submission.studentName || null,
    parent_name: submission.parentName || null,
    parent_email: submission.parentEmail || null,
    signing_token: submission.token || null,
    answers: submission.answers || {},
    signer_name: submission.signerName,
    signature_data_url: submission.signatureDataUrl || null,
    electronic_consent: Boolean(submission.electronicConsent),
    signed_pdf_bucket: submission.signedPdf?.bucket || submission.signedPdfBucket || null,
    signed_pdf_path: submission.signedPdf?.path || submission.signedPdfPath || null,
    parent_copy_email_status: submission.parentCopyEmailStatus || null,
    parent_copy_email_prepared_at: submission.parentCopyEmailPreparedAt || null,
    parent_copy_email_sent_at: submission.parentCopyEmailSentAt || null,
    audit: submission.audit || {},
    submission,
    signed_at: submission.signedAt,
    updated_at: new Date().toISOString(),
  };
}

function mapSubmissionFromDatabase(row) {
  return {
    ...(row.submission || {}),
    id: row.id,
    eventId: row.event_id,
    recipientId: row.recipient_id || row.submission?.recipientId || "",
    studentId: row.student_id || row.submission?.studentId || "",
    grade: row.grade || row.submission?.grade || "",
    studentName: row.student_name || row.submission?.studentName || "",
    parentName: row.parent_name || row.submission?.parentName || "",
    parentEmail: row.parent_email || row.submission?.parentEmail || "",
    token: row.signing_token || row.submission?.token || "",
    answers: row.answers || row.submission?.answers || {},
    signerName: row.signer_name,
    signatureDataUrl: row.signature_data_url || row.submission?.signatureDataUrl || "",
    electronicConsent: row.electronic_consent,
    signedPdf: row.signed_pdf_bucket && row.signed_pdf_path
      ? { bucket: row.signed_pdf_bucket, path: row.signed_pdf_path }
      : row.submission?.signedPdf,
    parentCopyEmailStatus: row.parent_copy_email_status || row.submission?.parentCopyEmailStatus || "",
    parentCopyEmailPreparedAt: row.parent_copy_email_prepared_at || row.submission?.parentCopyEmailPreparedAt || "",
    parentCopyEmailSentAt: row.parent_copy_email_sent_at || row.submission?.parentCopyEmailSentAt || "",
    audit: row.audit || row.submission?.audit || {},
    signedAt: row.signed_at || row.submission?.signedAt,
  };
}

export async function fetchPermissionRoster() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", rosterStudents: [] };
  }

  const [studentsResult, parentsResult] = await Promise.all([
    supabase.from("permission_roster_students").select("*").order("grade").order("student_name"),
    supabase.from("permission_roster_parents").select("*").order("parent_order"),
  ]);

  if (studentsResult.error) throw studentsResult.error;
  if (parentsResult.error) throw parentsResult.error;

  return {
    loaded: true,
    rosterStudents: (studentsResult.data || []).map((student) =>
      mapRosterStudentFromDatabase(student, parentsResult.data || [])
    ),
  };
}

export async function savePermissionRosterStudent(student) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error: studentError } = await supabase
    .from("permission_roster_students")
    .upsert(mapRosterStudentToDatabase(student), { onConflict: "id" });

  if (studentError) throw studentError;

  const parents = (student.parents || []).map((parent, index) => mapRosterParentToDatabase(student, parent, index));
  if (parents.length) {
    const { error: parentsError } = await supabase
      .from("permission_roster_parents")
      .upsert(parents, { onConflict: "id" });
    if (parentsError) throw parentsError;
  }

  return { saved: true };
}

export async function replacePermissionRosterGrade(grade, students) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { data: existingStudents, error: existingError } = await supabase
    .from("permission_roster_students")
    .select("id")
    .eq("grade", grade);

  if (existingError) throw existingError;

  const existingIds = (existingStudents || []).map((student) => student.id);
  if (existingIds.length) {
    const { error: deleteError } = await supabase
      .from("permission_roster_students")
      .delete()
      .in("id", existingIds);
    if (deleteError) throw deleteError;
  }

  for (const student of students) {
    await savePermissionRosterStudent(student);
  }

  return { saved: true };
}

export async function replacePermissionRoster(students) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { data: existingStudents, error: existingError } = await supabase
    .from("permission_roster_students")
    .select("id");

  if (existingError) throw existingError;

  const existingIds = (existingStudents || []).map((student) => student.id);
  if (existingIds.length) {
    const { error: deleteError } = await supabase
      .from("permission_roster_students")
      .delete()
      .in("id", existingIds);
    if (deleteError) throw deleteError;
  }

  for (const student of students) {
    await savePermissionRosterStudent(student);
  }

  return { saved: true };
}

export async function deletePermissionRosterStudent(studentId) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("permission_roster_students")
    .delete()
    .eq("id", studentId);

  if (error) throw error;
  return { saved: true };
}

export async function fetchPermissionEvents() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", events: [] };
  }

  const { data, error } = await supabase
    .from("permission_events")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return { loaded: true, events: (data || []).map(mapEventFromDatabase) };
}

export async function savePermissionEvent(event, createdByEmail = "") {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("permission_events")
    .upsert(mapEventToDatabase(event, createdByEmail), { onConflict: "id" });

  if (error) throw error;
  return { saved: true };
}

export async function deletePermissionEvent(eventId) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("permission_events")
    .delete()
    .eq("id", eventId);

  if (error) throw error;
  return { saved: true };
}

export async function fetchPermissionRecipients(eventId) {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", recipients: [] };
  }

  let query = supabase.from("permission_recipients").select("*").order("student_name");
  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query;
  if (error) throw error;
  return { loaded: true, recipients: (data || []).map(mapRecipientFromDatabase) };
}

export async function savePermissionRecipients(eventId, recipients) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };
  if (!recipients.length) return { saved: true };

  const { error } = await supabase
    .from("permission_recipients")
    .upsert(recipients.map((recipient) => mapRecipientToDatabase(recipient, eventId)), { onConflict: "id" });

  if (error) throw error;
  return { saved: true };
}

export async function deletePermissionRecipient(recipientId) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("permission_recipients")
    .delete()
    .eq("id", recipientId);

  if (error) throw error;
  return { saved: true };
}

export async function fetchPermissionSubmissions(eventId) {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", submissions: [] };
  }

  let query = supabase.from("permission_submissions").select("*").order("signed_at", { ascending: false });
  if (eventId) query = query.eq("event_id", eventId);

  const { data, error } = await query;
  if (error) throw error;
  return { loaded: true, submissions: (data || []).map(mapSubmissionFromDatabase) };
}

export async function savePermissionSubmission(submission) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("permission_submissions")
    .upsert(mapSubmissionToDatabase(submission), { onConflict: "id" });

  if (error) throw error;
  return { saved: true };
}

export async function fetchPermissionSigningData(token) {
  if (!isSupabaseConfigured) {
    return { loaded: false, found: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("permission-signing-data", {
    body: { token },
  });

  if (error) throw error;
  return data || { loaded: true, found: false };
}

export async function submitPermissionSignature({ token, submission, pdfBlob, filename }) {
  if (!isSupabaseConfigured) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const pdfBase64 = pdfBlob ? await blobToBase64(pdfBlob) : "";
  const { data, error } = await supabase.functions.invoke("permission-submit-signature", {
    body: {
      token,
      submission,
      pdfBase64,
      filename,
    },
  });

  if (error) throw error;
  return data || { saved: true };
}

export async function logPermissionAudit(entry) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("permission_audit_log")
    .insert({
      event_id: entry.eventId || null,
      recipient_id: entry.recipientId || null,
      submission_id: entry.submissionId || null,
      action: entry.action,
      actor_email: entry.actorEmail || null,
      actor_label: entry.actorLabel || null,
      details: entry.details || {},
    });

  if (error) throw error;
  return { saved: true };
}

export async function uploadPermissionSignedPdf({ submissionId, filename, blob }) {
  if (!isSupabaseConfigured) return { uploaded: false, reason: "Supabase is not configured." };

  const path = `${sanitizePathPart(submissionId)}/${sanitizePathPart(filename || "signed-permission-slip.pdf")}`;
  const { error } = await supabase.storage
    .from(PERMISSION_PDFS_BUCKET)
    .upload(path, blob, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) throw error;
  return { uploaded: true, bucket: PERMISSION_PDFS_BUCKET, path };
}

export async function uploadPermissionSignatureDataUrl({ submissionId, dataUrl }) {
  if (!isSupabaseConfigured || !dataUrl) return { uploaded: false };

  const path = `${sanitizePathPart(submissionId)}/signature.png`;
  const blob = dataUrlToBlob(dataUrl);
  const { error } = await supabase.storage
    .from(PERMISSION_PDFS_BUCKET)
    .upload(path, blob, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) throw error;
  return { uploaded: true, bucket: PERMISSION_PDFS_BUCKET, path };
}

export async function createPermissionPdfUrl(file) {
  if (!isSupabaseConfigured || !file?.bucket || !file?.path) return "";

  const { data, error } = await supabase.storage
    .from(file.bucket)
    .createSignedUrl(file.path, 60 * 10, {
      download: file.name || undefined,
    });

  if (error) throw error;
  return data?.signedUrl || "";
}

export async function createParentPermissionPdfUrl({ token, submissionId }) {
  if (!isSupabaseConfigured || !token || !submissionId) return "";

  const { data, error } = await supabase.functions.invoke("permission-signed-pdf-url", {
    body: { token, submissionId },
  });

  if (error) throw error;
  return data?.url || "";
}

export async function sendPermissionParentCopyEmail({ submissionId, token = "" }) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-permission-parent-copy", {
    body: { submissionId, token },
  });

  if (error) throw error;
  return data || { sent: true };
}

export async function sendPermissionSigningRequestEmail({ eventId, recipientIds, signingBaseUrl, templateKey = "initial" }) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-permission-signing-request", {
    body: { eventId, recipientIds, signingBaseUrl, templateKey },
  });

  if (error) throw error;
  return data || { sent: true, messages: [] };
}

export async function sendPermissionSigningRequestSms({ eventId, recipientIds, signingBaseUrl }) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-permission-signing-sms", {
    body: { eventId, recipientIds, signingBaseUrl },
  });

  if (error) throw error;
  return data || { sent: true, messages: [] };
}
