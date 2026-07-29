import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFosMessage, corsHeaders, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

const bucket = "volunteer-driver-documents";

function familyKeyFor(row: Record<string, any>) {
  return String([row.email1, row.email2, row.student_last_name].filter(Boolean).join("|")).replace(/\s+/g, "").toLowerCase();
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

function requireField(registration: Record<string, any>, key: string, label: string) {
  if (!String(registration[key] || "").trim()) throw new Error(`Please complete: ${label}.`);
}

function validateRegistration(registration: Record<string, any>) {
  [
    ["studentId", "Student"],
    ["studentSignature", "Student signature"],
    ["parentSignature", "Parent/guardian signature"],
    ["signatureDate", "Signature date"],
    ["driverLicenseNumber", "Oregon driver's license number"],
    ["vehicleMake", "Vehicle make"],
    ["vehicleModel", "Vehicle model"],
    ["vehicleColor", "Vehicle color"],
    ["licensePlate", "License plate"],
    ["insuranceCompany", "Insurance company"],
    ["policyNumber", "Insurance policy number"],
  ].forEach(([key, label]) => requireField(registration, key, label));
  if (!registration.policyAcknowledged) throw new Error("Please acknowledge the WVCS Student Driver Policy.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) throw new Error("Please sign in before submitting a student driver registration.");

    const { registration, attachments = [] } = await request.json();
    validateRegistration(registration || {});
    if (!attachments.some((file: Record<string, string>) => file.kind === "student_driver_license")) throw new Error("Please attach a picture of the student's driver's license.");
    if (!attachments.some((file: Record<string, string>) => file.kind === "student_insurance_card")) throw new Error("Please attach proof of insurance.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError) throw userError;
    const requesterEmail = normalizeEmail(userData?.user?.email || "");
    if (!requesterEmail) throw new Error("Please sign in before submitting a student driver registration.");

    const { data: access, error: accessError } = await supabase
      .from("family_portal_access")
      .select("*")
      .eq("active", true)
      .contains("contact_emails", [requesterEmail])
      .maybeSingle();
    if (accessError) throw accessError;
    if (!access) throw new Error("This email is not connected to a family portal.");

    const { data: studentRows, error: studentError } = await supabase
      .from("student_directory")
      .select("*")
      .eq("student_id", registration.studentId)
      .eq("active", true)
      .limit(1);
    if (studentError) throw studentError;
    const student = studentRows?.[0];
    if (!student || familyKeyFor(student) !== access.family_key) throw new Error("This student is not connected to your family portal.");

    const submittedAt = new Date().toISOString();
    const registrationId = crypto.randomUUID();
    const uploaded = [];
    for (const file of attachments) {
      const safeName = safePath(file.name || `${file.kind || "attachment"}.jpg`);
      const path = `${safePath(access.family_key)}/${registrationId}/student-driver-${safePath(file.kind || "attachment")}-${safeName}`;
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
      id: registrationId,
      family_key: access.family_key,
      family_name: access.family_name,
      school_year: registration.schoolYear || "2026-2027",
      student_id: student.student_id,
      student_name: [student.student_first_name, student.student_last_name].filter(Boolean).join(" "),
      student_grade: student.grade || "",
      parent_email: requesterEmail,
      status: "Pending",
      registration: {
        ...registration,
        parentEmail: requesterEmail,
        submittedByEmail: requesterEmail,
      },
      attachments: uploaded,
      submitted_at: submittedAt,
      updated_at: submittedAt,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("student_driver_registrations")
      .insert(row)
      .select("*")
      .single();
    if (insertError) throw insertError;

    await supabase.from("drive_backup_jobs").upsert(
      {
        source_type: "student_driver_registration",
        source_id: registrationId,
        status: "pending",
        target_folder_path: [
          "Family Portal",
          "Forms and Driver Records",
          row.school_year,
          row.family_name || "WVCS Family",
        ],
        filename: `${safeFilePart(row.family_name)}_${safeFilePart(row.student_name)}_Student-Driver-Registration_${submittedAt.slice(0, 10)}_Submitted.pdf`,
        metadata: {
          familyKey: row.family_key,
          familyName: row.family_name,
          studentName: row.student_name,
          parentEmail: row.parent_email,
          formTitle: "Student Driver Vehicle Registration",
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
        subject: "WVCS Student Driver Registration Received",
        title: "Student Driver Registration Received",
        body: [
          `Hello ${access.family_name || "WVCS Family"},`,
          `We received the student driver registration for ${row.student_name}.`,
          "The registration and documents are pending office review. You will receive an update after it has been reviewed.",
        ],
      }),
    );

    return new Response(JSON.stringify({ submitted: true, registration: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ submitted: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
