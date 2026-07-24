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

function mapLunchMenu(row: Record<string, any>) {
  return {
    id: row.id,
    title: row.title || "",
    weekStart: row.week_start || "",
    status: row.status || "",
    notes: row.notes || "",
    items: Array.isArray(row.items) ? row.items : [],
  };
}

function mapLunchOrder(row: Record<string, any>) {
  return {
    id: row.id,
    menuId: row.menu_id || "",
    studentId: row.student_id || "",
    studentName: row.student_name || "",
    studentGrade: row.student_grade || "",
    orderDate: row.order_date || "",
    itemName: row.item_name || "",
    itemDescription: row.item_description || "",
    price: Number(row.price || 0),
    status: row.status || "Anticipated",
    source: row.source || "",
    chargedAt: row.charged_at || "",
    createdAt: row.created_at || "",
  };
}

function mapLunchTransaction(row: Record<string, any>) {
  return {
    id: row.id,
    studentName: row.student_name || "",
    type: row.type || "",
    amount: Number(row.amount || 0),
    description: row.description || "",
    paymentMethod: row.payment_method || "",
    processingFee: Number(row.stripe_processing_fee || 0),
    netAmount: Number(row.stripe_net_amount || 0),
    createdAt: row.created_at || "",
  };
}

function mapPermissionEvent(row: Record<string, any>) {
  return {
    id: row.id,
    title: row.title || row.event?.title || "Permission Slip",
    destination: row.destination || row.event?.destination || "",
    eventDate: row.event_date || row.event?.eventDate || "",
    status: row.status || row.event?.status || "",
  };
}

const DEFAULT_FAMILY_PORTAL_SETTINGS = {
  announcement: {
    enabled: false,
    title: "Family Portal Announcement",
    message: "",
  },
  help: {
    email: "office@wvcs.org",
    phone: "503-393-5236",
    message: "For help accessing your family portal, please contact the WVCS office.",
  },
};

