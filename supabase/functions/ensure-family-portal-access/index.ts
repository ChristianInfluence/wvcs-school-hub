import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, normalizeEmail, requiredEnv } from "../_shared/fosEmail.ts";

function makeToken() {
  return `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "").slice(0, 4)}`;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const { family, currentUserEmail } = await request.json();
    const familyKey = String(family?.familyKey || "").trim();
    const familyName = String(family?.familyName || "WVCS Family").trim();
    const contactEmails = (family?.parents || [])
      .map((parent: { email?: string }) => normalizeEmail(parent.email || ""))
      .filter(Boolean);

    if (!familyKey) throw new Error("Missing family record.");

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
      .select("family_key, family_name, contact_emails, public_token")
      .eq("family_key", familyKey)
      .maybeSingle();
    if (existingError) throw existingError;

    const nextRecord = {
      family_key: familyKey,
      family_name: familyName,
      contact_emails: contactEmails,
      public_token: existing?.public_token || makeToken(),
      active: true,
      updated_by_email: requesterEmail,
      ...(existing ? {} : { created_by_email: requesterEmail }),
    };

    const { data: access, error: upsertError } = await supabase
      .from("family_portal_access")
      .upsert(nextRecord, { onConflict: "family_key" })
      .select("family_key, family_name, contact_emails, public_token")
      .single();
    if (upsertError) throw upsertError;

    return new Response(JSON.stringify({ ready: true, access }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ready: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
