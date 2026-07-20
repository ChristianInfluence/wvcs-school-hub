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

function mapRecipient(row: Record<string, any>) {
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
    viewedAt: row.viewed_at || row.recipient?.viewedAt || "",
    signedAt: row.signed_at || row.recipient?.signedAt || "",
  };
}

function mapEvent(row: Record<string, any>) {
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
  };
}

function mapSubmission(row: Record<string, any> | null) {
  if (!row) return null;
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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await request.json();
    if (!token) throw new Error("Missing signing token.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: recipient, error: recipientError } = await supabase
      .from("permission_recipients")
      .select("*")
      .eq("signing_token", token)
      .maybeSingle();

    if (recipientError) throw recipientError;
    if (!recipient) {
      return new Response(JSON.stringify({ loaded: true, found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: event, error: eventError } = await supabase
      .from("permission_events")
      .select("*")
      .eq("id", recipient.event_id)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!event) throw new Error("Permission event not found.");

    let submissionQuery = supabase
      .from("permission_submissions")
      .select("*")
      .eq("event_id", recipient.event_id)
      .order("signed_at", { ascending: false })
      .limit(1);

    submissionQuery = recipient.student_id
      ? submissionQuery.eq("student_id", recipient.student_id)
      : submissionQuery.eq("recipient_id", recipient.id);

    const { data: submissions, error: submissionError } = await submissionQuery;
    if (submissionError) throw submissionError;

    if (!recipient.viewed_at && recipient.status !== "Signed") {
      const now = new Date().toISOString();
      await supabase
        .from("permission_recipients")
        .update({ status: "Viewed", viewed_at: now, updated_at: now })
        .eq("id", recipient.id);
      recipient.status = "Viewed";
      recipient.viewed_at = now;
    }

    return new Response(JSON.stringify({
      loaded: true,
      found: true,
      event: mapEvent(event),
      recipient: mapRecipient(recipient),
      submission: mapSubmission(submissions?.[0] || null),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ loaded: false, found: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
