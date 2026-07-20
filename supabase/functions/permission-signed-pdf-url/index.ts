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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, submissionId } = await request.json();
    if (!token || !submissionId) throw new Error("Missing token or submissionId.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: recipient, error: recipientError } = await supabase
      .from("permission_recipients")
      .select("*")
      .eq("signing_token", token)
      .maybeSingle();
    if (recipientError) throw recipientError;
    if (!recipient) throw new Error("Permission signing link not found.");

    const { data: submission, error: submissionError } = await supabase
      .from("permission_submissions")
      .select("*")
      .eq("id", submissionId)
      .maybeSingle();
    if (submissionError) throw submissionError;
    if (!submission?.signed_pdf_bucket || !submission?.signed_pdf_path) throw new Error("Signed PDF not found.");

    const sameEvent = submission.event_id === recipient.event_id;
    const sameStudent = recipient.student_id
      ? submission.student_id === recipient.student_id
      : submission.recipient_id === recipient.id;
    if (!sameEvent || !sameStudent) throw new Error("This link cannot access that signed PDF.");

    const { data, error } = await supabase.storage
      .from(submission.signed_pdf_bucket)
      .createSignedUrl(submission.signed_pdf_path, 60 * 10, { download: false });
    if (error) throw error;

    return new Response(JSON.stringify({ url: data?.signedUrl || "" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ url: "", error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
