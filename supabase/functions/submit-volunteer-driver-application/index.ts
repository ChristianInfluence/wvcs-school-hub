import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { typedSignatureRecord } from "../_shared/eSignature.ts";
import { buildFosMessage, corsHeaders, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

const bucket = "volunteer-driver-documents";
const MIN_PERSON = 100000;
const MIN_ACCIDENT = 300000;
const MIN_PROPERTY = 50000;

function money(value: unknown) {
  const amount = Number.parseFloat(String(value || "0").replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

function safePath(value: string) {
  return String(value || "file").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "file";
}

function safeFilePart(value: string) {
  return String(value || "WVCS")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100) || "WVCS";
}

function dataUrlToBlob(file: Record<string, string>) {
  const content = String(file.contentBase64 || "").trim();
  if (!content) throw new Error(`Missing upload content for ${file.label || file.name || "attachment"}.`);
  const bytes = Uint8Array.from(atob(content), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: file.mimeType || "application/octet-stream" });
}

function validateApplication(application: Record<string, any>) {
  const required = [
    ["parentName", "Driver name"],
    ["driverLicenseNumber", "Driver's license number"],
    ["licenseExpiration", "Driver's license expiration"],
    ["phoneHome", "Phone"],
    ["address", "Address"],
    ["car1ModelYear", "Vehicle model/year"],
    ["car1Seatbelts", "Number of working seatbelts"],
    ["car1LicensePlate", "Vehicle license plate"],
    ["car1InsuranceCompany", "Insurance company"],
    ["car1PolicyNumber", "Insurance policy number"],
  ];
  const missing = required.filter(([key]) => !String(application[key] || "").trim()).map(([, label]) => label);
  if (missing.length) throw new Error(`Please complete: ${missing.join(", ")}.`);
  if (money(application.liabilityPerPerson) < MIN_PERSON) throw new Error("Liability coverage must be at least $100,000 per person.");
  if (money(application.liabilityPerAccident) < MIN_ACCIDENT) throw new Error("Liability coverage must be at least $300,000 per accident.");
  if (money(application.propertyDamage) < MIN_PROPERTY) throw new Error("Property damage coverage must be at least $50,000.");
  if (!application.requirementsAcknowledged) throw new Error("Please acknowledge the WVCS minimum insurance requirements.");
  if (!application.truthAcknowledged) throw new Error("Please certify that the information submitted is accurate.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) throw new Error("Please sign in before submitting a volunteer driver application.");

    const { application, attachments = [] } = await request.json();
    validateApplication(application || {});
    if (!attachments.some((file: Record<string, string>) => file.kind === "driver_license")) throw new Error("Please attach a picture of your driver's license.");
    if (!attachments.some((file: Record<string, string>) => file.kind === "insurance_card")) throw new Error("Please attach a picture of your insurance card.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError) throw userError;
    const requesterEmail = normalizeEmail(userData?.user?.email || "");
    if (!requesterEmail) throw new Error("Please sign in before submitting a volunteer driver application.");

    const { data: access, error: accessError } = await supabase
      .from("family_portal_access")
      .select("*")
      .eq("active", true)
      .contains("contact_emails", [requesterEmail])
      .maybeSingle();
    if (accessError) throw accessError;
    if (!access) throw new Error("This email is not connected to a family portal.");

    const submittedAt = new Date().toISOString();
    const applicationId = crypto.randomUUID();
    const uploaded = [];
    for (const file of attachments) {
      const safeName = safePath(file.name || `${file.kind || "attachment"}.jpg`);
      const path = `${safePath(access.family_key)}/${applicationId}/${safePath(file.kind || "attachment")}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(path, dataUrlToBlob(file), { contentType: file.mimeType || "application/octet-stream", upsert: true });
      if (uploadError) throw uploadError;
      uploaded.push({
        kind: file.kind || "attachment",
        label: file.label || file.kind || "Attachment",
        name: file.name || safeName,
        mimeType: file.mimeType || "",
        size: file.size || 0,
        bucket,
        path,
      });
    }

    const row = {
      id: applicationId,
      family_key: access.family_key,
      family_name: access.family_name,
      school_year: application.schoolYear || "2026-2027",
      parent_name: String(application.parentName || "").trim(),
      parent_email: requesterEmail,
      status: "Pending",
      application: {
        ...application,
        parentEmail: requesterEmail,
        submittedByEmail: requesterEmail,
        signedAt: submittedAt,
        signatures: {
          driver: typedSignatureRecord({
            name: application.electronicSignature || application.parentName || "",
            email: requesterEmail,
            role: "Volunteer Driver",
            signedAt: submittedAt,
            agreementText: "I certify that this volunteer driver application is accurate and agree that typing my name records my electronic signature.",
            request,
          }),
        },
        minimumRequirements: {
          liabilityPerPerson: MIN_PERSON,
          liabilityPerAccident: MIN_ACCIDENT,
          propertyDamage: MIN_PROPERTY,
        },
      },
      attachments: uploaded,
      submitted_at: submittedAt,
      updated_at: submittedAt,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("volunteer_driver_applications")
      .insert(row)
      .select("*")
      .single();
    if (insertError) throw insertError;

    await supabase.from("drive_backup_jobs").upsert(
      {
        source_type: "volunteer_driver_application",
        source_id: applicationId,
        status: "pending",
        target_folder_path: [
          "Family Portal",
          "Forms and Driver Records",
          row.school_year,
          row.family_name || "WVCS Family",
        ],
        filename: `${safeFilePart(row.family_name)}_${safeFilePart(row.parent_name)}_Volunteer-Driver-Application_${submittedAt.slice(0, 10)}_Submitted.pdf`,
        metadata: {
          familyKey: row.family_key,
          familyName: row.family_name,
          parentName: row.parent_name,
          parentEmail: row.parent_email,
          formTitle: "Volunteer Driver Application",
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_type,source_id,filename" },
    ).then(({ error }) => {
      if (error) console.warn("Drive backup queue failed:", error.message);
    });

    await sendEmail(
      buildFosMessage({
        recipientEmail: requesterEmail,
        subject: `WVCS Volunteer Driver Application Received`,
        title: "Volunteer Driver Application Received",
        body: [
          `Hello ${row.parent_name || "WVCS Family"},`,
          "We received your volunteer driver application and documents.",
          "Your application is pending office verification. You will receive an update after it has been reviewed.",
        ],
      }),
    );

    return new Response(JSON.stringify({ submitted: true, application: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ submitted: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
