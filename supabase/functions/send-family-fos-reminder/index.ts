import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFosMessage, calculateFosBalance, corsHeaders, formatCurrency, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const { familyKey, recipients } = await request.json();
    const selectedRecipients = (Array.isArray(recipients) ? recipients : []).map((email: string) => normalizeEmail(email)).filter(Boolean);
    if (!familyKey) throw new Error("Missing family record.");
    if (!selectedRecipients.length) throw new Error("Select at least one reminder recipient.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    const requesterEmail = normalizeEmail(userData?.user?.email || "");
    if (!requesterEmail) throw new Error("Missing user identity.");

    const { data: staffRows, error: staffError } = await supabase
      .from("staff_access")
      .select("email, can_use_hub, can_use_admin, can_use_office_payroll")
      .eq("email", requesterEmail)
      .limit(1);
    if (staffError) throw staffError;
    const staff = staffRows?.[0];
    if (!staff?.can_use_hub || (!staff.can_use_admin && !staff.can_use_office_payroll)) throw new Error("Not authorized.");

    const { data: access, error: accessError } = await supabase
      .from("family_portal_access")
      .select("*")
      .eq("family_key", familyKey)
      .eq("active", true)
      .single();
    if (accessError) throw accessError;

    const authorizedRecipients = selectedRecipients.filter((email: string) => (access.contact_emails || []).map(normalizeEmail).includes(email));
    if (!authorizedRecipients.length) throw new Error("Selected recipients must already be authorized for this family portal. Send an invite first.");

    const { data: entries, error: entriesError } = await supabase
      .from("fos_hour_entries")
      .select("*")
      .eq("family_key", familyKey)
      .eq("school_year", "2026-2027");
    if (entriesError) throw entriesError;

    const balance = calculateFosBalance(entries || [], access);
    const loginUrl = `${request.headers.get("origin") || "https://wvcshub.org"}/#/family-login`;

    await Promise.all(
      authorizedRecipients.map((email: string) =>
        sendEmail(
          buildFosMessage({
            recipientEmail: email,
            subject: `WVCS FOS Balance Reminder: ${access.family_name}`,
            title: "FOS Balance Reminder",
            body: [
              `Hello ${access.family_name},`,
              `This is a reminder that your current FOS amount owed is ${formatCurrency(balance.remainingBalance)}.`,
              `You currently have ${balance.approvedHours} approved volunteer hours and ${balance.remainingHours} hours remaining.`,
              "If you have completed volunteer hours that have not yet been reported, please log into your WVCS Family Portal and submit them for office review.",
              loginUrl,
            ],
            balance,
          }),
        )
      ),
    );

    return new Response(JSON.stringify({ sent: true, recipients: authorizedRecipients, balance, loginUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
