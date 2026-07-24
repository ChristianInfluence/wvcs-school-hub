import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFosMessage, calculateFosBalance, corsHeaders, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

function reviewStatus(action: string) {
  if (action === "approve") return "Approved";
  if (action === "deny") return "Denied";
  if (action === "adjust") return "Adjusted";
  throw new Error("Unknown FOS review action.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const { entryId, review } = await request.json();
    if (!entryId) throw new Error("Missing FOS entry.");
    if (!review?.action) throw new Error("Missing review action.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    const reviewerEmail = normalizeEmail(userData?.user?.email || "");
    if (!reviewerEmail) throw new Error("Missing reviewer identity.");

    const { data: staffRows, error: staffError } = await supabase
      .from("staff_access")
      .select("email, can_use_hub, can_use_admin, can_use_office_payroll")
      .eq("email", reviewerEmail)
      .limit(1);
    if (staffError) throw staffError;
    const staff = staffRows?.[0];
    if (!staff?.can_use_hub || (!staff.can_use_admin && !staff.can_use_office_payroll)) throw new Error("Not authorized.");

    const { data: existing, error: existingError } = await supabase
      .from("fos_hour_entries")
      .select("*")
      .eq("id", entryId)
      .single();
    if (existingError) throw existingError;

    const status = reviewStatus(review.action);
    const approvedHours = status === "Denied" ? 0 : Number(review.approvedHours ?? existing.submitted_hours ?? 0);

    const { data: updated, error: updateError } = await supabase
      .from("fos_hour_entries")
      .update({
        status,
        approved_hours: approvedHours,
        office_note: String(review.officeNote || ""),
        reviewed_at: new Date().toISOString(),
        reviewed_by_email: reviewerEmail,
      })
      .eq("id", entryId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const { data: entries, error: entriesError } = await supabase
      .from("fos_hour_entries")
      .select("*")
      .eq("family_key", updated.family_key)
      .eq("school_year", updated.school_year);
    if (entriesError) throw entriesError;

    const balance = calculateFosBalance(entries || []);
    const recipient = normalizeEmail(updated.parent_email);
    if (recipient) {
      await sendEmail(
        buildFosMessage({
          recipientEmail: recipient,
          subject: `WVCS FOS Hours ${status}: ${updated.family_name}`,
          title: `FOS Hours ${status}`,
          body: [
            `Hello ${updated.parent_name || "WVCS Family"},`,
            `Your FOS submission for ${updated.activity} has been marked ${status.toLowerCase()}.`,
            `Submitted hours: ${Number(updated.submitted_hours || 0)}`,
            `Credited hours: ${Number(updated.approved_hours || 0)}`,
            updated.office_note ? `Office note: ${updated.office_note}` : "Thank you for supporting WVCS.",
          ],
          balance,
        }),
      );
    }

    return new Response(JSON.stringify({ reviewed: true, entry: updated, balance }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ reviewed: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
