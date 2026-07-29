import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFosMessage, corsHeaders, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

function reviewStatus(action: string) {
  if (action === "approve") return "Approved";
  if (action === "deny") return "Denied";
  if (action === "correction") return "Needs Correction";
  if (action === "revoke") return "Revoked";
  throw new Error("Unknown student driver review action.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    const { registrationId, review } = await request.json();
    if (!registrationId) throw new Error("Missing student driver registration.");
    if (!review?.action) throw new Error("Missing review action.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null }, error: null };
    if (userError) throw userError;
    const reviewerEmail = normalizeEmail(userData?.user?.email || "");
    if (!reviewerEmail) throw new Error("Missing reviewer identity.");

    const { data: staffRows, error: staffError } = await supabase
      .from("staff_access")
      .select("email, can_use_hub, can_manage_users, can_use_office_payroll")
      .eq("email", reviewerEmail)
      .limit(1);
    if (staffError) throw staffError;
    const staff = staffRows?.[0];
    if (
      reviewerEmail !== "mconniry@wvcs.org" &&
      (!staff?.can_use_hub || (!staff.can_use_office_payroll && !staff.can_manage_users))
    ) throw new Error("Not authorized.");

    const status = reviewStatus(review.action);
    const reviewedAt = new Date();
    const expiresAt = status === "Approved"
      ? new Date(reviewedAt.getFullYear() + 1, reviewedAt.getMonth(), reviewedAt.getDate()).toISOString()
      : null;

    const { data: updated, error: updateError } = await supabase
      .from("student_driver_registrations")
      .update({
        status,
        office_note: String(review.officeNote || ""),
        reviewed_at: reviewedAt.toISOString(),
        reviewed_by_email: reviewerEmail,
        expires_at: expiresAt,
        updated_at: reviewedAt.toISOString(),
      })
      .eq("id", registrationId)
      .select("*")
      .single();
    if (updateError) throw updateError;

    const recipient = normalizeEmail(updated.parent_email);
    if (recipient) {
      await sendEmail(
        buildFosMessage({
          recipientEmail: recipient,
          subject: `WVCS Student Driver Registration ${status}`,
          title: `Student Driver Registration ${status}`,
          body: [
            `Hello ${updated.family_name || "WVCS Family"},`,
            status === "Approved"
              ? `${updated.student_name}'s WVCS student driver registration has been approved through ${new Date(expiresAt || "").toLocaleDateString()}.`
              : status === "Needs Correction"
                ? `${updated.student_name}'s WVCS student driver registration needs a correction before it can be approved.`
                : `${updated.student_name}'s WVCS student driver registration status is ${status}.`,
            updated.office_note ? `Office note: ${updated.office_note}` : "Please contact the WVCS office with any questions.",
          ],
        }),
      );
    }

    return new Response(JSON.stringify({ reviewed: true, registration: updated }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ reviewed: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
