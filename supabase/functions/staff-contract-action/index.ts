import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { recordEmailAudit } from "../_shared/emailAudit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "mconniry@wvcs.org";

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function normalizeEmail(value: string) {
  return String(value || "").trim().toLowerCase();
}

function sanitizeHeader(value: string) {
  return String(value || "").replace(/[\r\n]/g, " ").trim();
}

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function encodeBase64Url(value: string) {
  return btoa(unescape(encodeURIComponent(value)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function safePart(value: string) {
  return String(value || "WVCS")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "WVCS";
}

function money(value: unknown) {
  const amount = Number.parseFloat(String(value || "0"));
  return Number.isFinite(amount) ? amount : 0;
}

function mapRow(row: Record<string, any>) {
  return {
    id: row.id,
    staffName: row.staff_name || "",
    staffEmail: row.staff_email || "",
    schoolYear: row.school_year || "",
    positionTitle: row.position_title || "",
    contractStart: row.contract_start || "",
    contractEnd: row.contract_end || "",
    boardMeetingDate: row.board_meeting_date || "",
    fte: Number(row.fte ?? 1),
    baseSalary: Number(row.base_salary ?? 32000),
    yearsAtWvcs: Number(row.years_at_wvcs || 0),
    hasMasters: Boolean(row.has_masters),
    hasStateCertification: Boolean(row.has_state_certification),
    customAdjustments: row.custom_adjustments || [],
    compensation: row.compensation || {},
    adminSignature: row.admin_signature || {},
    staffSignature: row.staff_signature || {},
    boardSignature: row.board_signature || {},
    status: row.status || "Draft",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

async function requesterEmail(supabase: ReturnType<typeof createClient>, request: Request) {
  const authHeader = request.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return "";
  const { data } = await supabase.auth.getUser(jwt);
  return normalizeEmail(data?.user?.email || "");
}

async function requireAdmin(supabase: ReturnType<typeof createClient>, request: Request) {
  const email = await requesterEmail(supabase, request);
  if (email !== ADMIN_EMAIL) throw new Error("Only Matthew can manage staff contracts.");
  return email;
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
  if (!response.ok) throw new Error(`Google token refresh failed: ${await response.text()}`);
  const data = await response.json();
  return data.access_token;
}

function buildMessage({
  contract,
  recipient,
  signer,
  signingUrl,
  senderEmail,
}: {
  contract: Record<string, any>;
  recipient: string;
  signer: string;
  signingUrl: string;
  senderEmail: string;
}) {
  const subject = signer === "board"
    ? `WVCS Board Signature Needed: ${contract.staff_name}`
    : `WVCS Staff Contract Ready for Signature`;
  const title = signer === "board" ? "Board Signature Requested" : "Staff Contract Ready";
  const intro = signer === "board"
    ? `The staff contract packet for ${contract.staff_name} has been signed by the administrator and staff member and is ready for board chair signature.`
    : `Your WVCS staff contract packet for ${contract.school_year} is ready for your review and electronic signature.`;
  const textBody = [
    `Hello,`,
    "",
    intro,
    "",
    `Open contract packet: ${signingUrl}`,
    "",
    "Willamette Valley Christian School",
    "9075 Pueblo Ave. NE, Brooks, OR 97305",
    "503-393-5236",
  ].join("\r\n");
  const htmlBody = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#eef2f7;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:680px;border-radius:12px;overflow:hidden;background:#ffffff;box-shadow:0 18px 45px rgba(15,23,42,.12);">
          <tr><td style="background:#0f172a;padding:24px 28px;">
            <div style="color:#93c5fd;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;">Willamette Valley Christian School</div>
            <h1 style="margin:8px 0 0;color:#ffffff;font-size:24px;line-height:1.2;">${escapeHtml(title)}</h1>
          </td></tr>
          <tr><td style="padding:26px 28px;color:#334155;font-size:15px;line-height:1.6;">
            <p style="margin:0 0 16px;">${escapeHtml(intro)}</p>
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;">
              <tr><td style="padding:12px 14px;background:#f8fafc;font-weight:700;color:#475569;">Staff Member</td><td style="padding:12px 14px;color:#0f172a;font-weight:700;">${escapeHtml(contract.staff_name)}</td></tr>
              <tr><td style="padding:12px 14px;background:#f8fafc;font-weight:700;color:#475569;">School Year</td><td style="padding:12px 14px;color:#0f172a;font-weight:700;">${escapeHtml(contract.school_year)}</td></tr>
            </table>
            <a href="${escapeHtml(signingUrl)}" style="display:inline-block;border-radius:9px;background:#0284c7;padding:12px 18px;color:#ffffff;font-size:14px;font-weight:800;text-decoration:none;">Review and Sign</a>
            <p style="margin:20px 0 0;color:#64748b;font-size:13px;">This secure signing link is intended only for ${escapeHtml(recipient)}.</p>
          </td></tr>
          <tr><td style="padding:16px 28px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.5;">Willamette Valley Christian School<br>9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236 | wvcs.org</td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
  return [
    `From: WVCS School Hub <${senderEmail}>`,
    `To: ${recipient}`,
    `Reply-To: ${ADMIN_EMAIL}`,
    `Subject: ${sanitizeHeader(subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: multipart/alternative; boundary=\"wvcs-contract-alt\"",
    "",
    "--wvcs-contract-alt",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    textBody,
    "",
    "--wvcs-contract-alt",
    "Content-Type: text/html; charset=UTF-8",
    "",
    htmlBody,
    "",
    "--wvcs-contract-alt--",
  ].join("\r\n");
}

async function sendEmail(contract: Record<string, any>, recipient: string, signer: string, signingUrl: string) {
  const senderEmail = requiredEnv("GMAIL_SENDER_EMAIL");
  const accessToken = await getAccessToken();
  const raw = encodeBase64Url(buildMessage({ contract, recipient, signer, signingUrl, senderEmail }));
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }),
  });
  if (!response.ok) throw new Error(`Gmail send failed: ${await response.text()}`);
  return response.json();
}

function contractTotal(row: Record<string, any>) {
  const compensation = row.compensation || {};
  if (money(compensation.annualSalary)) return money(compensation.annualSalary);
  const fte = Math.min(Math.max(Number(row.fte ?? 1), 0), 1);
  const custom = Array.isArray(row.custom_adjustments) ? row.custom_adjustments : [];
  return money(row.base_salary) * fte +
    (Number(row.years_at_wvcs || 0) * 100) +
    (row.has_masters ? 600 : 0) +
    (row.has_state_certification ? 600 : 0) +
    custom.reduce((sum, item) => sum + money(item.amount), 0);
}

async function queueFinalBackup(supabase: ReturnType<typeof createClient>, row: Record<string, any>) {
  await supabase.from("drive_backup_jobs").upsert(
    {
      source_type: "staff_contract",
      source_id: row.id,
      status: "pending",
      target_folder_path: ["Staff Contracts", row.school_year || "School Year", safePart(row.staff_name || "Staff Member")],
      filename: `${safePart(row.staff_name).replace(/\s+/g, "-")}_Staff-Contract-Packet_${row.school_year || "School-Year"}_Fully-Signed.pdf`,
      metadata: {
        staffName: row.staff_name,
        staffEmail: row.staff_email,
        schoolYear: row.school_year,
        annualSalary: contractTotal(row),
      },
      updated_at: new Date().toISOString(),
    },
    { onConflict: "source_type,source_id,filename" },
  );
  await supabase.from("staff_contracts").update({ pdf_backup_queued_at: new Date().toISOString() }).eq("id", row.id);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await request.json().catch(() => ({}));
    const action = payload.action || "";
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

    if (action === "get-token") {
      const token = String(payload.token || "").trim();
      if (!token) throw new Error("Missing signing token.");
      const { data, error } = await supabase
        .from("staff_contracts")
        .select("*")
        .or(`staff_token.eq.${token},board_token.eq.${token}`)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Contract signing link is not available.");
      const signer = data.staff_token === token ? "staff" : "board";
      return new Response(JSON.stringify({ ok: true, signer, contract: mapRow(data) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "sign-token") {
      const token = String(payload.token || "").trim();
      const signerName = String(payload.signerName || "").trim();
      if (!token || !signerName) throw new Error("Please type your full name before signing.");
      const { data, error } = await supabase
        .from("staff_contracts")
        .select("*")
        .or(`staff_token.eq.${token},board_token.eq.${token}`)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Contract signing link is not available.");
      const now = new Date().toISOString();
      const signer = data.staff_token === token ? "staff" : "board";
      const patch = signer === "staff"
        ? {
            staff_signature: { name: signerName, email: data.staff_email, role: "Staff Member", signedAt: now },
            status: "Staff Signed",
          }
        : {
            board_signature: { name: signerName, role: "Board Chair", signedAt: now },
            status: "Complete",
          };
      const { data: updated, error: updateError } = await supabase
        .from("staff_contracts")
        .update({ ...patch, updated_at: now })
        .eq("id", data.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      if (signer === "board") await queueFinalBackup(supabase, updated);
      return new Response(JSON.stringify({ ok: true, signer, contract: mapRow(updated) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "send") {
      const actorEmail = await requireAdmin(supabase, request);
      const contractId = String(payload.contractId || "");
      const signer = String(payload.signer || "");
      const { data, error } = await supabase.from("staff_contracts").select("*").eq("id", contractId).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Contract record was not found.");
      if (signer === "staff" && !data.admin_signature?.name) throw new Error("Sign as administrator before sending to staff.");
      if (signer === "board" && !data.staff_signature?.name) throw new Error("The staff member must sign before sending to the board chair.");
      const recipient = signer === "board" ? normalizeEmail(payload.boardEmail || "") : normalizeEmail(data.staff_email || "");
      if (!recipient) throw new Error("Enter a recipient email address.");
      const token = signer === "board" ? data.board_token : data.staff_token;
      const siteUrl = Deno.env.get("SITE_URL") || "https://wvcshub.org";
      const signingUrl = `${siteUrl.replace(/\/$/, "")}/#/staff-contract-sign/${encodeURIComponent(token)}`;
      const sent = await sendEmail(data, recipient, signer, signingUrl);
      const nextStatus = signer === "board" ? "Sent to Board" : "Sent to Staff";
      const { data: updated, error: updateError } = await supabase
        .from("staff_contracts")
        .update({ status: nextStatus, updated_by_email: actorEmail, updated_at: new Date().toISOString() })
        .eq("id", data.id)
        .select("*")
        .single();
      if (updateError) throw updateError;
      await recordEmailAudit({
        module: "Staff Contracts",
        subject: signer === "board" ? `WVCS Board Signature Needed: ${data.staff_name}` : "WVCS Staff Contract Ready for Signature",
        recipients: [recipient],
        senderEmail: requiredEnv("GMAIL_SENDER_EMAIL"),
        actorEmail,
        status: "sent",
        messageIds: [sent.id],
        metadata: { contractId: data.id, staffName: data.staff_name, signer },
      });
      return new Response(JSON.stringify({ ok: true, contract: mapRow(updated) }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    throw new Error("Unsupported staff contract action.");
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
