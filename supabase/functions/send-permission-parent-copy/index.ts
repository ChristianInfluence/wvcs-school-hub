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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function buildMessage({
  senderEmail,
  recipientEmail,
  submission,
  event,
  attachment,
}: {
  senderEmail: string;
  recipientEmail: string;
  submission: Record<string, any>;
  event: Record<string, any> | null;
  attachment: { filename: string; mimeType: string; contentBase64: string };
}) {
  const boundary = `wvcs-permission-${crypto.randomUUID()}`;
  const eventTitle = event?.title || submission.student_name || "Field Trip";
  const subject = `Signed WVCS Permission Slip: ${eventTitle}`;
  const textBody = [
    `Dear ${submission.parent_name || submission.signer_name || "Parent/Guardian"},`,
    "",
    `Thank you for signing the WVCS permission slip for ${submission.student_name || "your student"}.`,
    "",
    "A PDF copy of the signed permission slip is attached for your records.",
    "",
    `Field Trip: ${eventTitle}`,
    `Student: ${submission.student_name || ""}`,
    `Signed by: ${submission.signer_name || ""}`,
    `Signed on: ${submission.signed_at ? new Date(submission.signed_at).toLocaleString("en-US", { timeZone: "America/Los_Angeles" }) : ""}`,
    "",
    "Willamette Valley Christian School",
    "9075 Pueblo Ave NE, Brooks, OR 97305",
    "TEL: 503-393-5236",
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
    "",
    `--${boundary}`,
    `${"Content-Type"}: ${attachment.mimeType}; name="${sanitizeHeader(attachment.filename)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${sanitizeHeader(attachment.filename)}"`,
    "",
    attachment.contentBase64,
    "",
    `--${boundary}--`,
  ];

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await request.json();
    const submissionId = payload.submissionId;
    if (!submissionId) throw new Error("Missing submissionId.");

    const supabase = createClient(
      requiredEnv("SUPABASE_URL"),
      requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );

    const { data: submission, error: submissionError } = await supabase
      .from("permission_submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();

    if (submissionError) throw submissionError;
    if (!submission) throw new Error(`Permission submission not found: ${submissionId}`);
    if (!submission.parent_email) throw new Error("Submission does not have a parent email.");
    if (!submission.signed_pdf_bucket || !submission.signed_pdf_path) {
      throw new Error("Submission does not have a stored signed PDF.");
    }

    const { data: event, error: eventError } = await supabase
      .from("permission_events")
      .select("*")
      .eq("id", submission.event_id)
      .maybeSingle();

    if (eventError) throw eventError;

    const { data: pdfBlob, error: downloadError } = await supabase.storage
      .from(submission.signed_pdf_bucket)
      .download(submission.signed_pdf_path);

    if (downloadError) throw downloadError;

    const contentBase64 = arrayBufferToBase64(await pdfBlob.arrayBuffer());
    const filename = submission.signed_pdf_path.split("/").pop() || "signed-permission-slip.pdf";
    const senderEmail = requiredEnv("GMAIL_SENDER_EMAIL");
    const accessToken = await getAccessToken();
    const raw = encodeBase64Url(buildMessage({
      senderEmail,
      recipientEmail: submission.parent_email,
      submission,
      event,
      attachment: {
        filename,
        mimeType: pdfBlob.type || "application/pdf",
        contentBase64,
      },
    }));

    const gmailResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });

    if (!gmailResponse.ok) {
      throw new Error(`Gmail send failed: ${await gmailResponse.text()}`);
    }

    const gmailData = await gmailResponse.json();
    const sentAt = new Date().toISOString();

    await supabase
      .from("permission_submissions")
      .update({
        parent_copy_email_status: "Sent",
        parent_copy_email_sent_at: sentAt,
        updated_at: sentAt,
      })
      .eq("id", submissionId);

    await supabase
      .from("permission_audit_log")
      .insert({
        event_id: submission.event_id,
        recipient_id: submission.recipient_id,
        submission_id: submissionId,
        action: "parent_copy_email_sent",
        actor_label: "WVCS School Hub",
        details: {
          recipientEmail: submission.parent_email,
          gmailMessageId: gmailData.id,
          signedPdfPath: submission.signed_pdf_path,
        },
      });

    return new Response(JSON.stringify({
      sent: true,
      recipient: submission.parent_email,
      gmailMessageId: gmailData.id,
      sentAt,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
