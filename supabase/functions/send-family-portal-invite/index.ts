import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFosMessage, corsHeaders, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

function makeToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "").slice(0, 4)}`;
}

async function ensureParentUser(supabase: any, email: string) {
  const { error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: "family_portal" },
  });
  if (error && !String(error.message || "").toLowerCase().includes("already")) throw error;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const { family, currentUserEmail, recipients } = await request.json();
    const familyKey = String(family?.familyKey || "").trim();
    const familyName = String(family?.familyName || "WVCS Family").trim();
    const rosterEmails = (family?.parents || [])
      .map((parent: { email?: string }) => normalizeEmail(parent.email || ""))
      .filter(Boolean);
    const selectedRecipients = (Array.isArray(recipients) && recipients.length ? recipients : rosterEmails)
      .map((email: string) => normalizeEmail(email))
      .filter((email: string) => rosterEmails.includes(email));

    if (!familyKey) throw new Error("Missing family record.");
    if (!rosterEmails.length) throw new Error("No roster parent emails are attached to this family.");
    if (!selectedRecipients.length) throw new Error("No valid invite recipients were selected.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    const requesterEmail = normalizeEmail(userData?.user?.email || currentUserEmail || "");
    if (!requesterEmail) throw new Error("Missing user identity.");

    const { data: staffRows, error: staffError } = await supabase
      .from("staff_access")
      .select("email, can_use_hub, can_use_admin, can_use_office_payroll")
      .eq("email", requesterEmail)
      .limit(1);
    if (staffError) throw staffError;
    const staff = staffRows?.[0];
    if (!staff?.can_use_hub || (!staff.can_use_admin && !staff.can_use_office_payroll)) throw new Error("Not authorized.");

    const { data: existing, error: existingError } = await supabase
      .from("family_portal_access")
      .select("public_token")
      .eq("family_key", familyKey)
      .maybeSingle();
    if (existingError) throw existingError;

    const { data: access, error: upsertError } = await supabase
      .from("family_portal_access")
      .upsert(
        {
          family_key: familyKey,
          family_name: familyName,
          contact_emails: rosterEmails,
          public_token: existing?.public_token || makeToken(),
          active: true,
          updated_by_email: requesterEmail,
          ...(existing ? {} : { created_by_email: requesterEmail }),
        },
        { onConflict: "family_key" },
      )
      .select("family_key,family_name,contact_emails")
      .single();
    if (upsertError) throw upsertError;

    const loginUrl = `${request.headers.get("origin") || "https://wvcshub.org"}/#/family-login`;

    await Promise.all(
      selectedRecipients.map(async (email: string) => {
        await ensureParentUser(supabase, email);
        await sendEmail(
          buildFosMessage({
            recipientEmail: email,
            subject: `WVCS Family Portal Invitation: ${familyName}`,
            title: "WVCS Family Portal Invitation",
            body: [
              `Hello ${familyName},`,
              "WVCS has enabled your secure Family Portal account. This portal will show family invoices, FOS volunteer hours, and future family account tools.",
              "Use the Family Portal login page below and enter this email address. The system will send a one-time login code to your email.",
              loginUrl,
              "For your family's privacy, portal access is only available to parent/guardian emails already attached to your family record at WVCS.",
            ],
          }),
        );
      }),
    );

    return new Response(JSON.stringify({ sent: true, access, recipients: selectedRecipients, loginUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
