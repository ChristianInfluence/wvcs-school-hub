import { useEffect, useMemo, useState } from "react";
import { Bell, ClipboardCheck, Clock, DollarSign, ExternalLink, FileSignature, FileText, History, Info, Mail, RefreshCw, Save, Search, ShieldCheck, Utensils, Users } from "lucide-react";
import { createDriverAttachmentUrl, fetchFamilyPortalAccessRecords, fetchFosAuditEvents, fetchFosEntries, fetchOffCampusLunchPermissions, fetchParentBackgroundChecks, fetchStudentDriverRegistrations, fetchVolunteerDriverApplications, calculateFosBalance, ensureFamilyPortalAccess, FOS_BUYOUT_AMOUNT, FOS_HOUR_VALUE, FOS_SCHOOL_YEAR, reviewOffCampusLunchPermission, reviewStudentDriverRegistration, reviewVolunteerDriverApplication, saveParentBackgroundCheck, sendFamilyPortalInvite, updateFamilyFosSettings } from "../../lib/familyPortalData.js";
import { DEFAULT_FAMILY_PORTAL_SETTINGS, DEFAULT_OFFICE_EMAIL_SETTINGS, backfillEmailAuditLog, fetchEmailAuditLog, fetchFamilyPortalSettings, fetchFosAdjustmentSettings, fetchOfficeEmailSettings, saveFamilyPortalSettings, saveFosAdjustmentSettings, saveOfficeEmailSettings } from "../../lib/officeFinanceSettingsData.js";
import { fetchLunchAdminData, money } from "../../lib/lunchData.js";
import { fetchIncidentalInvoices, fetchOfficeFamilyDirectory, fetchTuitionInvoices } from "../../lib/tuitionBillingData.js";
import { createParentPermissionPdfUrl, fetchPermissionEvents, fetchPermissionRecipients, fetchPermissionSubmissions } from "../../lib/permissionSlipsData.js";
import { fetchFormSubmissions } from "../../lib/formsData.js";

const today = new Date().toISOString().slice(0, 10);

