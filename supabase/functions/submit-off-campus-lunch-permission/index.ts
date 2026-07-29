import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildFosMessage, corsHeaders, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

function familyKeyFor(row: Record<string, any>) {
  return String([row.email1, row.email2, row.student_last_name].filter(Boolean).join("|")).replace(/\s+/g, "").toLowerCase();
}

function requireField(permission: Record<string, any>, key: string, label: string) {
  if (!String(permission[key] || "").trim()) throw new Error(`Please complete: ${label}.`);
}

function validatePermission(permission: Record<string, any>) {
  [
    ["studentId", "Student"],
    ["parentSignature", "Parent/guardian signature"],
    ["studentSignature", "Student signature"],
    ["signatureDate", "Signature date"],
  ].forEach(([key, label]) => requireField(permission, key, label));
  if (!permission.permitLeaveCampusLunch) throw new Error("Please confirm permission to leave campus for lunch.");
  if (permission.permitStudentDrivenByOthers) {
    const drivers = Array.isArray(permission.approvedStudentDrivers) ? permission.approvedStudentDrivers.map((name) => String(name || "").trim()).filter(Boolean) : [];
    if (!drivers.length) throw new Error("Please list at least one permitted student driver.");
  }
  if (!permission.termsAcknowledged) throw new Error("Please acknowledge the off-campus lunch terms.");
}

function isUpperGrade(value: string) {
  const grade = String(value || "").trim().toLowerCase();
  return grade === "11" || grade === "11th" || grade === "12" || grade === "12th";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) throw new Error("Please sign in before submitting an off-campus lunch permission.");

    const { permission } = await request.json();
    validatePermission(permission || {});

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError) throw userError;
    const requesterEmail = normalizeEmail(userData?.user?.email || "");
    if (!requesterEmail) throw new Error("Please sign in before submitting an off-campus lunch permission.");

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
      .eq("student_id", permission.studentId)
      .eq("active", true)
      .limit(1);
    if (studentError) throw studentError;
    const student = studentRows?.[0];
    if (!student || familyKeyFor(student) !== access.family_key) throw new Error("This student is not connected to your family portal.");
    if (!isUpperGrade(student.grade)) throw new Error("Off-campus lunch permission is only available for 11th and 12th grade students.");

    if (permission.permitStudentDriveSelf || permission.permitStudentDriveOthers) {
      const { data: driverRows, error: driverError } = await supabase
        .from("student_driver_registrations")
        .select("id,status,expires_at")
        .eq("family_key", access.family_key)
        .eq("student_id", student.student_id)
        .eq("status", "Approved")
        .limit(1);
      if (driverError) throw driverError;
      const approvedDriver = driverRows?.find((row) => !row.expires_at || String(row.expires_at).slice(0, 10) >= new Date().toISOString().slice(0, 10));
      if (!approvedDriver) throw new Error("This student needs an approved Student Driver Vehicle Registration before driving options can be selected.");
    }

    const submittedAt = new Date().toISOString();
    const row = {
      family_key: access.family_key,
      family_name: access.family_name,
      school_year: permission.schoolYear || "2026-2027",
      student_id: student.student_id,
      student_name: [student.student_first_name, student.student_last_name].filter(Boolean).join(" "),
      student_grade: student.grade || "",
      parent_email: requesterEmail,
      status: "Pending",
      permission: {
        ...permission,
        parentEmail: requesterEmail,
        submittedByEmail: requesterEmail,
      },
      submitted_at: submittedAt,
      updated_at: submittedAt,
    };

    const { data: inserted, error: insertError } = await supabase
      .from("off_campus_lunch_permissions")
      .insert(row)
      .select("*")
      .single();
    if (insertError) throw insertError;

    await sendEmail(
      buildFosMessage({
        recipientEmail: requesterEmail,
        subject: "WVCS Off-Campus Lunch Permission Received",
        title: "Off-Campus Lunch Permission Received",
        body: [
          `Hello ${access.family_name || "WVCS Family"},`,
          `We received the off-campus lunch permission for ${row.student_name}.`,
          "The permission is pending office review. You will receive an update after it has been reviewed.",
        ],
      }),
    );

    return new Response(JSON.stringify({ submitted: true, permission: inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ submitted: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