function normalizeFamilyPortalSettings(settings: Record<string, any> | null | undefined) {
  const source = settings || {};
  const announcement = source.announcement || {};
  const help = source.help || {};
  return {
    announcement: {
      enabled: Boolean(announcement.enabled),
      title: announcement.title || DEFAULT_FAMILY_PORTAL_SETTINGS.announcement.title,
      message: announcement.message || "",
    },
    help: {
      email: help.email || DEFAULT_FAMILY_PORTAL_SETTINGS.help.email,
      phone: help.phone || DEFAULT_FAMILY_PORTAL_SETTINGS.help.phone,
      message: help.message || DEFAULT_FAMILY_PORTAL_SETTINGS.help.message,
    },
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

    const [{ data: directoryRows, error: directoryError }, { data: fosRows, error: fosError }, { data: incidentalRows, error: incidentalError }, { data: incidentalNameRows, error: incidentalNameError }, { data: tuitionRows, error: tuitionError }, { data: lunchAccount, error: lunchAccountError }, { data: lunchMenus, error: lunchMenusError }, { data: lunchOrders, error: lunchOrdersError }, { data: lunchTransactions, error: lunchTransactionsError }, { data: portalSettingsRow }] =
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
        supabase.from("lunch_accounts").select("*").eq("family_key", access.family_key).maybeSingle(),
        supabase.from("lunch_menus").select("*").in("status", ["Open", "Published"]).order("week_start", { ascending: true }),
        supabase.from("lunch_orders").select("*").eq("family_key", access.family_key).order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(120),
        supabase.from("lunch_transactions").select("*").eq("family_key", access.family_key).order("created_at", { ascending: false }).limit(120),
        supabase.from("office_finance_settings").select("settings").eq("id", "family_portal").maybeSingle(),
      ]);

    if (directoryError) throw directoryError;
    if (fosError) throw fosError;
    if (incidentalError) throw incidentalError;
    if (incidentalNameError) throw incidentalNameError;
    if (tuitionError) throw tuitionError;
    if (lunchAccountError) throw lunchAccountError;
    if (lunchMenusError) throw lunchMenusError;
    if (lunchOrdersError) throw lunchOrdersError;
    if (lunchTransactionsError) throw lunchTransactionsError;

    const students = (directoryRows || []).filter((row) => familyKeyFor(row) === access.family_key).map(mapStudent);
    const studentIds = students.map((student) => String(student.id || "")).filter(Boolean);
    const [{ data: permissionRecipients, error: permissionRecipientError }, { data: permissionSubmissions, error: permissionSubmissionError }] = studentIds.length
      ? await Promise.all([
        supabase
          .from("permission_recipients")
          .select("id,event_id,student_id,grade,student_name,parent_name,parent_email,signing_token,status,sent_at,emailed_at,viewed_at,signed_at")
          .in("student_id", studentIds)
          .order("student_name", { ascending: true }),
        supabase
          .from("permission_submissions")
          .select("id,event_id,recipient_id,student_id,grade,student_name,parent_name,parent_email,signer_name,signing_token,signed_at,signed_pdf_bucket,signed_pdf_path")
          .in("student_id", studentIds)
          .order("signed_at", { ascending: false }),
      ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (permissionRecipientError) throw permissionRecipientError;
    if (permissionSubmissionError) throw permissionSubmissionError;

    const permissionEventIds = [...new Set([...(permissionRecipients || []), ...(permissionSubmissions || [])].map((row) => row.event_id).filter(Boolean))];
    const { data: permissionEvents, error: permissionEventError } = permissionEventIds.length
      ? await supabase
        .from("permission_events")
        .select("id,title,destination,event_date,status,event")
        .in("id", permissionEventIds)
      : { data: [], error: null };
    if (permissionEventError) throw permissionEventError;
    const permissionEventMap = new Map((permissionEvents || []).map((event) => [event.id, mapPermissionEvent(event)]));
    const permissionRows = new Map<string, Record<string, any>>();
    (permissionRecipients || []).forEach((recipient) => {
      const key = `${recipient.event_id}:${recipient.student_id || recipient.student_name}`;
      const existing = permissionRows.get(key) || {
        event: permissionEventMap.get(recipient.event_id) || { id: recipient.event_id, title: "Permission Slip", eventDate: "" },
        studentId: recipient.student_id || "",
        studentName: recipient.student_name || "",
        grade: recipient.grade || "",
        recipients: [],
        submissions: [],
      };
      existing.recipients.push(recipient);
      permissionRows.set(key, existing);
    });
    (permissionSubmissions || []).forEach((submission) => {
      const key = `${submission.event_id}:${submission.student_id || submission.student_name}`;
      const existing = permissionRows.get(key) || {
        event: permissionEventMap.get(submission.event_id) || { id: submission.event_id, title: "Permission Slip", eventDate: "" },
        studentId: submission.student_id || "",
        studentName: submission.student_name || "",
        grade: submission.grade || "",
        recipients: [],
        submissions: [],
      };
      existing.submissions.push(submission);
      permissionRows.set(key, existing);
    });
    const permissionSlips = [...permissionRows.values()].map((row) => {
      const signedSubmission = row.submissions.find((submission: Record<string, any>) => submission.signed_at) || null;
      const unsignedRecipient = row.recipients.find((recipient: Record<string, any>) => !recipient.signed_at) || row.recipients[0] || null;
      const pdfToken = signedSubmission?.signing_token || row.recipients.find((recipient: Record<string, any>) => recipient.student_id === signedSubmission?.student_id)?.signing_token || unsignedRecipient?.signing_token || "";
      return {
        id: `${row.event.id}:${row.studentId || row.studentName}`,
        eventId: row.event.id,
        title: row.event.title,
        destination: row.event.destination || "",
        eventDate: row.event.eventDate || "",
        studentId: row.studentId || "",
        studentName: row.studentName || signedSubmission?.student_name || "Student",
        grade: row.grade || signedSubmission?.grade || "",
        status: signedSubmission ? "Completed" : "Needs Signature",
        signingToken: signedSubmission ? "" : unsignedRecipient?.signing_token || "",
        signedAt: signedSubmission?.signed_at || "",
        signedBy: signedSubmission?.signer_name || signedSubmission?.parent_name || "",
        submissionId: signedSubmission?.id || "",
        pdfToken,
      };
    }).sort((a, b) => String(b.eventDate || "").localeCompare(String(a.eventDate || "")) || a.studentName.localeCompare(b.studentName));
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
          enabled: true,
          balance: Number(lunchAccount?.balance || 0),
          accountUpdatedAt: lunchAccount?.updated_at || "",
          menus: (lunchMenus || []).map(mapLunchMenu),
          orders: (lunchOrders || []).map(mapLunchOrder),
          transactions: (lunchTransactions || []).map(mapLunchTransaction),
        },
        familyPortalSettings: normalizeFamilyPortalSettings(portalSettingsRow?.settings),
        permissionSlips,
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
