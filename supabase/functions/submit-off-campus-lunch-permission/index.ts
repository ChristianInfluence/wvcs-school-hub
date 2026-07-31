import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requestIp, typedSignatureRecord } from "../_shared/eSignature.ts";
import { buildFosMessage, corsHeaders, normalizeEmail, requiredEnv, sendEmail } from "../_shared/fosEmail.ts";

const termsVersion = "2026-2027-off-campus-lunch-v1";
const agreementConditions = [
  "I agree to check out with designated office staff in the elementary building when leaving campus at lunch.",
  "I agree this privilege will only be used by the student named on this form.",
  "I will only go to lunch with students who have off-campus lunch privileges.",
  "If I am driving or being driven by another student, I will have a completed WVCS Student Driver/Passenger Waiver form completed and turned in to the main office.",
  "I will return to campus in time for my next class. I will not be tardy to class.",
  "I will not incur more than four lunch-related tardies per year. Tardies may result in escalating consequences, up to total suspension of the privilege, according to the Student Handbook.",
  "I will maintain an attendance rate of 90% or better.",
  "I will maintain a GPA of 2.5 or higher with no F's and a maximum of two D's.",
  "If operating a motor vehicle, I will have a completed driver's form on file in the main office.",
  "I will operate my vehicle in a lawful and safe way at all times.",
  "I will not park in parking spaces that are not designated as student parking.",
];
const liabilityTerms = [
  {
    title: "Closed Campus and Purpose",
    body: "WVCS maintains a closed campus. Students are not permitted to leave campus after being dropped off in the morning until dismissal unless the parent/guardian follows the checkout process through the main office. This form grants permission for the approved off-campus privilege described here.",
  },
  {
    title: "Acknowledgment, Waiver, and Release of Liability",
    body: "In consideration of allowing the student to leave campus, the parent/guardian freely and voluntarily executes this waiver and release of liability in favor of Willamette Valley Christian School, its directors, officers, trustees, employees, and agents.",
  },
  {
    title: "Release and Waiver",
    body: "The parent/guardian releases and holds harmless WVCS from liability, claims, and demands related to bodily injury, personal injury, illness, death, or property damage that may result from the student leaving campus, including risks associated with the off-campus activity.",
  },
  {
    title: "Medical Treatment",
    body: "If emergency medical treatment is required because of illness or accident during the off-campus activity, the parent/guardian consents to such treatment and agrees to inform WVCS of medical conditions that may limit participation or should be known by emergency personnel.",
  },
  {
    title: "Privilege May Be Revoked",
    body: "Off-campus privileges may be revoked at any time if the student violates WVCS expectations, this agreement, transportation requirements, or the Student Handbook.",
  },
];

function familyKeyFor(row: Record<string, any>) {
  return String([row.email1, row.email2, row.student_last_name].filter(Boolean).join("|")).replace(/\s+/g, "").toLowerCase();
}

function safeFilePart(value: string) {
  return String(value || "WVCS")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 100) || "WVCS";
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

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
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
    const termsSnapshot = { agreementConditions, liabilityTerms };
    const termsHash = await sha256Hex(JSON.stringify({ termsVersion, termsSnapshot }));
    const ipAddress = requestIp(request);
    const userAgent = request.headers.get("user-agent") || "";
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
        termsVersion,
        termsSnapshot,
        termsHash,
        signedAt: submittedAt,
        signedByEmail: requesterEmail,
        ipAddress,
        userAgent,
        parentEmail: requesterEmail,
        submittedByEmail: requesterEmail,
        signatures: {
          parent: typedSignatureRecord({
            name: permission.parentSignature || "",
            email: requesterEmail,
            role: "Parent/Guardian",
            signedAt: submittedAt,
            agreementText: "I have reviewed the off-campus lunch conditions and terms and agree that typing my name records my electronic signature.",
            request,
          }),
          student: typedSignatureRecord({
            name: permission.studentSignature || "",
            role: "Student",
            signedAt: submittedAt,
            agreementText: "I have reviewed the off-campus lunch conditions and terms and agree that typing my name records my electronic signature.",
            request,
          }),
        },
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

    await supabase.from("drive_backup_jobs").upsert(
      {
        source_type: "off_campus_lunch_permission",
        source_id: inserted.id,
        status: "pending",
        target_folder_path: [
          "Family Portal",
          "Forms and Driver Records",
          row.school_year,
          row.family_name || "WVCS Family",
        ],
        filename: `${safeFilePart(row.family_name)}_${safeFilePart(row.student_name)}_Off-Campus-Lunch-Permission_${submittedAt.slice(0, 10)}_Submitted.pdf`,
        metadata: {
          familyKey: row.family_key,
          familyName: row.family_name,
          studentName: row.student_name,
          parentEmail: row.parent_email,
          formTitle: "Off-Campus Lunch Permission",
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
