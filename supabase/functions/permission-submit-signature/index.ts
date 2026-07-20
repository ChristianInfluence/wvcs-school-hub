import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const bucket = "permission-slip-pdfs";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function sanitizePathPart(value: string) {
  return String(value || "file").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 90) || "file";
}

function base64ToBytes(value: string) {
  const clean = String(value || "").includes(",") ? String(value).split(",").pop() || "" : String(value || "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function mapSubmission(row: Record<string, any>) {
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
    signedPdf: row.signed_pdf_bucket && row.signed_pdf_path ? { bucket: row.signed_pdf_bucket, path: row.signed_pdf_path } : row.submission?.signedPdf,
    parentCopyEmailStatus: row.parent_copy_email_status || row.submission?.parentCopyEmailStatus || "",
    parentCopyEmailPreparedAt: row.parent_copy_email_prepared_at || row.submission?.parentCopyEmailPreparedAt || "",
    parentCopyEmailSentAt: row.parent_copy_email_sent_at || row.submission?.parentCopyEmailSentAt || "",
    audit: row.audit || row.submission?.audit || {},
    signedAt: row.signed_at || row.submission?.signedAt,
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await request.json();
    const token = payload.token;
    const submission = payload.submission || {};
    if (!token) throw new Error("Missing signing token.");
    if (!submission.signerName || !submission.signatureDataUrl || !submission.electronicConsent) {
      throw new Error("Missing required signature fields.");
    }

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: recipient, error: recipientError } = await supabase
      .from("permission_recipients")
      .select("*")
      .eq("signing_token", token)
      .maybeSingle();
    if (recipientError) throw recipientError;
    if (!recipient) throw new Error("Permission signing link not found.");

    const { data: event, error: eventError } = await supabase
      .from("permission_events")
      .select("*")
      .eq("id", recipient.event_id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) throw new Error("Permission event not found.");

    let existingQuery = supabase
      .from("permission_submissions")
      .select("*")
      .eq("event_id", recipient.event_id)
      .order("signed_at", { ascending: false })
      .limit(1);
    existingQuery = recipient.student_id ? existingQuery.eq("student_id", recipient.student_id) : existingQuery.eq("recipient_id", recipient.id);
    const { data: existingSubmissions, error: existingError } = await existingQuery;
    if (existingError) throw existingError;
    if (existingSubmissions?.[0]) {
      return new Response(JSON.stringify({ saved: true, alreadySigned: true, submission: mapSubmission(existingSubmissions[0]) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signedAt = submission.signedAt || new Date().toISOString();
    const submissionId = submission.id || crypto.randomUUID();
    const filename = sanitizePathPart(payload.filename || "signed-permission-slip.pdf");
    const pdfBytes = base64ToBytes(payload.pdfBase64);
    if (!pdfBytes.length) throw new Error("Missing signed PDF.");
    const pdfPath = `${sanitizePathPart(submissionId)}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(pdfPath, new Blob([pdfBytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;

    const savedSubmission = {
      ...submission,
      id: submissionId,
      eventId: event.id,
      recipientId: recipient.id,
      studentId: recipient.student_id || recipient.id,
      grade: recipient.grade || "",
      studentName: recipient.student_name,
      parentName: recipient.parent_name,
      parentEmail: recipient.parent_email,
      token,
      electronicConsent: true,
      signedAt,
      signedPdf: { bucket, path: pdfPath, name: filename },
    };

    const row = {
      id: submissionId,
      event_id: event.id,
      recipient_id: recipient.id,
      student_id: recipient.student_id || recipient.id,
      grade: recipient.grade || null,
      student_name: recipient.student_name,
      parent_name: recipient.parent_name || null,
      parent_email: recipient.parent_email || null,
      signing_token: token,
      answers: submission.answers || {},
      signer_name: String(submission.signerName || "").trim(),
      signature_data_url: submission.signatureDataUrl,
      electronic_consent: true,
      signed_pdf_bucket: bucket,
      signed_pdf_path: pdfPath,
      parent_copy_email_status: submission.parentCopyEmailStatus || null,
      parent_copy_email_prepared_at: submission.parentCopyEmailPreparedAt || null,
      audit: submission.audit || {},
      submission: savedSubmission,
      signed_at: signedAt,
      updated_at: signedAt,
    };

    const { data: inserted, error: upsertError } = await supabase
      .from("permission_submissions")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();
    if (upsertError) throw upsertError;

    await supabase
      .from("permission_recipients")
      .update({ status: "Signed", signed_at: signedAt, updated_at: signedAt })
      .eq("id", recipient.id);

    await supabase.from("permission_audit_log").insert({
      event_id: event.id,
      recipient_id: recipient.id,
      submission_id: submissionId,
      action: "permission_signed",
      actor_label: String(submission.signerName || "").trim(),
      details: { ...(submission.audit || {}), signedPdf: { bucket, path: pdfPath } },
    });

    return new Response(JSON.stringify({ saved: true, submission: mapSubmission(inserted) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ saved: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
