import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFosMessage, corsHeaders, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token, entry } = await request.json();
    if (!token) throw new Error("Missing family portal token.");
    if (!entry?.activityDate || !entry?.activity || !Number(entry?.hours)) throw new Error("Missing FOS hour details.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: access, error: accessError } = await supabase
      .from("family_portal_access")
      .select("*")
      .eq("public_token", token)
      .eq("active", true)
      .maybeSingle();

    if (accessError) throw accessError;
    if (!access) throw new Error("Family portal link was not found.");

    const parentEmail = normalizeEmail(entry.parentEmail || access.contact_emails?.[0] || "");
    const row = {
      family_key: access.family_key,
      family_name: access.family_name,
      school_year: "2026-2027",
      parent_name: String(entry.parentName || "").trim(),
      parent_email: parentEmail,
      activity_date: entry.activityDate,
      activity: String(entry.activity || "").trim(),
      notes: String(entry.notes || "").trim(),
      submitted_hours: Number(entry.hours || 0),
      approved_hours: 0,
      status: "Pending",
    };

    const { data: inserted, error: insertError } = await supabase
      .from("fos_hour_entries")
      .insert(row)
      .select("*")
      .single();

    if (insertError) throw insertError;

    if (parentEmail) {
      await sendEmail(
        buildFosMessage({
          recipientEmail: parentEmail,
          subject: `WVCS FOS Hours Received: ${access.family_name}`,
          title: "FOS Hours Received",
          body: [
            `Hello ${entry.parentName || "WVCS Family"},`,
            `We received your FOS hour submission for ${access.family_name}.`,
            `${entry.hours} hour(s) for ${entry.activity} are now pending office verification.`,
            "You will receive another email after the office approves, denies, or adjusts the submission.",
          ],
        }),
      );
    }

    return new Response(JSON.stringify({ submitted: true, entryId: inserted.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ submitted: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