function formatDate(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatShortDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

function StatusPill({ children, tone = "slate" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    rose: "border-rose-200 bg-rose-50 text-rose-800",
    sky: "border-sky-200 bg-sky-50 text-sky-800",
  };
  return <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${tones[tone] || tones.slate}`}>{children}</span>;
}

function invoiceBalance(invoice) {
  const directTotal = Number(invoice.total || invoice.invoice?.total || invoice.invoice?.amount || invoice.invoice?.balanceDue || 0);
  if (Number.isFinite(directTotal) && directTotal) return directTotal;
  if (Array.isArray(invoice.invoice?.charges)) {
    return invoice.invoice.charges.reduce((total, charge) => {
      const amount = Number(charge.amount || 0);
      return total + (Number.isFinite(amount) ? amount : 0);
    }, 0);
  }
  if (Array.isArray(invoice.invoice?.students)) {
    const studentTotal = invoice.invoice.students.reduce((total, student) => {
      const discounts = Array.isArray(student.discounts)
        ? student.discounts.reduce((sum, discount) => sum + Number(discount.amount || 0), 0)
        : 0;
      const discountedTuition = Math.max(Number(student.tuition || 0) - discounts, 0);
      const earlyPayDiscount = discountedTuition * 0.05;
      return total + Math.max(discountedTuition - earlyPayDiscount, 0) + Number(student.comprehensiveFee || 0);
    }, 0);
    return studentTotal + (invoice.invoice.registrationFeePaid ? 0 : Number(invoice.invoice.registrationFee || 0));
  }
  return 0;
}

function invoiceCategory(invoice) {
  const charges = Array.isArray(invoice.invoice?.charges) ? invoice.invoice.charges : [];
  if (charges.length) {
    const labels = charges
      .map((charge) => (charge.category === "Other" ? charge.description : charge.category) || charge.description || "Other")
      .filter(Boolean);
    const unique = [...new Set(labels)];
    if (unique.length <= 2) return unique.join(", ");
    return `${unique[0]} + ${unique.length - 1} more`;
  }
  if (Array.isArray(invoice.invoice?.students)) return "Full-pay Tuition";
  return invoice.invoice?.category || invoice.category || "Invoice";
}

function paymentTone(invoice) {
  const status = String(invoice.paymentStatus || invoice.status || "").toLowerCase();
  if (status.includes("paid")) return "emerald";
  if (status.includes("void") || status.includes("refund")) return "slate";
  if (status.includes("partial")) return "amber";
  return "rose";
}

function normalizeFamilyName(value) {
  return String(value || "").trim().replace(/\s+Family$/i, "").toLowerCase();
}

function familyNamesMatch(a, b) {
  const first = normalizeFamilyName(a);
  const second = normalizeFamilyName(b);
  return Boolean(first && second && first === second);
}

function emailsMatchAny(value, emails = []) {
  const normalized = String(value || "").trim().toLowerCase();
  return Boolean(normalized && emails.includes(normalized));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function signatureTimestamp(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function signatureRecordHtml(signature, fallbackName = "", fallbackEmail = "") {
  const name = signature?.name || fallbackName || "";
  if (!name) return `<span style="color:#9ca3af;font-style:italic;">Not signed</span>`;
  const email = signature?.email || fallbackEmail || "";
  const timestamp = signatureTimestamp(signature?.signedAt);
  return `
    <div class="script-signature">${escapeHtml(name)}</div>
    <div class="signature-meta">
      Digitally signed by ${escapeHtml(name)}${email ? ` (${escapeHtml(email)})` : ""}<br>
      ${timestamp ? `${escapeHtml(timestamp)} | ` : ""}${escapeHtml(signature?.method || "typed electronic signature")}
      ${signature?.signatureId ? `<br>Signature ID: ${escapeHtml(signature.signatureId)}` : ""}
    </div>
  `;
}

function offCampusPermissionRecordHtml(permission) {
  const record = permission?.permission || {};
  const signatures = record.signatures || {};
  const conditions = record.termsSnapshot?.agreementConditions || [];
  const liability = record.termsSnapshot?.liabilityTerms || [];
  const allowedDrivers = Array.isArray(record.approvedStudentDrivers) ? record.approvedStudentDrivers.filter(Boolean) : [];
  return `<!doctype html>
<html>
<head>
  <title>WVCS Off-Campus Lunch Permission</title>
  <style>
    @page { size: letter portrait; margin: 0.45in; }
    body { font-family: Arial, sans-serif; color: #111827; margin: 0; font-size: 12px; line-height: 1.45; }
    h1 { font-size: 22px; margin: 0 0 4px; text-align: center; }
    h2 { font-size: 14px; margin: 18px 0 8px; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; }
    .center { text-align: center; }
    .meta { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 18px; }
    .box { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px; }
    .label { font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #6b7280; font-weight: 700; }
    .value { margin-top: 3px; font-weight: 700; }
    ol { padding-left: 20px; margin: 8px 0; }
    li { margin-bottom: 5px; }
    .small { font-size: 10px; color: #374151; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 12px; }
    .script-signature { font-family: "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive; font-size: 23px; line-height: 1.05; color: #111827; white-space: nowrap; }
    .signature-meta { margin-top: 3px; color: #4b5563; font-size: 9px; line-height: 1.3; word-break: break-word; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <div class="center">
    <h1>Willamette Valley Christian School</h1>
    <div>Off-Campus Lunch Permission Record</div>
  </div>
  <div class="meta">
    <div class="box"><div class="label">Student</div><div class="value">${escapeHtml(permission?.studentName || "Student")}</div></div>
    <div class="box"><div class="label">Grade</div><div class="value">${escapeHtml(permission?.studentGrade || "")}</div></div>
    <div class="box"><div class="label">School Year</div><div class="value">${escapeHtml(permission?.schoolYear || record.schoolYear || "")}</div></div>
  </div>
  <h2>Permissions Selected</h2>
  <div class="meta">
    <div class="box"><div class="label">Leave Campus</div><div class="value">${record.permitLeaveCampusLunch ? "Yes" : "No"}</div></div>
    <div class="box"><div class="label">Drive Self</div><div class="value">${record.permitStudentDriveSelf ? "Yes" : "No"}</div></div>
    <div class="box"><div class="label">Drive Others</div><div class="value">${record.permitStudentDriveOthers ? "Yes" : "No"}</div></div>
  </div>
  <div class="box" style="margin-top:8px;"><div class="label">Permitted Student Drivers</div><div class="value">${escapeHtml(allowedDrivers.join(", ") || "None listed")}</div></div>
  <h2>Agreement Conditions</h2>
  <ol>${conditions.map((term) => `<li>${escapeHtml(term)}</li>`).join("") || "<li>Terms snapshot not available for this record.</li>"}</ol>
  <h2>Terms and Conditions</h2>
  <div class="small">${liability.map((term) => `<p><strong>${escapeHtml(term.title)}</strong><br>${escapeHtml(term.body)}</p>`).join("") || "<p>Terms snapshot not available for this record.</p>"}</div>
  <h2>E-Signature Record</h2>
  <div class="signatures">
    <div class="box"><div class="label">Parent/Guardian Signature</div><div class="value">${signatureRecordHtml(signatures.parent, record.parentSignature, record.parentEmail || permission?.parentEmail || "")}</div></div>
    <div class="box"><div class="label">Student Signature</div><div class="value">${signatureRecordHtml(signatures.student, record.studentSignature)}</div></div>
  </div>
  <div class="box small" style="margin-top:8px;">
    Signature date: ${escapeHtml(record.signatureDate || "")}. Submitted by ${escapeHtml(record.signedByEmail || record.parentEmail || permission?.parentEmail || "")}
    on ${escapeHtml(signatureTimestamp(record.signedAt || permission?.submittedAt) || record.signedAt || permission?.submittedAt || "")}. Terms version: ${escapeHtml(record.termsVersion || "")}.
    Terms hash: ${escapeHtml(record.termsHash || "")}. Browser: ${escapeHtml(record.userAgent || "")}. IP: ${escapeHtml(record.ipAddress || "")}.
  </div>
  <button onclick="window.print()" style="margin-top:16px;padding:8px 12px;border:1px solid #0f172a;border-radius:6px;background:#0f172a;color:white;font-weight:700;">Print / Save PDF</button>
</body>
</html>`;
}

function isVerifiedDriver(application) {
  return application?.status === "Verified" && (!application.expiresAt || application.expiresAt.slice(0, 10) >= today);
}

function addYears(value, years) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  date.setFullYear(date.getFullYear() + years);
  return date.toISOString().slice(0, 10);
}

function isCurrentBackgroundCheck(record) {
  return record?.status === "Approved" && record.expiresAt && record.expiresAt.slice(0, 10) >= today;
}

function isExpiredBackgroundCheck(record) {
  return record?.status === "Approved" && record.expiresAt && record.expiresAt.slice(0, 10) < today;
}

function backgroundCheckTone(record) {
  if (!record) return "slate";
  if (isExpiredBackgroundCheck(record)) return "rose";
  if (record.status === "Approved") return "emerald";
  if (record.status === "Pending") return "amber";
  if (record.status === "No Application") return "slate";
  return "rose";
}

function backgroundCheckLabel(record) {
  if (!record) return "No Application";
  if (isExpiredBackgroundCheck(record)) return "Expired";
  return record.status || "No Application";
}

function driverTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "verified") return "emerald";
  if (value === "denied" || value === "expired") return "rose";
  if (value === "pending") return "amber";
  return "slate";
}

function studentDriverTone(status) {
  const value = String(status || "").toLowerCase();
  if (value === "approved") return "emerald";
  if (value === "pending" || value === "needs correction") return "amber";
  if (value === "denied" || value === "revoked" || value === "expired") return "rose";
  return "slate";
}

function offCampusPermissionTone(status) {
  return studentDriverTone(status);
}

function calculateFosLiabilityFromAdjustments(settings = {}) {
  if (settings.fullTimeStaff) return 0;
  const partTimePercent = settings.partTimeStaff ? Math.min(Math.max(Number(settings.partTimePercent || 0), 0), 100) : 0;
  const partTimeAdjusted = FOS_BUYOUT_AMOUNT * (1 - partTimePercent / 100);
  const singleParentAdjusted = settings.singleParentHousehold ? partTimeAdjusted * 0.5 : partTimeAdjusted;
  return Math.round(singleParentAdjusted * 100) / 100;
}

function FamilyRecordsModule({ initialSavedView = "all", currentUserEmail = "" }) {
  const [data, setData] = useState({ loading: true, families: [], tuition: [], incidentals: [], lunch: null, fosEntries: [], access: [], audit: [], driverApplications: [], studentDriverRegistrations: [], offCampusLunchPermissions: [], backgroundChecks: [], permissionEvents: [], permissionRecipients: [], permissionSubmissions: [], formSubmissions: [], error: "" });
  const [search, setSearch] = useState("");
  const [selectedFamilyKey, setSelectedFamilyKey] = useState("");
  const [savedView, setSavedView] = useState(initialSavedView || "all");
  const [inviteDrafts, setInviteDrafts] = useState({});
  const [portalLoadingKey, setPortalLoadingKey] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [driverReviewDrafts, setDriverReviewDrafts] = useState({});
  const [driverReviewingId, setDriverReviewingId] = useState("");
  const [studentDriverReviewDrafts, setStudentDriverReviewDrafts] = useState({});
  const [studentDriverReviewingId, setStudentDriverReviewingId] = useState("");
  const [offCampusReviewDrafts, setOffCampusReviewDrafts] = useState({});
  const [offCampusReviewingId, setOffCampusReviewingId] = useState("");
  const [backgroundDrafts, setBackgroundDrafts] = useState({});
  const [backgroundSavingKey, setBackgroundSavingKey] = useState("");
  const [backgroundEditor, setBackgroundEditor] = useState(null);
  const [fosAdjustmentDrafts, setFosAdjustmentDrafts] = useState({});
  const [fosAdjustmentSavingKey, setFosAdjustmentSavingKey] = useState("");
  const [fosAdjustmentOpen, setFosAdjustmentOpen] = useState({});
  const savedViewLabels = {
    unpaid: "families with unpaid incidental invoices",
    fos: "families with FOS balances or pending FOS hours",
    lunch: "families with negative lunch balances",
    portal: "families without a recorded portal login",
  };

  async function loadData(message = "") {
    setData((current) => ({ ...current, loading: true, error: message }));
    try {
      const [directoryResult, tuitionResult, incidentalResult, lunchResult, fosResult, accessResult, adjustmentResult, auditResult, driverResult, studentDriverResult, offCampusLunchResult, backgroundResult, permissionEventsResult, permissionRecipientsResult, permissionSubmissionsResult, formSubmissionsResult] = await Promise.all([
        fetchOfficeFamilyDirectory(),
        fetchTuitionInvoices(),
        fetchIncidentalInvoices(),
        fetchLunchAdminData(),
        fetchFosEntries(),
        fetchFamilyPortalAccessRecords(),
        fetchFosAdjustmentSettings(),
        fetchFosAuditEvents(120),
        fetchVolunteerDriverApplications(),
        fetchStudentDriverRegistrations(),
        fetchOffCampusLunchPermissions(),
        fetchParentBackgroundChecks(),
        fetchPermissionEvents(),
        fetchPermissionRecipients(),
        fetchPermissionSubmissions(),
        fetchFormSubmissions(),
      ]);
      setData({
        loading: false,
        families: directoryResult.families || [],
        tuition: tuitionResult.invoices || [],
        incidentals: incidentalResult.invoices || [],
        lunch: lunchResult || null,
        fosEntries: fosResult.entries || [],
        access: accessResult.access || [],
        audit: auditResult.events || [],
        driverApplications: driverResult.applications || [],
        studentDriverRegistrations: studentDriverResult.registrations || [],
        offCampusLunchPermissions: offCampusLunchResult.permissions || [],
        backgroundChecks: backgroundResult.backgroundChecks || [],
        permissionEvents: permissionEventsResult.events || [],
        permissionRecipients: permissionRecipientsResult.recipients || [],
        permissionSubmissions: permissionSubmissionsResult.submissions || [],
        formSubmissions: formSubmissionsResult.submissions || [],
        error: directoryResult.reason || tuitionResult.reason || incidentalResult.reason || lunchResult.reason || fosResult.reason || accessResult.reason || adjustmentResult.reason || auditResult.reason || driverResult.reason || studentDriverResult.reason || offCampusLunchResult.reason || backgroundResult.reason || permissionEventsResult.reason || permissionRecipientsResult.reason || permissionSubmissionsResult.reason || formSubmissionsResult.reason || "",
      });
      const inviteMap = {};
      (accessResult.access || []).forEach((access) => {
        inviteMap[access.familyKey] = access.contactEmails || [];
      });
      setInviteDrafts((current) => ({ ...inviteMap, ...current }));
      setFosAdjustmentDrafts((current) => ({ ...(adjustmentResult.settings?.families || {}), ...current }));
    } catch (error) {
      setData((current) => ({ ...current, loading: false, error: error.message }));
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (initialSavedView) setSavedView(initialSavedView);
  }, [initialSavedView]);

  const familySummaries = useMemo(() => {
    const accounts = new Map((data.lunch?.accounts || []).map((account) => [account.familyKey, account]));
    const accessMap = new Map(data.access.map((record) => [record.familyKey, record]));
    const eventMap = new Map(data.permissionEvents.map((event) => [event.id, event]));
    return data.families.map((family) => {
      const parentEmails = family.parents.map((parent) => String(parent.email || "").trim().toLowerCase()).filter(Boolean);
      const studentIds = new Set(family.students.map((student) => student.studentId).filter(Boolean));
      const incidentalInvoices = data.incidentals.filter((invoice) => invoice.familyKey === family.familyKey || familyNamesMatch(invoice.familyName, family.familyName));
      const tuitionInvoices = data.tuition.filter((invoice) => invoice.familyKey === family.familyKey || invoice.invoice?.familyKey === family.familyKey || familyNamesMatch(invoice.familyName || invoice.invoice?.familyName, family.familyName));
      const lunchOrders = (data.lunch?.orders || []).filter((order) => order.familyKey === family.familyKey);
      const lunchAccount = accounts.get(family.familyKey) || { balance: 0 };
      const fosEntries = data.fosEntries.filter((entry) => entry.familyKey === family.familyKey);
      const access = accessMap.get(family.familyKey);
      const fos = calculateFosBalance(fosEntries, access || {});
      const unpaidIncidentals = incidentalInvoices.filter((invoice) => !String(invoice.paymentStatus || "").toLowerCase().includes("paid"));
      const pendingFos = fosEntries.filter((entry) => entry.status === "Pending");
      const driverApplications = data.driverApplications.filter((application) => application.familyKey === family.familyKey || familyNamesMatch(application.familyName, family.familyName));
      const verifiedDrivers = driverApplications.filter(isVerifiedDriver);
      const pendingDrivers = driverApplications.filter((application) => application.status === "Pending");
      const studentDriverRegistrations = data.studentDriverRegistrations.filter((registration) => registration.familyKey === family.familyKey || familyNamesMatch(registration.familyName, family.familyName));
      const approvedStudentDrivers = studentDriverRegistrations.filter((registration) => registration.status === "Approved" && (!registration.expiresAt || registration.expiresAt.slice(0, 10) >= today));
      const pendingStudentDrivers = studentDriverRegistrations.filter((registration) => registration.status === "Pending" || registration.status === "Needs Correction");
      const offCampusLunchPermissions = data.offCampusLunchPermissions.filter((permission) => permission.familyKey === family.familyKey || familyNamesMatch(permission.familyName, family.familyName));
      const pendingOffCampusLunchPermissions = offCampusLunchPermissions.filter((permission) => permission.status === "Pending" || permission.status === "Needs Correction");
      const backgroundChecks = data.backgroundChecks.filter((record) => record.familyKey === family.familyKey || familyNamesMatch(record.familyName, family.familyName));
      const currentBackgroundChecks = backgroundChecks.filter(isCurrentBackgroundCheck);
      const permissionRecipients = data.permissionRecipients.filter((recipient) => studentIds.has(recipient.studentId) || emailsMatchAny(recipient.parentEmail, parentEmails));
      const permissionSubmissions = data.permissionSubmissions.filter((submission) => studentIds.has(submission.studentId) || emailsMatchAny(submission.parentEmail, parentEmails));
      const permissionDocuments = permissionRecipients
        .map((recipient) => {
          const signedSubmission = permissionSubmissions.find((submission) => submission.recipientId === recipient.id || (submission.eventId === recipient.eventId && submission.studentId === recipient.studentId && emailsMatchAny(submission.parentEmail, [String(recipient.parentEmail || "").toLowerCase()])));
          const event = eventMap.get(recipient.eventId);
          return {
            id: recipient.id,
            type: "Permission Slip",
            title: event?.title || recipient.recipient?.eventTitle || "Permission Slip",
            studentName: recipient.studentName || signedSubmission?.studentName || "",
            status: signedSubmission?.signedAt || recipient.signedAt ? "Signed" : "Unsigned",
            at: signedSubmission?.signedAt || recipient.sentAt || recipient.emailedAt || "",
            token: signedSubmission?.token || recipient.token || "",
            submissionId: signedSubmission?.id || "",
          };
        });
      const formDocuments = data.formSubmissions
        .filter((submission) => emailsMatchAny(submission.submitterEmail, parentEmails) || familyNamesMatch(submission.submitterName, family.familyName))
        .map((submission) => ({
          id: submission.id,
          type: "Form",
          title: submission.templateTitle || "Form Submission",
          studentName: submission.submitterName || "",
          status: submission.status || "Submitted",
          at: submission.submittedAt || submission.reviewedAt || "",
        }));
      const familyDocuments = [...permissionDocuments, ...formDocuments]
        .sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
      return {
        ...family,
        access,
        incidentalInvoices,
        tuitionInvoices,
        lunchOrders,
        lunchAccount,
        fosEntries,
        fos,
        unpaidIncidentals,
        pendingFos,
        driverApplications,
        verifiedDrivers,
        pendingDrivers,
        studentDriverRegistrations,
        approvedStudentDrivers,
        pendingStudentDrivers,
        offCampusLunchPermissions,
        pendingOffCampusLunchPermissions,
        backgroundChecks,
        currentBackgroundChecks,
        familyDocuments,
        searchText: `${family.familyName} ${family.parents.map((parent) => `${parent.name} ${parent.email}`).join(" ")} ${family.students.map((student) => `${student.name} ${student.grade}`).join(" ")}`.toLowerCase(),
      };
    });
  }, [data]);

  const filteredFamilies = familySummaries
    .filter((family) => {
      if (savedView === "unpaid" && !family.unpaidIncidentals.length) return false;
      if (savedView === "fos" && family.fos.remainingBalance <= 0 && !family.pendingFos.length) return false;
      if (savedView === "lunch" && Number(family.lunchAccount.balance || 0) >= 0) return false;
      if (savedView === "portal" && family.access?.lastParentLoginAt) return false;
      return !search.trim() || family.searchText.includes(search.trim().toLowerCase());
    })
    .sort((a, b) => a.familyName.localeCompare(b.familyName, undefined, { sensitivity: "base" }));

  const selectedFamily = familySummaries.find((family) => family.familyKey === selectedFamilyKey) || filteredFamilies[0] || null;
  const selectedInviteRecipients = selectedFamily ? inviteDrafts[selectedFamily.familyKey] || selectedFamily.access?.contactEmails || [] : [];
  const timeline = selectedFamily
    ? [
        ...selectedFamily.incidentalInvoices.map((invoice) => ({
          id: `incidental-${invoice.id}`,
          type: "Incidental",
          title: `${invoice.status || "Invoice"} · ${invoice.paymentStatus || "Unpaid"}`,
          detail: invoice.sentTo?.length ? `Sent to ${invoice.sentTo.join(", ")}` : "Invoice record",
          at: invoice.sentAt || invoice.updatedAt || invoice.createdAt,
        })),
        ...selectedFamily.tuitionInvoices.map((invoice) => ({
          id: `tuition-${invoice.id}`,
          type: "Tuition",
          title: `${invoice.schoolYear || "School year"} tuition breakdown`,
          detail: invoice.sentTo?.length ? `Sent to ${invoice.sentTo.join(", ")}` : invoice.status || "Draft",
          at: invoice.sentAt || invoice.updatedAt || invoice.createdAt,
        })),
        ...selectedFamily.lunchOrders.slice(0, 80).map((order) => ({
          id: `lunch-${order.id}`,
          type: "Lunch",
          title: `${order.studentName} · ${order.itemName}`,
          detail: `${order.status} on ${formatShortDate(order.orderDate)}`,
          at: order.createdAt || order.orderDate,
        })),
        ...selectedFamily.fosEntries.map((entry) => ({
          id: `fos-${entry.id}`,
          type: "FOS",
          title: `${entry.status} · ${entry.activity}`,
          detail: `${entry.approvedHours || entry.submittedHours} hour(s)`,
          at: entry.reviewedAt || entry.submittedAt,
        })),
        ...data.audit.filter((event) => event.familyKey === selectedFamily.familyKey).map((event) => ({
          id: `audit-${event.id}`,
          type: "Activity",
          title: event.eventType.replaceAll("_", " "),
          detail: event.actorEmail || event.recipientEmails?.join(", ") || "Recorded activity",
          at: event.createdAt,
        })),
      ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)).slice(0, 18)
    : [];

  function toggleInviteRecipient(email) {
    if (!selectedFamily || !email) return;
    setInviteDrafts((current) => {
      const selected = current[selectedFamily.familyKey] || selectedFamily.access?.contactEmails || [];
      const exists = selected.includes(email);
      return {
        ...current,
        [selectedFamily.familyKey]: exists ? selected.filter((item) => item !== email) : [...selected, email],
      };
    });
    setActionStatus("");
  }

  async function sendPortalInvite(family) {
    const recipients = inviteDrafts[family.familyKey] || family.access?.contactEmails || [];
    if (!recipients.length) {
      setActionStatus("Select at least one parent or guardian email before sending a portal invite.");
      return;
    }
    const confirmed = window.confirm(`Send a family portal invite to:\n\n${recipients.join("\n")}`);
    if (!confirmed) return;

    try {
      setPortalLoadingKey(family.familyKey);
      setActionStatus(`Sending family portal invite for ${family.familyName}...`);
      const result = await sendFamilyPortalInvite(family, currentUserEmail, recipients);
      setActionStatus(`Family portal invite sent to ${result.recipients.join(", ")}.`);
      await loadData();
    } catch (error) {
      setActionStatus(`Unable to send family portal invite: ${error.message}`);
    } finally {
      setPortalLoadingKey("");
    }
  }

  function getFosAdjustmentDraft(family) {
    return fosAdjustmentDrafts[family.familyKey] || {
      fullTimeStaff: false,
      partTimeStaff: false,
      partTimePercent: 0,
      singleParentHousehold: false,
    };
  }

  function updateFosAdjustmentDraft(familyKey, patch) {
    setFosAdjustmentDrafts((current) => ({
      ...current,
      [familyKey]: {
        fullTimeStaff: false,
        partTimeStaff: false,
        partTimePercent: 0,
        singleParentHousehold: false,
        ...(current[familyKey] || {}),
        ...patch,
      },
    }));
    setActionStatus("");
  }

  async function saveFosAdjustment(family) {
    const draft = getFosAdjustmentDraft(family);
    const normalizedDraft = {
      fullTimeStaff: Boolean(draft.fullTimeStaff),
      partTimeStaff: Boolean(draft.partTimeStaff),
      partTimePercent: draft.partTimeStaff ? Math.min(Math.max(Number(draft.partTimePercent || 0), 0), 100) : 0,
      singleParentHousehold: Boolean(draft.singleParentHousehold),
    };
    const liabilityAmount = calculateFosLiabilityFromAdjustments(normalizedDraft);
    try {
      setFosAdjustmentSavingKey(family.familyKey);
      setActionStatus(`Saving FOS adjustment for ${family.familyName}...`);
      if (!family.access) {
        await ensureFamilyPortalAccess(family, currentUserEmail);
      }
      await updateFamilyFosSettings(family.familyKey, {
        liabilityAmount,
        hourValue: FOS_HOUR_VALUE,
      });
      await saveFosAdjustmentSettings({
        families: {
          ...fosAdjustmentDrafts,
          [family.familyKey]: normalizedDraft,
        },
      }, currentUserEmail);
      setFosAdjustmentDrafts((current) => ({ ...current, [family.familyKey]: normalizedDraft }));
      setActionStatus(`FOS liability saved for ${family.familyName}: ${money(liabilityAmount)}.`);
      await loadData();
    } catch (error) {
      setActionStatus(`Unable to save FOS adjustment: ${error.message}`);
    } finally {
      setFosAdjustmentSavingKey("");
    }
  }

  async function openDriverAttachment(attachment) {
    try {
      setActionStatus("Opening driver document...");
      const url = await createDriverAttachmentUrl(attachment);
      if (!url) throw new Error("Document link could not be created.");
      window.open(url, "_blank", "noopener,noreferrer");
      setActionStatus("");
    } catch (error) {
      setActionStatus(`Unable to open driver document: ${error.message}`);
    }
  }

  async function openPermissionDocument(document) {
    if (!document.submissionId || !document.token) {
      setActionStatus("This permission slip does not have a signed PDF yet.");
      return;
    }
    try {
      setActionStatus("Opening signed permission slip...");
      const url = await createParentPermissionPdfUrl({ token: document.token, submissionId: document.submissionId });
      if (!url) throw new Error("Signed PDF link could not be created.");
      window.open(url, "_blank", "noopener,noreferrer");
      setActionStatus("");
    } catch (error) {
      setActionStatus(`Unable to open signed permission slip: ${error.message}`);
    }
  }

  async function reviewDriverApplication(application, action) {
    const confirmed = window.confirm(`${action === "verify" ? "Verify" : "Deny"} volunteer driver application for ${application.parentName || application.parentEmail}?`);
    if (!confirmed) return;
    try {
      setDriverReviewingId(application.id);
      setActionStatus(`${action === "verify" ? "Verifying" : "Denying"} volunteer driver application...`);
      const result = await reviewVolunteerDriverApplication(application.id, {
        action,
        officeNote: driverReviewDrafts[application.id] || "",
      });
      setActionStatus(`Volunteer driver application marked ${result.application?.status || "reviewed"}.`);
      await loadData();
    } catch (error) {
      setActionStatus(`Unable to review driver application: ${error.message}`);
    } finally {
      setDriverReviewingId("");
    }
  }

  async function reviewStudentDriver(registration, action) {
    const labels = {
      approve: "Approve",
      deny: "Deny",
      correction: "Request correction for",
      revoke: "Revoke",
    };
    const confirmed = window.confirm(`${labels[action] || "Review"} student driver registration for ${registration.studentName || "this student"}?`);
    if (!confirmed) return;
    try {
      setStudentDriverReviewingId(registration.id);
      setActionStatus(`${labels[action] || "Reviewing"} student driver registration...`);
      const result = await reviewStudentDriverRegistration(registration.id, {
        action,
        officeNote: studentDriverReviewDrafts[registration.id] || "",
      });
      setActionStatus(`Student driver registration marked ${result.registration?.status || "reviewed"}.`);
      await loadData();
    } catch (error) {
      setActionStatus(`Unable to review student driver registration: ${error.message}`);
    } finally {
      setStudentDriverReviewingId("");
    }
  }

  async function reviewOffCampusLunch(permission, action) {
    const labels = {
      approve: "Approve",
      deny: "Deny",
      correction: "Request correction for",
      revoke: "Revoke",
    };
    const confirmed = window.confirm(`${labels[action] || "Review"} off-campus lunch permission for ${permission.studentName || "this student"}?`);
    if (!confirmed) return;
    try {
      setOffCampusReviewingId(permission.id);
      setActionStatus(`${labels[action] || "Reviewing"} off-campus lunch permission...`);
      const result = await reviewOffCampusLunchPermission(permission.id, {
        action,
        officeNote: offCampusReviewDrafts[permission.id] || "",
      });
      setActionStatus(`Off-campus lunch permission marked ${result.permission?.status || "reviewed"}.`);
      await loadData();
    } catch (error) {
      setActionStatus(`Unable to review off-campus lunch permission: ${error.message}`);
    } finally {
      setOffCampusReviewingId("");
    }
  }

  function openOffCampusLunchRecord(permission) {
    const recordWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
    if (!recordWindow) {
      setActionStatus("Allow pop-ups to open the signed off-campus lunch record.");
      return;
    }
    recordWindow.document.open();
    recordWindow.document.write(offCampusPermissionRecordHtml(permission));
    recordWindow.document.close();
    setActionStatus("");
  }

  function openBackgroundCheckEditor(parent, existingRecord) {
    if (!selectedFamily || !parent?.email) return;
    const email = String(parent.email).toLowerCase();
    const draftKey = `${selectedFamily.familyKey}:${email}`;
    setBackgroundDrafts((current) => ({
      ...current,
      [draftKey]: current[draftKey] || {
        verifiedAt: existingRecord?.verifiedAt || today,
        expiresAt: existingRecord?.expiresAt || addYears(existingRecord?.verifiedAt || today, 2),
        status: existingRecord?.status || "No Application",
        officeNote: existingRecord?.officeNote || "",
      },
    }));
    setBackgroundEditor({ familyKey: selectedFamily.familyKey, parentEmail: email, parentName: parent.name || "Parent / Guardian" });
    setActionStatus("");
  }

  async function saveBackgroundCheckForParent(parent, existingRecord) {
    if (!selectedFamily || !parent?.email) return;
    const email = String(parent.email).toLowerCase();
    const draftKey = `${selectedFamily.familyKey}:${email}`;
    const draft = backgroundDrafts[draftKey] || {};
    const verifiedAt = draft.verifiedAt || existingRecord?.verifiedAt || today;
    const expiresAt = draft.expiresAt || existingRecord?.expiresAt || addYears(verifiedAt, 2);
    if (!expiresAt) {
      setActionStatus("Enter a background check expiration date before saving.");
      return;
    }
    try {
      setBackgroundSavingKey(draftKey);
      setActionStatus(`Saving background check for ${parent.name || email}...`);
      await saveParentBackgroundCheck(
        {
          familyKey: selectedFamily.familyKey,
          familyName: selectedFamily.familyName,
          parentName: parent.name || "",
          parentEmail: email,
          verifiedAt,
          expiresAt,
          status: draft.status || existingRecord?.status || "No Application",
          officeNote: draft.officeNote ?? existingRecord?.officeNote ?? "",
        },
        currentUserEmail
      );
      setActionStatus(`Background check saved for ${parent.name || email}.`);
      setBackgroundEditor(null);
      await loadData();
    } catch (error) {
      setActionStatus(`Unable to save background check: ${error.message}`);
    } finally {
      setBackgroundSavingKey("");
    }
  }

  return (
    <section className="mx-auto max-w-[1500px] px-5 py-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Office & Finance</div>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Family Records</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">A unified family view for contacts, students, invoices, lunch, FOS, portal access, and recent activity.</p>
        </div>
        <button type="button" onClick={() => loadData("Family records refreshed.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {data.error && <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{data.error}</div>}
      {data.loading && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading family records...</div>}

      <div className="mt-5 grid gap-5 xl:grid-cols-[330px_1fr]">
        <aside className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-16 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-500" placeholder="Search families, parents, students" />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1.5 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
          {selectedFamily && (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
              Viewing <span className="font-bold">{selectedFamily.familyName}</span>
            </div>
          )}
          {savedView !== "all" && (
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs font-semibold text-sky-900">
              Showing {savedViewLabels[savedView] || "filtered families"}.
              <button type="button" onClick={() => setSavedView("all")} className="ml-2 font-black underline-offset-4 hover:underline">
                Show all
              </button>
            </div>
          )}
          <div className="mt-3 max-h-[640px] overflow-auto pr-1">
            {filteredFamilies.map((family) => (
              <button
                key={family.familyKey}
                type="button"
                onClick={() => {
                  setSelectedFamilyKey(family.familyKey);
                  setSearch("");
                }}
                className={`mb-2 w-full rounded-lg border p-3 text-left transition ${selectedFamily?.familyKey === family.familyKey ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
              >
                <div className="truncate text-sm font-bold text-slate-950">{family.familyName}</div>
                <div className="mt-1 truncate text-xs text-slate-500">{family.students.map((student) => `${student.name}${student.grade ? ` (${student.grade})` : ""}`).join(", ")}</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {family.unpaidIncidentals.length > 0 && <StatusPill tone="rose">{family.unpaidIncidentals.length} unpaid</StatusPill>}
                  {family.pendingFos.length > 0 && <StatusPill tone="amber">{family.pendingFos.length} FOS pending</StatusPill>}
                  {Number(family.lunchAccount.balance || 0) < 0 && <StatusPill tone="amber">Lunch {money(family.lunchAccount.balance)}</StatusPill>}
                  {family.pendingDrivers.length > 0 && <StatusPill tone="amber">{family.pendingDrivers.length} driver pending</StatusPill>}
                  {family.verifiedDrivers.length > 0 && <StatusPill tone="emerald">Driver verified</StatusPill>}
                  {family.pendingStudentDrivers.length > 0 && <StatusPill tone="amber">{family.pendingStudentDrivers.length} student driver</StatusPill>}
                  {family.approvedStudentDrivers.length > 0 && <StatusPill tone="emerald">Student driver approved</StatusPill>}
                </div>
              </button>
            ))}
          </div>
        </aside>

        {selectedFamily && (
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-xl font-bold text-slate-950">{selectedFamily.familyName}</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFamily.parents.map((parent) => {
                      const parentEmail = String(parent.email || "").toLowerCase();
                      const verified = selectedFamily.verifiedDrivers.find((application) => String(application.parentEmail || "").toLowerCase() === parentEmail);
                      const backgroundCheck = selectedFamily.backgroundChecks.find((record) => String(record.parentEmail || "").toLowerCase() === parentEmail);
                      return (
                        <div key={`${parent.email}-${parent.name}`} className="flex min-w-[230px] flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-700">
                          <Mail size={12} className="shrink-0" />
                          <span className="min-w-0 flex-1 truncate">{parent.name || "Parent"} {parent.email ? `· ${parent.email}` : ""}</span>
                          {backgroundCheck && <StatusPill tone={backgroundCheckTone(backgroundCheck)}>{backgroundCheckLabel(backgroundCheck)}</StatusPill>}
                          {parent.email && (
                            <button
                              type="button"
                              onClick={() => openBackgroundCheckEditor(parent, backgroundCheck)}
                              className="rounded-md border border-sky-200 bg-white px-2 py-1 text-[11px] font-black text-sky-700 hover:bg-sky-50"
                            >
                              Background
                            </button>
                          )}
                          {verified && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-black text-emerald-800">
                              <ShieldCheck size={11} />
                              Driver
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {(() => {
                    const fosDraft = getFosAdjustmentDraft(selectedFamily);
                    const adjustedLiability = calculateFosLiabilityFromAdjustments(fosDraft);
                    const isOpen = Boolean(fosAdjustmentOpen[selectedFamily.familyKey]);
                    return (
                      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <button
                          type="button"
                          onClick={() => setFosAdjustmentOpen((current) => ({ ...current, [selectedFamily.familyKey]: !current[selectedFamily.familyKey] }))}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div>
                            <div className="text-xs font-black uppercase tracking-[0.14em] text-slate-500">FOS Adjustments</div>
                            <div className="mt-0.5 text-[11px] text-slate-600">
                              {fosDraft.fullTimeStaff || fosDraft.partTimeStaff || fosDraft.singleParentHousehold ? "Office-only adjustment active" : "Collapsed by default"}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-black text-slate-800">{money(adjustedLiability)}</span>
                            <span className="text-xs font-black text-sky-700">{isOpen ? "Hide" : "Edit"}</span>
                          </div>
                        </button>
                        {isOpen && (
                          <div className="mt-3 border-t border-slate-200 pt-3">
                            <div className="grid gap-2 lg:grid-cols-[auto_auto_minmax(150px,190px)_auto_auto] lg:items-center">
                              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={fosDraft.fullTimeStaff}
                                  onChange={(event) => updateFosAdjustmentDraft(selectedFamily.familyKey, { fullTimeStaff: event.target.checked, partTimeStaff: event.target.checked ? false : fosDraft.partTimeStaff })}
                                  className="h-4 w-4 accent-sky-600"
                                />
                                Full-time
                              </label>
                              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={fosDraft.partTimeStaff}
                                  disabled={fosDraft.fullTimeStaff}
                                  onChange={(event) => updateFosAdjustmentDraft(selectedFamily.familyKey, { partTimeStaff: event.target.checked })}
                                  className="h-4 w-4 accent-sky-600 disabled:opacity-50"
                                />
                                Part-time
                              </label>
                              <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                                <span className="shrink-0">Percent</span>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="1"
                                value={fosDraft.partTimePercent}
                                disabled={!fosDraft.partTimeStaff || fosDraft.fullTimeStaff}
                                onChange={(event) => updateFosAdjustmentDraft(selectedFamily.familyKey, { partTimePercent: event.target.value })}
                                  className="w-20 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-950 outline-none focus:border-sky-500 disabled:bg-slate-100 disabled:text-slate-400"
                              />
                                <span>%</span>
                              </label>
                              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={fosDraft.singleParentHousehold}
                                  onChange={(event) => updateFosAdjustmentDraft(selectedFamily.familyKey, { singleParentHousehold: event.target.checked })}
                                  className="h-4 w-4 accent-sky-600"
                                />
                                Single parent
                              </label>
                              <button
                                type="button"
                                onClick={() => saveFosAdjustment(selectedFamily)}
                                disabled={fosAdjustmentSavingKey === selectedFamily.familyKey}
                                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-sky-600 bg-sky-600 px-2.5 py-1.5 text-xs font-black text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                <Save size={13} />
                                {fosAdjustmentSavingKey === selectedFamily.familyKey ? "Saving..." : "Save"}
                              </button>
                            </div>
                            <div className="mt-2 text-[11px] leading-4 text-slate-500">Full-time: $0. Part-time: percent reduction. Single parent: 50% reduction after staff adjustment.</div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 lg:w-[360px]">
                  <div className="font-bold text-slate-900">Portal Access</div>
                  <div className="mt-1">Last login: {formatDate(selectedFamily.access?.lastParentLoginAt)}</div>
                  {selectedFamily.access?.lastParentLoginEmail && <div>User: {selectedFamily.access.lastParentLoginEmail}</div>}
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <div className="font-bold text-slate-900">Send Family Portal Invite</div>
                    <div className="mt-2 grid gap-2">
                      {(selectedFamily.parents || []).filter((parent) => parent.email).map((parent) => {
                        const email = parent.email.toLowerCase();
                        const checked = selectedInviteRecipients.includes(email);
                        return (
                          <label key={email} className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-2 py-2">
                            <input type="checkbox" checked={checked} onChange={() => toggleInviteRecipient(email)} className="mt-0.5 h-4 w-4 accent-sky-600" />
                            <span className="min-w-0">
                              <span className="block truncate font-semibold text-slate-800">{parent.name || "Parent / Guardian"}</span>
                              <span className="block truncate text-[11px] text-slate-500">{email}</span>
                            </span>
                          </label>
                        );
                      })}
                      {!(selectedFamily.parents || []).some((parent) => parent.email) && <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">No parent emails are attached to this family.</div>}
                    </div>
                    <button
                      type="button"
                      onClick={() => sendPortalInvite(selectedFamily)}
                      disabled={portalLoadingKey === selectedFamily.familyKey}
                      aria-busy={portalLoadingKey === selectedFamily.familyKey}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Mail size={15} />
                      {portalLoadingKey === selectedFamily.familyKey ? "Sending..." : "Send Invite"}
                    </button>
                    <div className="mt-2 text-[11px] leading-4 text-slate-500">Only checked emails will be authorized for this family portal.</div>
                  </div>
                </div>
              </div>
            </div>
            {actionStatus && <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">{actionStatus}</div>}

            {backgroundEditor && selectedFamily && (() => {
              const parent = (selectedFamily.parents || []).find((item) => String(item.email || "").toLowerCase() === backgroundEditor.parentEmail);
              const existingRecord = selectedFamily.backgroundChecks.find((record) => String(record.parentEmail || "").toLowerCase() === backgroundEditor.parentEmail);
              const draftKey = `${selectedFamily.familyKey}:${backgroundEditor.parentEmail}`;
              const draft = backgroundDrafts[draftKey] || {};
              const completedAt = draft.verifiedAt || existingRecord?.verifiedAt || today;
              const expiresAt = draft.expiresAt || existingRecord?.expiresAt || addYears(completedAt, 2);
              const status = draft.status || existingRecord?.status || "No Application";
              const previewRecord = { ...existingRecord, status, expiresAt };
              return (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-black text-slate-950">Background Check</div>
                        <StatusPill tone={backgroundCheckTone(previewRecord)}>{backgroundCheckLabel(previewRecord)}</StatusPill>
                      </div>
                      <div className="mt-1 text-xs text-slate-600">{backgroundEditor.parentName} · {backgroundEditor.parentEmail}</div>
                      {isExpiredBackgroundCheck(previewRecord) && <div className="mt-2 rounded-md border border-rose-200 bg-white px-2 py-1 text-xs font-bold text-rose-800">This background check is expired.</div>}
                    </div>
                    <button type="button" onClick={() => setBackgroundEditor(null)} className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50">
                      Close
                    </button>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-[150px_150px_150px_1fr_auto] md:items-end">
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      Status
                      <select
                        value={status}
                        onChange={(event) => setBackgroundDrafts((currentDrafts) => ({ ...currentDrafts, [draftKey]: { ...draft, status: event.target.value } }))}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-950 outline-none focus:border-sky-500"
                      >
                        <option>No Application</option>
                        <option>Approved</option>
                        <option>Denied</option>
                        <option>Pending</option>
                        <option>Revoked</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      Filled out
                      <input
                        type="date"
                        value={completedAt}
                        onChange={(event) => setBackgroundDrafts((currentDrafts) => ({ ...currentDrafts, [draftKey]: { ...draft, verifiedAt: event.target.value, expiresAt: addYears(event.target.value, 2) } }))}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-950 outline-none focus:border-sky-500"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      Expires
                      <input
                        type="date"
                        value={expiresAt}
                        onChange={(event) => setBackgroundDrafts((currentDrafts) => ({ ...currentDrafts, [draftKey]: { ...draft, expiresAt: event.target.value } }))}
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-950 outline-none focus:border-sky-500"
                      />
                    </label>
                    <label className="grid gap-1 text-xs font-bold text-slate-700">
                      Office note
                      <input
                        value={draft.officeNote ?? existingRecord?.officeNote ?? ""}
                        onChange={(event) => setBackgroundDrafts((currentDrafts) => ({ ...currentDrafts, [draftKey]: { ...draft, officeNote: event.target.value } }))}
                        placeholder="Optional"
                        className="rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => saveBackgroundCheckForParent(parent, existingRecord)}
                      disabled={backgroundSavingKey === draftKey}
                      className="rounded-lg border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700 disabled:opacity-60"
                    >
                      {backgroundSavingKey === draftKey ? "Saving..." : "Save"}
                    </button>
                  </div>
                  <div className="mt-2 text-[11px] leading-4 text-slate-500">Expiration auto-fills to two years after the filled-out date, but can be adjusted if needed.</div>
                </div>
              );
            })()}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><DollarSign size={14} />Incidentals</div><div className="mt-2 text-2xl font-black text-slate-950">{money(selectedFamily.unpaidIncidentals.reduce((sum, invoice) => sum + invoiceBalance(invoice), 0))}</div><div className="text-xs text-slate-500">{selectedFamily.unpaidIncidentals.length} unpaid invoice(s)</div></div>
              <div className="rounded-lg border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><Utensils size={14} />Lunch Account</div><div className={`mt-2 text-2xl font-black ${Number(selectedFamily.lunchAccount.balance || 0) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(selectedFamily.lunchAccount.balance)}</div><div className="text-xs text-slate-500">Available lunch account balance</div></div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-700"><ShieldCheck size={14} />FOS Amount Owed</div><div className="mt-2 text-2xl font-black text-amber-900">{money(selectedFamily.fos.remainingBalance)}</div><div className="text-xs text-amber-800">Amount still owed after {selectedFamily.fos.approvedHours} approved hour(s); {selectedFamily.pendingFos.length} pending</div></div>
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-500"><Users size={14} />Students</div>
                <div className="mt-2 text-lg font-black text-slate-950">{selectedFamily.students.length} {selectedFamily.students.length === 1 ? "student" : "students"}</div>
                <div className="mt-2 grid gap-1">
                  {selectedFamily.students.slice(0, 4).map((student) => (
                    <div key={student.studentId || student.name} className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                      <span className="truncate font-semibold text-slate-800">{student.name || "Student"}</span>
                      <span className="shrink-0 font-bold text-slate-500">{student.grade ? `Grade ${student.grade}` : "No grade"}</span>
                    </div>
                  ))}
                  {selectedFamily.students.length > 4 && <div className="text-xs font-semibold text-slate-500">+ {selectedFamily.students.length - 4} more student(s)</div>}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><ShieldCheck size={16} className="text-emerald-600" />Volunteer Drivers</div>
                <div className="mt-3 grid gap-2">
                  {selectedFamily.driverApplications.map((application) => (
                    <div key={application.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-bold text-slate-900">{application.parentName || application.parentEmail || "Driver"}</div>
                            <StatusPill tone={driverTone(application.status)}>{application.status}</StatusPill>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            Submitted {formatDate(application.submittedAt)}{application.expiresAt ? ` · Expires ${formatDate(application.expiresAt)}` : ""}
                          </div>
                          {application.officeNote && <div className="mt-1 text-xs text-slate-600">Office note: {application.officeNote}</div>}
                          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                              <div className="font-bold text-slate-900">Driving history</div>
                              <div className="mt-1">Commercial license: {application.application?.commercialLicense || "Not answered"}</div>
                              <div>Accident in last 3 years: {application.application?.accidentLastThreeYears || "Not answered"}</div>
                              <div>Moving violation in last 3 years: {application.application?.movingViolationLastThreeYears || "Not answered"}</div>
                              <div>DWI/DUI or suspension history: {application.application?.duiOrSuspensionHistory || "Not answered"}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                              <div className="font-bold text-slate-900">Driver certification</div>
                              <div className="mt-1">State license: {application.application?.stateLicense || "Not listed"}</div>
                              <div>Requirements acknowledged: {application.application?.driverRequirementsAcknowledged ? "Yes" : "No"}</div>
                              <div>Signed: {application.application?.electronicSignature || "Not signed"}</div>
                              <div>Date: {application.application?.signatureDate || "Not dated"}</div>
                            </div>
                          </div>
                          {(application.application?.accidentExplanation || application.application?.movingViolationExplanation) && (
                            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-900">
                              {application.application?.accidentExplanation && <div><span className="font-bold">Accident note:</span> {application.application.accidentExplanation}</div>}
                              {application.application?.movingViolationExplanation && <div><span className="font-bold">Moving violation note:</span> {application.application.movingViolationExplanation}</div>}
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(application.attachments || []).map((attachment) => (
                            <button
                              key={attachment.path || attachment.name}
                              type="button"
                              onClick={() => openDriverAttachment(attachment)}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
                            >
                              <ExternalLink size={13} />
                              {attachment.label || "Document"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {application.status === "Pending" && (
                        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 lg:grid-cols-[1fr_auto_auto]">
                          <input
                            value={driverReviewDrafts[application.id] || ""}
                            onChange={(event) => setDriverReviewDrafts((current) => ({ ...current, [application.id]: event.target.value }))}
                            placeholder="Optional office note"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-500"
                          />
                          <button
                            type="button"
                            onClick={() => reviewDriverApplication(application, "verify")}
                            disabled={driverReviewingId === application.id}
                            className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                          >
                            Verify
                          </button>
                          <button
                            type="button"
                            onClick={() => reviewDriverApplication(application, "deny")}
                            disabled={driverReviewingId === application.id}
                            className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                          >
                            Deny
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!selectedFamily.driverApplications.length && <div className="text-sm text-slate-500">No volunteer driver applications yet.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><FileSignature size={16} className="text-sky-600" />Student Drivers</div>
                <div className="mt-3 grid gap-2">
                  {selectedFamily.studentDriverRegistrations.map((registration) => (
                    <div key={registration.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-bold text-slate-900">{registration.studentName || "Student Driver"}</div>
                            <StatusPill tone={studentDriverTone(registration.status)}>{registration.status}</StatusPill>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">
                            Grade {registration.studentGrade || "not listed"} · Submitted {formatDate(registration.submittedAt)}{registration.expiresAt ? ` · Expires ${formatDate(registration.expiresAt)}` : ""}
                          </div>
                          {registration.officeNote && <div className="mt-1 text-xs text-slate-600">Office note: {registration.officeNote}</div>}
                          <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                              <div className="font-bold text-slate-900">Vehicle</div>
                              <div className="mt-1">License: {registration.registration?.driverLicenseNumber || "Not listed"}</div>
                              <div>Vehicle: {[registration.registration?.vehicleColor, registration.registration?.vehicleMake, registration.registration?.vehicleModel].filter(Boolean).join(" ") || "Not listed"}</div>
                              <div>Plate: {registration.registration?.licensePlate || "Not listed"}</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                              <div className="font-bold text-slate-900">Insurance & signatures</div>
                              <div className="mt-1">Insurance: {registration.registration?.insuranceCompany || "Not listed"}</div>
                              <div>Policy #: {registration.registration?.policyNumber || "Not listed"}</div>
                              <div>Parent signed: {registration.registration?.parentSignature || "No"}</div>
                              <div>Student signed: {registration.registration?.studentSignature || "No"}</div>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(registration.attachments || []).map((attachment) => (
                            <button
                              key={attachment.path || attachment.name}
                              type="button"
                              onClick={() => openDriverAttachment(attachment)}
                              className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
                            >
                              <ExternalLink size={13} />
                              {attachment.label || "Document"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {registration.status === "Pending" || registration.status === "Needs Correction" ? (
                        <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 xl:grid-cols-[1fr_auto_auto_auto]">
                          <input
                            value={studentDriverReviewDrafts[registration.id] || ""}
                            onChange={(event) => setStudentDriverReviewDrafts((current) => ({ ...current, [registration.id]: event.target.value }))}
                            placeholder="Optional office note"
                            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-500"
                          />
                          <button type="button" onClick={() => reviewStudentDriver(registration, "approve")} disabled={studentDriverReviewingId === registration.id} className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">Approve</button>
                          <button type="button" onClick={() => reviewStudentDriver(registration, "correction")} disabled={studentDriverReviewingId === registration.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-60">Correction</button>
                          <button type="button" onClick={() => reviewStudentDriver(registration, "deny")} disabled={studentDriverReviewingId === registration.id} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Deny</button>
                        </div>
                      ) : registration.status === "Approved" && (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <button type="button" onClick={() => reviewStudentDriver(registration, "revoke")} disabled={studentDriverReviewingId === registration.id} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Revoke</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!selectedFamily.studentDriverRegistrations.length && <div className="text-sm text-slate-500">No student driver registrations yet.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><FileText size={16} className="text-sky-600" />Off-Campus Lunch Permissions</div>
                <div className="mt-3 grid gap-2">
                  {selectedFamily.offCampusLunchPermissions.map((permission) => {
                    const allowedDrivers = Array.isArray(permission.permission?.approvedStudentDrivers)
                      ? permission.permission.approvedStudentDrivers.filter(Boolean)
                      : [];
                    return (
                      <div key={permission.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-bold text-slate-900">{permission.studentName || "Student"}</div>
                              <StatusPill tone={offCampusPermissionTone(permission.status)}>{permission.status}</StatusPill>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              Grade {permission.studentGrade || "not listed"} · Submitted {formatDate(permission.submittedAt)}{permission.expiresAt ? ` · Expires ${formatDate(permission.expiresAt)}` : ""}
                            </div>
                            {permission.officeNote && <div className="mt-1 text-xs text-slate-600">Office note: {permission.officeNote}</div>}
                            <div className="mt-3 grid gap-2 text-xs text-slate-600 md:grid-cols-3">
                              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                <div className="font-bold text-slate-900">Leave campus</div>
                                <div className="mt-1">{permission.permission?.permitLeaveCampusLunch ? "Permitted" : "Not permitted"}</div>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                <div className="font-bold text-slate-900">Student driving</div>
                                <div className="mt-1">Drive self: {permission.permission?.permitStudentDriveSelf ? "Yes" : "No"}</div>
                                <div>Drive others: {permission.permission?.permitStudentDriveOthers ? "Yes" : "No"}</div>
                              </div>
                              <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                                <div className="font-bold text-slate-900">May ride with</div>
                                <div className="mt-1">{allowedDrivers.length ? allowedDrivers.join(", ") : "No student drivers listed"}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                        {permission.status === "Pending" || permission.status === "Needs Correction" ? (
                          <div className="mt-3 grid gap-2 border-t border-slate-200 pt-3 xl:grid-cols-[1fr_auto_auto_auto]">
                            <input
                              value={offCampusReviewDrafts[permission.id] || ""}
                              onChange={(event) => setOffCampusReviewDrafts((current) => ({ ...current, [permission.id]: event.target.value }))}
                              placeholder="Optional office note"
                              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-sky-500"
                            />
                            <button type="button" onClick={() => reviewOffCampusLunch(permission, "approve")} disabled={offCampusReviewingId === permission.id} className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60">Approve</button>
                            <button type="button" onClick={() => reviewOffCampusLunch(permission, "correction")} disabled={offCampusReviewingId === permission.id} className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-60">Correction</button>
                            <button type="button" onClick={() => reviewOffCampusLunch(permission, "deny")} disabled={offCampusReviewingId === permission.id} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Deny</button>
                          </div>
                        ) : permission.status === "Approved" && (
                          <div className="mt-3 border-t border-slate-200 pt-3">
                            <button type="button" onClick={() => reviewOffCampusLunch(permission, "revoke")} disabled={offCampusReviewingId === permission.id} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Revoke</button>
                          </div>
                        )}
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <button type="button" onClick={() => openOffCampusLunchRecord(permission)} className="rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-sky-700 hover:bg-sky-50">
                            View / Print Signed Record
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {!selectedFamily.offCampusLunchPermissions.length && <div className="text-sm text-slate-500">No off-campus lunch permissions yet.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><FileText size={16} className="text-sky-600" />Invoices</div>
                <div className="mt-3 grid gap-2">
                  {[...selectedFamily.incidentalInvoices, ...selectedFamily.tuitionInvoices].slice(0, 10).map((invoice) => (
                    <div key={invoice.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-bold text-slate-900">{invoice.invoice?.title || invoice.schoolYear || invoice.familyName}</div>
                          <div className="mt-1 text-xs text-slate-500">{formatDate(invoice.sentAt || invoice.updatedAt || invoice.createdAt)}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            <span className="rounded-full border border-slate-200 bg-white px-2 py-1 font-bold text-slate-700">{invoiceCategory(invoice)}</span>
                            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-bold text-emerald-800">{money(invoiceBalance(invoice))}</span>
                          </div>
                        </div>
                        <StatusPill tone={paymentTone(invoice)}>{invoice.paymentStatus || invoice.status || "Draft"}</StatusPill>
                      </div>
                    </div>
                  ))}
                  {!selectedFamily.incidentalInvoices.length && !selectedFamily.tuitionInvoices.length && <div className="text-sm text-slate-500">No invoice records yet.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><ClipboardCheck size={16} className="text-sky-600" />Permissions & Forms</div>
                <div className="mt-3 grid gap-2">
                  {selectedFamily.familyDocuments.slice(0, 10).map((document) => (
                    <div key={`${document.type}-${document.id}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-bold text-slate-900">{document.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{document.studentName || document.type}{document.at ? ` · ${formatDate(document.at)}` : ""}</div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <StatusPill tone={document.type === "Permission Slip" ? "sky" : "slate"}>{document.type}</StatusPill>
                            <StatusPill tone={document.status === "Signed" || document.status === "Approved" ? "emerald" : document.status === "Unsigned" || document.status === "Pending" ? "amber" : "slate"}>{document.status}</StatusPill>
                          </div>
                        </div>
                        {document.type === "Permission Slip" && document.status === "Signed" && (
                          <button
                            type="button"
                            onClick={() => openPermissionDocument(document)}
                            className="shrink-0 rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-700 hover:bg-sky-50"
                          >
                            View PDF
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {!selectedFamily.familyDocuments.length && <div className="text-sm text-slate-500">No permission or form records yet.</div>}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><History size={16} className="text-sky-600" />Recent Activity</div>
                <div className="mt-3 grid gap-2">
                  {timeline.map((event) => (
                    <div key={event.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-700">{event.type}</div>
                          <div className="mt-1 text-sm font-bold text-slate-900">{event.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{event.detail}</div>
                        </div>
                        <div className="shrink-0 text-right text-[11px] font-semibold text-slate-500">{formatDate(event.at)}</div>
                      </div>
                    </div>
                  ))}
                  {!timeline.length && <div className="text-sm text-slate-500">No activity records yet.</div>}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function OfficeRolloverModule({ embedded = false }) {
  const checklist = [
    "Import or replace the new student roster after final enrollment is ready.",
    "Confirm family portal access for returning families and invite new families individually.",
    "Archive old permission slip campaigns and keep signed PDFs available for records.",
    "Create the new FOS school year and review custom family liability amounts.",
    "Publish the first lunch menu for the new school year after prices are confirmed.",
    "Review unpaid incidental balances before carrying balances forward.",
  ];

  const Wrapper = embedded ? "div" : "section";
  return (
    <Wrapper className={embedded ? "" : "mx-auto max-w-[1500px] px-5 py-5"}>
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-sky-700"><Clock size={15} />Yearly Rollover</div>
        <h2 className="mt-2 text-2xl font-bold text-slate-950">School Year Rollover Checklist</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          This is a safe planning area for the {FOS_SCHOOL_YEAR} data cycle. Nothing here changes records yet; it keeps the rollover steps visible before we add one-click archive/promote actions.
        </p>
        <div className="mt-5 grid gap-3">
          {checklist.map((item, index) => (
            <div key={item} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-sky-200 bg-sky-50 text-xs font-black text-sky-700">{index + 1}</div>
              <div className="text-sm font-semibold text-slate-800">{item}</div>
            </div>
          ))}
        </div>
      </div>
    </Wrapper>
  );
}

function FamilyPortalSettingsPanel({ currentUserEmail = "" }) {
  const [settings, setSettings] = useState(DEFAULT_FAMILY_PORTAL_SETTINGS);
  const [status, setStatus] = useState("Loading family portal settings...");

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const result = await fetchFamilyPortalSettings();
        if (!active) return;
        setSettings(result.settings || DEFAULT_FAMILY_PORTAL_SETTINGS);
        setStatus(result.loaded ? "Family portal settings loaded." : result.reason);
      } catch (error) {
        if (active) setStatus(`Unable to load settings: ${error.message}`);
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  async function saveSettings() {
    setStatus("Saving family portal settings...");
    try {
      const result = await saveFamilyPortalSettings(settings, currentUserEmail);
      setSettings(result.settings || settings);
      setStatus(result.saved ? "Family portal settings saved." : result.reason);
    } catch (error) {
      setStatus(`Unable to save settings: ${error.message}`);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
          <Bell size={16} className="text-sky-600" />
          Family Portal Announcement
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">Use this for short parent-facing notices that should appear near the top of the secure family portal.</p>
        <label className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={settings.announcement.enabled}
            onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, enabled: event.target.checked } })}
            className="h-4 w-4 rounded border-slate-300"
          />
          Show announcement in family portal
        </label>
        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Banner title
            <input
              value={settings.announcement.title}
              onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, title: event.target.value } })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="Family Portal Announcement"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Banner message
            <textarea
              value={settings.announcement.message}
              onChange={(event) => setSettings({ ...settings, announcement: { ...settings.announcement, message: event.target.value } })}
              rows={4}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-sky-500"
              placeholder="Type the short parent-facing announcement here."
            />
          </label>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <Info size={16} className="text-sky-600" />
            Need Help Box
          </div>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Office phone
              <input value={settings.help.phone} onChange={(event) => setSettings({ ...settings, help: { ...settings.help, phone: event.target.value } })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Office email
              <input value={settings.help.email} onChange={(event) => setSettings({ ...settings, help: { ...settings.help, email: event.target.value } })} className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500" />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Help message
              <textarea value={settings.help.message} onChange={(event) => setSettings({ ...settings, help: { ...settings.help, message: event.target.value } })} rows={3} className="rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-sky-500" />
            </label>
          </div>
        </div>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <div className="font-bold">Office note</div>
          Before inviting a family, confirm the contacts in Family Records, especially if only one parent or guardian should have portal access.
        </div>
        <button type="button" onClick={saveSettings} className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700">
          <Save size={16} />
          Save Portal Settings
        </button>
        {status && <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{status}</div>}
      </div>
    </div>
  );
}

export function OfficeEmailSettingsPanel({ currentUserEmail = "", compact = false, showIdentityFields = false }) {
  const [settings, setSettings] = useState(DEFAULT_OFFICE_EMAIL_SETTINGS);
  const [status, setStatus] = useState("Loading email settings...");

  useEffect(() => {
    let active = true;
    async function loadSettings() {
      try {
        const result = await fetchOfficeEmailSettings();
        if (!active) return;
        setSettings(result.settings || DEFAULT_OFFICE_EMAIL_SETTINGS);
        setStatus(result.loaded ? "Email settings loaded." : result.reason);
      } catch (error) {
        if (active) setStatus(`Unable to load email settings: ${error.message}`);
      }
    }
    loadSettings();
    return () => {
      active = false;
    };
  }, []);

  async function saveSettings() {
    setStatus("Saving email settings...");
    try {
      const result = await saveOfficeEmailSettings(settings, currentUserEmail);
      setSettings(result.settings || settings);
      setStatus(result.saved ? "Email settings saved." : result.reason);
    } catch (error) {
      setStatus(`Unable to save email settings: ${error.message}`);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
          <Mail size={16} className="text-sky-600" />
          Office Email Replies
        </div>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Tuition breakdown and incidental invoice replies will go to this inbox when families click reply.
        </p>
        {showIdentityFields && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Sender Display Name
              <input
                value={settings.senderDisplayName}
                onChange={(event) => setSettings({ ...settings, senderDisplayName: event.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="WVCS School Hub"
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold text-slate-700">
              Desired Hub Sender Email
              <input
                type="email"
                value={settings.desiredSenderEmail}
                onChange={(event) => setSettings({ ...settings, desiredSenderEmail: event.target.value })}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
                placeholder="hub@wvcs.org"
              />
            </label>
          </div>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Finance Reply-To Email
            <input
              type="email"
              value={settings.financeReplyToEmail}
              onChange={(event) => setSettings({ ...settings, financeReplyToEmail: event.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="office@wvcs.org"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold text-slate-700">
            Optional BCC Archive
            <input
              type="email"
              value={settings.bccArchiveEmail}
              onChange={(event) => setSettings({ ...settings, bccArchiveEmail: event.target.value })}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              placeholder="Optional"
            />
          </label>
        </div>
        {!compact && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
            The visible sender still uses the verified Gmail account configured on the server. This setting controls where parent replies go.
          </div>
        )}
        {showIdentityFields && (
          <label className="mt-4 grid gap-1 text-sm font-semibold text-slate-700">
            Internal Setup Note
            <textarea
              value={settings.setupNote}
              onChange={(event) => setSettings({ ...settings, setupNote: event.target.value })}
              rows={3}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-sky-500"
            />
          </label>
        )}
      </div>
      <div className="grid gap-3">
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs leading-5 text-sky-900">
          <div className="font-bold">Recommended setup</div>
          Use a shared office inbox for billing questions, such as office@wvcs.org or finance@wvcs.org, so replies do not depend on one person's account.
        </div>
        <button type="button" onClick={saveSettings} className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700">
          <Save size={16} />
          Save Email Settings
        </button>
        {status && <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">{status}</div>}
      </div>
    </div>
  );
}

function ParentAccessAuditPanel() {
  const [state, setState] = useState({ loading: true, access: [], families: [], error: "" });
  const [search, setSearch] = useState("");

  async function loadAudit() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [accessResult, directoryResult] = await Promise.all([fetchFamilyPortalAccessRecords(), fetchOfficeFamilyDirectory()]);
      setState({
        loading: false,
        access: accessResult.access || [],
        families: directoryResult.families || [],
        error: accessResult.reason || directoryResult.reason || "",
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }

  useEffect(() => {
    loadAudit();
  }, []);

  const familyMap = useMemo(() => new Map(state.families.map((family) => [family.familyKey, family])), [state.families]);
  const rows = state.access
    .map((record) => {
      const family = familyMap.get(record.familyKey);
      return {
        ...record,
        students: family?.students || [],
        parents: family?.parents || [],
        searchText: `${record.familyName} ${(record.contactEmails || []).join(" ")} ${(family?.students || []).map((student) => `${student.name} ${student.grade}`).join(" ")}`.toLowerCase(),
      };
    })
    .filter((row) => !search.trim() || row.searchText.includes(search.trim().toLowerCase()))
    .sort((a, b) => a.familyName.localeCompare(b.familyName, undefined, { sensitivity: "base" }));

  const loggedInCount = state.access.filter((record) => record.lastParentLoginAt).length;
  const missingPortalRecordCount = Math.max(state.families.length - state.access.length, 0);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <ClipboardCheck size={16} className="text-sky-600" />
            Parent Access Audit
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Review which families have portal access, who last signed in, and which contacts are connected.</p>
        </div>
        <button type="button" onClick={loadAudit} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Roster Families</div><div className="mt-1 text-xl font-black text-slate-950">{state.families.length}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Portal Records Created</div><div className="mt-1 text-xl font-black text-slate-950">{state.access.length}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Logged In</div><div className="mt-1 text-xl font-black text-slate-950">{loggedInCount}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Needs Portal Setup</div><div className="mt-1 text-xl font-black text-slate-950">{missingPortalRecordCount}</div></div>
      </div>

      <div className="mt-4 relative">
        <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-500" placeholder="Search family, email, student, or grade" />
      </div>
      {state.error && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{state.error}</div>}
      {state.loading && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Loading parent access records...</div>}

      <div className="mt-4 max-h-[560px] overflow-auto rounded-lg border border-slate-200">
        {rows.map((row) => (
          <div key={row.familyKey} className="grid gap-3 border-b border-slate-200 p-3 text-sm last:border-b-0 lg:grid-cols-[220px_1fr_250px]">
            <div>
              <div className="font-bold text-slate-950">{row.familyName}</div>
              <div className="mt-1 text-xs text-slate-500">{row.students.map((student) => `${student.name}${student.grade ? `, grade ${student.grade}` : ""}`).join(" | ") || "No roster students matched"}</div>
            </div>
            <div className="text-xs leading-5 text-slate-600">{(row.contactEmails || []).join(", ") || "No portal emails recorded"}</div>
            <div className="text-xs leading-5 text-slate-600">
              <div className="font-bold text-slate-900">{row.lastParentLoginAt ? "Logged in" : "No login recorded"}</div>
              <div>{formatDate(row.lastParentLoginAt)}</div>
              {row.lastParentLoginEmail && <div>{row.lastParentLoginEmail}</div>}
            </div>
          </div>
        ))}
        {!rows.length && !state.loading && <div className="p-4 text-sm text-slate-500">No parent access records match this search.</div>}
      </div>
    </div>
  );
}

function formatAuditDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function EmailAuditPanel() {
  const [state, setState] = useState({ loading: true, entries: [], error: "" });
  const [search, setSearch] = useState("");
  const [backfilling, setBackfilling] = useState(false);

  async function loadAudit() {
    setState((current) => ({ ...current, loading: true }));
    try {
      const result = await fetchEmailAuditLog();
      setState({ loading: false, entries: result.entries || [], error: result.loaded ? "" : result.reason });
    } catch (error) {
      setState({ loading: false, entries: [], error: error.message });
    }
  }

  useEffect(() => {
    loadAudit();
  }, []);

  async function backfillAudit() {
    if (!window.confirm("Backfill the email audit from existing Hub records? This can be run more than once without duplicating the same records.")) return;
    setBackfilling(true);
    setState((current) => ({ ...current, error: "Backfilling historical email records..." }));
    try {
      const result = await backfillEmailAuditLog();
      await loadAudit();
      setState((current) => ({
        ...current,
        error: result.backfilled
          ? `Backfill complete. Added ${result.added || 0} possible historical records. Showing ${result.total || current.entries.length} total audit rows.`
          : result.reason || "Backfill did not complete.",
      }));
    } catch (error) {
      setState((current) => ({ ...current, error: `Unable to backfill email audit: ${error.message}` }));
    } finally {
      setBackfilling(false);
    }
  }

  const filteredEntries = state.entries.filter((entry) =>
    `${entry.module} ${entry.subject} ${(entry.recipients || []).join(" ")} ${entry.senderEmail} ${entry.actorEmail} ${entry.status}`.toLowerCase().includes(search.toLowerCase())
  );
  const auditSummary = state.entries.reduce((summary, entry) => {
    const status = String(entry.status || "sent").toLowerCase();
    const module = entry.module || "Other";
    return {
      ...summary,
      total: summary.total + 1,
      noRecipients: summary.noRecipients + (status.includes("no recipient") ? 1 : 0),
      backfilled: summary.backfilled + (status.includes("backfilled") ? 1 : 0),
      failed: summary.failed + (status.includes("fail") || status.includes("error") ? 1 : 0),
      modules: { ...summary.modules, [module]: (summary.modules[module] || 0) + 1 },
    };
  }, { total: 0, noRecipients: 0, backfilled: 0, failed: 0, modules: {} });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <Mail size={16} className="text-sky-600" />
            Hub Email Audit
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Recent emails sent by Hub automation. The log keeps the latest 500 entries.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="relative">
            <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-72 rounded-lg border border-slate-300 px-9 py-2 text-sm text-slate-900 outline-none focus:border-sky-500"
              placeholder="Search emails..."
            />
          </label>
          <button type="button" onClick={loadAudit} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw size={15} />
            Refresh
          </button>
          <button type="button" onClick={backfillAudit} disabled={backfilling} className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60">
            <History size={15} />
            {backfilling ? "Backfilling..." : "Backfill"}
          </button>
        </div>
      </div>
      {state.error && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{state.error}</div>}
      {state.loading && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">Loading email audit...</div>}
      <div className="mt-4 grid gap-3 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Logged Emails</div><div className="mt-1 text-xl font-black text-slate-950">{auditSummary.total}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">No Recipients</div><div className="mt-1 text-xl font-black text-slate-950">{auditSummary.noRecipients}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Failures</div><div className="mt-1 text-xl font-black text-slate-950">{auditSummary.failed}</div></div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Backfilled</div><div className="mt-1 text-xl font-black text-slate-950">{auditSummary.backfilled}</div></div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        {Object.entries(auditSummary.modules).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([module, count]) => (
          <span key={module} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-700">{module}: {count}</span>
        ))}
      </div>
      <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[130px_150px_1fr_1fr_90px] gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
          <div>Sent</div>
          <div>Type</div>
          <div>Subject</div>
          <div>Recipients</div>
          <div>Status</div>
        </div>
        {filteredEntries.slice(0, 150).map((entry) => (
          <div key={entry.id} className="grid grid-cols-[130px_150px_1fr_1fr_90px] gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
            <div className="font-semibold text-slate-700">{formatAuditDate(entry.sentAt)}</div>
            <div className="text-slate-700">{entry.module}</div>
            <div>
              <div className="font-semibold text-slate-950">{entry.subject || "No subject"}</div>
              <div className="text-xs text-slate-500">From {entry.senderEmail || "Hub"}{entry.actorEmail ? ` | Actor ${entry.actorEmail}` : ""}</div>
            </div>
            <div className="truncate text-slate-700" title={(entry.recipients || []).join(", ")}>{(entry.recipients || []).join(", ")}</div>
            <div className="font-bold text-emerald-700">{entry.status || "sent"}</div>
          </div>
        ))}
        {!filteredEntries.length && !state.loading && <div className="p-5 text-sm text-slate-500">No email audit entries found yet.</div>}
      </div>
    </div>
  );
}

function SecurityReviewPanel() {
  const [state, setState] = useState({ loading: true, families: [], access: [], emailEntries: [], officeEmail: DEFAULT_OFFICE_EMAIL_SETTINGS, error: "" });

  async function loadSecurityReview() {
    setState((current) => ({ ...current, loading: true, error: "" }));
    try {
      const [directoryResult, accessResult, auditResult, emailResult] = await Promise.all([
        fetchOfficeFamilyDirectory(),
        fetchFamilyPortalAccessRecords(),
        fetchEmailAuditLog(),
        fetchOfficeEmailSettings(),
      ]);
      setState({
        loading: false,
        families: directoryResult.families || [],
        access: accessResult.access || [],
        emailEntries: auditResult.entries || [],
        officeEmail: emailResult.settings || DEFAULT_OFFICE_EMAIL_SETTINGS,
        error: directoryResult.reason || accessResult.reason || auditResult.reason || emailResult.reason || "",
      });
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: error.message }));
    }
  }

  useEffect(() => {
    loadSecurityReview();
  }, []);

  const accessByFamily = useMemo(() => new Map(state.access.map((record) => [record.familyKey, record])), [state.access]);
  const missingPortalFamilies = state.families.filter((family) => !accessByFamily.has(family.familyKey));
  const noLoginFamilies = state.access.filter((record) => !record.lastParentLoginAt);
  const emptyPortalEmailFamilies = state.access.filter((record) => !(record.contactEmails || []).length);
  const emailIssues = state.emailEntries.filter((entry) => {
    const status = String(entry.status || "").toLowerCase();
    return status.includes("fail") || status.includes("error") || status.includes("no recipient");
  });
  const personalSender = String(state.officeEmail.defaultSenderEmail || state.officeEmail.defaultReplyToEmail || "").toLowerCase().includes("mconniry@wvcs.org");
  const reviewCards = [
    {
      label: "Portal Records Missing",
      value: missingPortalFamilies.length,
      tone: missingPortalFamilies.length ? "amber" : "emerald",
      note: "Roster families without a family portal access record.",
    },
    {
      label: "No Parent Login",
      value: noLoginFamilies.length,
      tone: noLoginFamilies.length ? "amber" : "emerald",
      note: "Portal records that have not recorded a parent login yet.",
    },
    {
      label: "No Portal Email",
      value: emptyPortalEmailFamilies.length,
      tone: emptyPortalEmailFamilies.length ? "rose" : "emerald",
      note: "Portal records that do not authorize any parent email.",
    },
    {
      label: "Email Audit Issues",
      value: emailIssues.length,
      tone: emailIssues.length ? "amber" : "emerald",
      note: "Recent Hub emails with failure, error, or no-recipient status.",
    },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <ShieldCheck size={16} className="text-sky-600" />
            Security Review
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">A quick hardening check for parent access, email reliability, and sensitive office settings.</p>
        </div>
        <button type="button" onClick={loadSecurityReview} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>
      {state.error && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">{state.error}</div>}
      {state.loading && <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">Loading security review...</div>}

      <div className="mt-4 grid gap-3 md:grid-cols-4">
        {reviewCards.map((card) => (
          <div key={card.label} className={`rounded-lg border p-3 ${card.tone === "rose" ? "border-rose-200 bg-rose-50" : card.tone === "amber" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}>
            <div className={`text-xs font-black uppercase tracking-[0.14em] ${card.tone === "rose" ? "text-rose-700" : card.tone === "amber" ? "text-amber-700" : "text-emerald-700"}`}>{card.label}</div>
            <div className="mt-1 text-2xl font-black text-slate-950">{card.value}</div>
            <div className="mt-1 text-xs leading-5 text-slate-600">{card.note}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-950">Recommended Checks</div>
          <div className="mt-3 grid gap-2 text-sm text-slate-700">
            <div className="flex items-start gap-2"><StatusPill tone={personalSender ? "amber" : "emerald"}>{personalSender ? "Review" : "OK"}</StatusPill><span>Use a shared WVCS sender/reply inbox for Hub emails when possible.</span></div>
            <div className="flex items-start gap-2"><StatusPill tone={emptyPortalEmailFamilies.length ? "rose" : "emerald"}>{emptyPortalEmailFamilies.length ? "Fix" : "OK"}</StatusPill><span>Every active family portal record should have at least one authorized parent email.</span></div>
            <div className="flex items-start gap-2"><StatusPill tone={emailIssues.length ? "amber" : "emerald"}>{emailIssues.length ? "Review" : "OK"}</StatusPill><span>Review Email Audit entries with failures or no recipients before broad parent rollout.</span></div>
            <div className="flex items-start gap-2"><StatusPill tone="sky">Routine</StatusPill><span>Keep Drive backup settings restricted to superusers and test backup after major module changes.</span></div>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-black text-slate-950">Items To Review</div>
          <div className="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white">
            {[...missingPortalFamilies.slice(0, 8).map((family) => ({ id: `missing-${family.familyKey}`, label: family.familyName, note: "No portal access record" })),
              ...emptyPortalEmailFamilies.slice(0, 8).map((record) => ({ id: `empty-${record.familyKey}`, label: record.familyName, note: "No authorized portal email" })),
              ...emailIssues.slice(0, 8).map((entry) => ({ id: `email-${entry.id}`, label: entry.subject || entry.module || "Email audit issue", note: entry.status || "Email issue" })),
            ].slice(0, 16).map((item) => (
              <div key={item.id} className="border-b border-slate-100 px-3 py-2 text-sm last:border-b-0">
                <div className="font-bold text-slate-900">{item.label}</div>
                <div className="text-xs text-slate-500">{item.note}</div>
              </div>
            ))}
            {!missingPortalFamilies.length && !emptyPortalEmailFamilies.length && !emailIssues.length && <div className="p-4 text-sm text-slate-500">No immediate review items found.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function OfficeFinanceSettingsModule({ currentUserEmail = "" }) {
  const [settingsView, setSettingsView] = useState("portal");
  const settingsViews = [
    ["portal", "Family Portal Settings"],
    ["email", "Email Replies"],
    ["email-audit", "Email Audit"],
    ["security", "Security Review"],
    ["audit", "Parent Access Audit"],
    ["rollover", "Yearly Rollover"],
  ];

  return (
    <section className="mx-auto max-w-[1500px] px-5 py-5">
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Office & Finance</div>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Settings</h2>
          <p className="mt-1 text-sm text-slate-600">Setup, parent access review, and year-end tools.</p>
        </div>
        <label className="grid gap-1 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
          Settings Area
          <select value={settingsView} onChange={(event) => setSettingsView(event.target.value)} className="min-w-64 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-sky-500">
            {settingsViews.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
      </div>
      <div className="mt-4">{settingsView === "portal" && <FamilyPortalSettingsPanel currentUserEmail={currentUserEmail} />}</div>
      <div className="mt-4">{settingsView === "email" && <OfficeEmailSettingsPanel currentUserEmail={currentUserEmail} />}</div>
      <div className="mt-4">{settingsView === "email-audit" && <EmailAuditPanel />}</div>
      <div className="mt-4">{settingsView === "security" && <SecurityReviewPanel />}</div>
      <div className="mt-4">{settingsView === "audit" && <ParentAccessAuditPanel />}</div>
      <div className="mt-4">{settingsView === "rollover" && <OfficeRolloverModule embedded />}</div>
    </section>
  );
}

export default FamilyRecordsModule;
