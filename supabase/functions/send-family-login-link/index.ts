import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, escapeHtml, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

function sanitizeHeader(value: string) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

async function ensureParentUser(supabase: any, email: string) {
  const { error } = await supabase.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { role: "family_portal" },
  });
  if (error && !String(error.message || "").toLowerCase().includes("already")) throw error;
}

function buildFamilyLoginMessage({ recipientEmail, familyName, actionLink }: { recipientEmail: string; familyName: string; actionLink: string }) {
  const senderEmail = requiredEnv("GMAIL_SENDER_EMAIL");
  const subject = "WVCS Family Portal Sign-In Link";
  const textBody = [
    `Hello ${familyName || "WVCS Family"},`,
    "",
    "Use the secure link below to open your WVCS Family Portal.",
    actionLink,
    "",
    "This link is connected to the parent or guardian email address WVCS has on file.",
    "",
    "Willamette Valley Christian School",
    "9075 Pueblo Ave. NE, Brooks, OR 97305",
    "503-393-5236",
    "wvcs.org",
  ].join("\r\n");

  const htmlBody = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-radius:12px;background:#ffffff;overflow:hidden;box-shadow:0 18px 45px rgba(15,23,42,.12);">
            <tr>
              <td style="padding:24px 28px;background:#0f172a;">
                <div style="color:#93c5fd;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Willamette Valley Christian School</div>
                <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;line-height:1.2;">WVCS Family Portal</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 28px;color:#334155;font-size:15px;line-height:1.6;">
                <p style="margin:0 0 14px;">Hello ${escapeHtml(familyName || "WVCS Family")},</p>
                <p style="margin:0 0 18px;">Use the secure button below to open your WVCS Family Portal.</p>
                <p style="margin:0 0 22px;">
                  <a href="${escapeHtml(actionLink)}" style="display:inline-block;border-radius:10px;background:#0369a1;color:#ffffff;font-weight:800;text-decoration:none;padding:13px 18px;">Open Family Portal</a>
                </p>
                <p style="margin:0;color:#64748b;font-size:13px;line-height:1.6;">This link is connected to the parent or guardian email address WVCS has on file. If you did not request this sign-in link, you can ignore this email.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">
                Willamette Valley Christian School<br>
                9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236 | wvcs.org
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipientEmail}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: multipart/alternative; boundary=\"wvcs-family-login-alt\"",
    "",
    "--wvcs-family-login-alt",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textBody,
    "",
    "--wvcs-family-login-alt",
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
    "",
    "--wvcs-family-login-alt--",
  ].join("\r\n");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email } = await request.json();
    const cleanEmail = normalizeEmail(email || "");
    if (!cleanEmail) throw new Error("Enter the parent or guardian email address WVCS has on file.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: accessRows, error: accessError } = await supabase
      .from("family_portal_access")
      .select("family_name,contact_emails")
      .contains("contact_emails", [cleanEmail])
      .eq("active", true)
      .limit(1);
    if (accessError) throw accessError;
    const access = accessRows?.[0];
    if (!access) throw new Error("No family portal is connected to this email address yet. Please contact the WVCS office.");

    await ensureParentUser(supabase, cleanEmail);

    const origin = request.headers.get("origin") || "https://wvcshub.org";
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: "magiclink",
      email: cleanEmail,
      options: {
        redirectTo: `${origin}/family-login`,
      },
    });
    if (linkError) throw linkError;
    const actionLink = linkData?.properties?.action_link || "";
    if (!actionLink) throw new Error("Unable to create a secure family portal sign-in link.");

    await sendEmail(buildFamilyLoginMessage({ recipientEmail: cleanEmail, familyName: access.family_name || "WVCS Family", actionLink }));

    return new Response(JSON.stringify({ sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ sent: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
