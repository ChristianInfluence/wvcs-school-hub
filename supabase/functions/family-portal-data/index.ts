import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calculateFosBalance, corsHeaders, requiredEnv } from "../_shared/fosEmail.ts";

function familyKeyFor(row: Record<string, any>) {
  return String([row.email1, row.email2, row.student_last_name].filter(Boolean).join("|")).replace(/\s+/g, "").toLowerCase();
}

function mapStudent(row: Record<string, any>) {
  return {
    id: row.student_id,
    name: [row.student_first_name, row.student_last_name].filter(Boolean).join(" "),
    grade: row.grade || "",
  };
}

function mapInvoice(row: Record<string, any>, type = "incidental") {
  return {
    id: row.id,
    type,
    publicToken: row.public_token || row.invoice_json?.publicToken || "",
    familyName: row.family_name || "",
    schoolYear: row.school_year || row.invoice_json?.schoolYear || "",
    status: row.status || "",
    paymentStatus: row.payment_status || "",
    total: row.invoice_json?.total || row.invoice_json?.charges?.reduce((sum: number, charge: Record<string, any>) => sum + Number(charge.amount || 0), 0) || 0,
    invoice: row.invoice_json || {},
    sentAt: row.sent_at || "",
    paidAt: row.paid_at || "",
    receiptNumber: row.receipt_number || "",
  };
}

function familyNameTerms(familyName: string) {
  const cleanName = String(familyName || "").trim();
  const withoutFamily = cleanName.replace(/\s+Family$/i, "").trim();
  return [...new Set([cleanName, withoutFamily].filter(Boolean))];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = request.headers.get("Authorization") || "";
    const { token, previewFamilyKey } = await request.json();

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    const { data: userData } = jwt ? await supabase.auth.getUser(jwt) : { data: { user: null } };
    const requesterEmail = String(userData?.user?.email || "").trim().toLowerCase();

    let accessQuery = supabase.from("family_portal_access").select("*").eq("active", true);

    const isParentPortalLogin = Boolean(!token && !previewFamilyKey);

    if (token) {
      accessQuery = accessQuery.eq("public_token", token);
    } else if (previewFamilyKey) {
      if (!requesterEmail) throw new Error("Missing office identity.");
      const { data: staffRows, error: staffError } = await supabase
        .from("staff_access")
        .select("email, can_use_hub, can_use_admin, can_use_office_payroll")
        .eq("email", requesterEmail)
        .limit(1);
      if (staffError) throw staffError;
      const staff = staffRows?.[0];
      if (!staff?.can_use_hub || (!staff.can_use_admin && !staff.can_use_office_payroll)) throw new Error("Not authorized.");
      accessQuery = accessQuery.eq("family_key", previewFamilyKey);
    } else {
      if (!requesterEmail) throw new Error("Please sign in to view your family portal.");
      accessQuery = accessQuery.contains("contact_emails", [requesterEmail]);
    }

    const { data: access, error: accessError } = await accessQuery.maybeSingle();

    if (accessError) throw accessError;
    if (!access) return new Response(JSON.stringify({ loaded: true, found: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    if (isParentPortalLogin && requesterEmail) {
      const loginAt = new Date().toISOString();
      await supabase
        .from("family_portal_access")
        .update({
          last_parent_login_at: loginAt,
          last_parent_login_email: requesterEmail,
        })
        .eq("family_key", access.family_key);
      access.last_parent_login_at = loginAt;
      access.last_parent_login_email = requesterEmail;
    }

    const nameTerms = familyNameTerms(access.family_name);
    const familyNameFilter = nameTerms.map((term) => `family_name.ilike.%${term.replaceAll(",", "\\,")}%`).join(",");

    const [{ data: directoryRows, error: directoryError }, { data: fosRows, error: fosError }, { data: incidentalRows, error: incidentalError }, { data: incidentalNameRows, error: incidentalNameError }, { data: tuitionRows, error: tuitionError }] =
      await Promise.all([
        supabase.from("student_directory").select("*").eq("active", true),
        supabase.from("fos_hour_entries").select("*").eq("family_key", access.family_key).order("submitted_at", { ascending: false }),
        supabase.from("incidental_invoices").select("*").eq("family_key", access.family_key).order("updated_at", { ascending: false }),
        familyNameFilter
          ? supabase.from("incidental_invoices").select("*").or(familyNameFilter).order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
        familyNameFilter
          ? supabase.from("tuition_invoices").select("*").or(familyNameFilter).order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

    if (directoryError) throw directoryError;
    if (fosError) throw fosError;
    if (incidentalError) throw incidentalError;
    if (incidentalNameError) throw incidentalNameError;
    if (tuitionError) throw tuitionError;

    const students = (directoryRows || []).filter((row) => familyKeyFor(row) === access.family_key).map(mapStudent);
    const entries = fosRows || [];
    const balance = calculateFosBalance(entries, access);
    const incidentalById = new Map<string, Record<string, any>>();
    [...(incidentalRows || []), ...(incidentalNameRows || [])].forEach((row) => incidentalById.set(row.id, row));

    return new Response(
      JSON.stringify({
        loaded: true,
        found: true,
        family: {
          familyKey: access.family_key,
          familyName: access.family_name,
          contactEmails: access.contact_emails || [],
          lastParentLoginAt: access.last_parent_login_at || "",
          lastParentLoginEmail: access.last_parent_login_email || "",
          students,
        },
        fos: {
          schoolYear: "2026-2027",
          requiredHours: balance.requiredHours,
          buyoutAmount: balance.liabilityAmount,
          hourValue: balance.hourValue,
          balance,
          entries: entries.map((entry) => ({
            id: entry.id,
            activityDate: entry.activity_date,
            activity: entry.activity,
            notes: entry.notes,
            submittedHours: Number(entry.submitted_hours || 0),
            approvedHours: Number(entry.approved_hours || 0),
            status: entry.status,
            officeNote: entry.office_note,
            submittedAt: entry.submitted_at,
            reviewedAt: entry.reviewed_at,
          })),
        },
        invoices: {
          incidentals: [...incidentalById.values()].map((row) => mapInvoice(row, "incidental")),
          tuition: (tuitionRows || []).map((row) => mapInvoice(row, "tuition")),
        },
        lunch: {
          enabled: false,
          balance: 0,
          note: "Lunch balance and add-funds tools will be added after the family portal and FOS workflow are stable.",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(JSON.stringify({ loaded: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
