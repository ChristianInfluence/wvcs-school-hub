import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock, CreditCard, DollarSign, ExternalLink, FileSignature, FileText, Info, Loader2, ReceiptText, RefreshCw, Send, Users, Utensils } from "lucide-react";
import { createLunchCheckout, fetchFamilyPortalData, sendFamilyLoginLink, submitFosHours, submitLunchOrders, submitVolunteerDriverApplication, updateLunchMenuOrder } from "../../lib/familyPortalData.js";
import { createParentPermissionPdfUrl } from "../../lib/permissionSlipsData.js";
import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient.js";

const today = new Date().toISOString().slice(0, 10);
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const driverApplicationDefaults = {
  schoolYear: "2026-2027",
  parentName: "",
  driverLicenseNumber: "",
  licenseExpiration: "",
  phoneHome: "",
  phoneWork: "",
  address: "",
  car1ModelYear: "",
  car1Seatbelts: "",
  car1LicensePlate: "",
  car2ModelYear: "",
  car2Seatbelts: "",
  car2LicensePlate: "",
  car1InsuranceCompany: "",
  car1PolicyNumber: "",
  car1UninsuredCoverage: "",
  liabilityPerPerson: "",
  liabilityPerAccident: "",
  propertyDamage: "",
  car2InsuranceCompany: "",
  car2PolicyNumber: "",
  car2UninsuredCoverage: "",
  car2LiabilityPerPerson: "",
  car2LiabilityPerAccident: "",
  car2PropertyDamage: "",
  commercialLicense: "",
  accidentLastThreeYears: "",
  accidentExplanation: "",
  movingViolationLastThreeYears: "",
  movingViolationExplanation: "",
  duiOrSuspensionHistory: "",
  stateLicense: "",
  driverRequirementsAcknowledged: false,
  driverDeclarationAcknowledged: false,
  electronicSignature: "",
  signatureDate: today,
  requirementsAcknowledged: false,
  truthAcknowledged: false,
};

function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function shortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthStart(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthName(value) {
  return monthStart(value).toLocaleDateString([], { month: "long", year: "numeric" });
}

function buildSchoolMonthDays(value) {
  const start = monthStart(value);
  const days = [];
  const cursor = new Date(start);
  while (cursor.getMonth() === start.getMonth()) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const leading = days.length ? days[0].getDay() - 1 : 0;
  const cells = Array.from({ length: leading }, () => null).concat(days);
  while (cells.length % 5 !== 0) cells.push(null);
  return cells;
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400 ${props.className || ""}`}
    />
  );
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-200">
      {label}
      {children}
    </label>
  );
}

function Stat({ label, value, tone = "white", info = "" }) {
  const tones = {
    white: "text-white",
    green: "text-emerald-200",
    amber: "text-amber-200",
    rose: "text-rose-200",
    sky: "text-sky-200",
  };
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        <span>{label}</span>
        {info && (
          <span className="group relative inline-flex">
            <button
              type="button"
              aria-label={`${label} explanation`}
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-slate-400 outline-none hover:border-sky-400 hover:text-sky-200 focus:border-sky-400 focus:text-sky-200"
            >
              <Info size={12} />
            </button>
            <span className="pointer-events-none absolute left-1/2 top-7 z-20 hidden w-64 -translate-x-1/2 rounded-lg border border-slate-700 bg-slate-950 p-3 text-left text-xs font-medium normal-case leading-5 tracking-normal text-slate-200 shadow-xl group-hover:block group-focus-within:block">
              {info}
            </span>
          </span>
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold ${tones[tone] || tones.white}`}>{value}</div>
    </div>
  );
}

function isOpenInvoice(invoice) {
  const status = `${invoice?.paymentStatus || invoice?.status || ""}`.toLowerCase();
  return !status.includes("paid") && !status.includes("void") && !status.includes("cancel");
}

function isVerifiedDriver(application) {
  return application?.status === "Verified" && (!application.expiresAt || application.expiresAt.slice(0, 10) >= today);
}

async function fileToAttachment(file, kind, label) {
  const contentBase64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {
    kind,
    label,
    name: file.name,
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    contentBase64,
  };
}

export default function FamilyPortalPage({ token = "", secureLogin = false, previewFamilyKey = "" }) {
  const [portal, setPortal] = useState({ loading: true, error: "", data: null });
  const [familySession, setFamilySession] = useState({ loading: Boolean(secureLogin || previewFamilyKey), user: null });
  const [loginDraft, setLoginDraft] = useState({ email: "" });
  const [loginStatus, setLoginStatus] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [draft, setDraft] = useState({ parentName: "", parentEmail: "", activityDate: today, activity: "", hours: "", notes: "" });
  const [status, setStatus] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [showFosForm, setShowFosForm] = useState(false);
  const [lunchDraft, setLunchDraft] = useState({ studentId: "", menuId: "", selectedItems: {}, amount: "25.00", editing: false });
  const [lunchStatus, setLunchStatus] = useState("");
  const [lunchPaymentStatus, setLunchPaymentStatus] = useState("");
  const [lunchCheckoutState, setLunchCheckoutState] = useState("idle");
  const [permissionStatus, setPermissionStatus] = useState("");
  const [driverDraft, setDriverDraft] = useState(driverApplicationDefaults);
  const [driverFiles, setDriverFiles] = useState({ license: null, insurance: null });
  const [driverStatus, setDriverStatus] = useState("");
  const [submittingDriver, setSubmittingDriver] = useState(false);

  const authRequired = Boolean(secureLogin || previewFamilyKey);

  async function loadPortal() {
    setPortal((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await fetchFamilyPortalData(previewFamilyKey ? { previewFamilyKey } : secureLogin ? {} : token);
      if (!result.found) {
        setPortal({
          loading: false,
          error: secureLogin
            ? "No family portal is connected to this email address yet. Please contact the WVCS office."
            : "This family portal link was not found or is no longer active.",
          data: null,
        });
        return;
      }
      setPortal({ loading: false, error: "", data: result });
      setDraft((current) => ({
        ...current,
        parentEmail: current.parentEmail || result.family?.contactEmails?.[0] || "",
      }));
      setDriverDraft((current) => ({
        ...current,
        parentName: current.parentName || familySession.user?.user_metadata?.full_name || "",
      }));
    } catch (error) {
      setPortal({ loading: false, error: error.message, data: null });
    }
  }

  useEffect(() => {
    if (!authRequired) {
      loadPortal();
      return undefined;
    }

    let active = true;
    async function loadSession() {
      if (!isSupabaseConfigured) {
        setFamilySession({ loading: false, user: null });
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (active) setFamilySession({ loading: false, user: data.session?.user || null });
    }
    loadSession();
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setFamilySession({ loading: false, user: session?.user || null });
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [authRequired]);

  useEffect(() => {
    if (!authRequired) return;
    if (familySession.loading) return;
    if (familySession.user) loadPortal();
    else setPortal({ loading: false, error: "", data: null });
  }, [authRequired, familySession.loading, familySession.user?.id, previewFamilyKey]);

  const balance = portal.data?.fos?.balance || {};
  const entries = portal.data?.fos?.entries || [];
  const invoices = useMemo(
    () => [...(portal.data?.invoices?.incidentals || []), ...(portal.data?.invoices?.tuition || [])].sort((a, b) => {
      const aDate = a.sentAt || a.paidAt || a.updatedAt || a.createdAt || a.invoice?.invoiceDate || "";
      const bDate = b.sentAt || b.paidAt || b.updatedAt || b.createdAt || b.invoice?.invoiceDate || "";
      return String(bDate).localeCompare(String(aDate));
    }),
    [portal.data]
  );
  const visibleInvoice = selectedInvoice && invoices.find((invoice) => invoice.id === selectedInvoice.id && invoice.type === selectedInvoice.type);
  const openInvoices = invoices.filter(isOpenInvoice);
  const openInvoiceBalance = openInvoices.reduce((total, invoice) => total + invoiceTotal(invoice), 0);
  const latestInvoice = invoices[0];
  const permissionSlips = portal.data?.permissionSlips || [];
  const permissionNeedsSignature = permissionSlips.filter((slip) => slip.status === "Needs Signature");
  const completedPermissionSlips = permissionSlips.filter((slip) => slip.status === "Completed");
  const driverApplications = portal.data?.volunteerDrivers?.applications || [];
  const verifiedDriverApplication = driverApplications.find(isVerifiedDriver);
  const latestDriverApplication = driverApplications[0] || null;
  const portalSettings = portal.data?.familyPortalSettings || {};
  const announcement = portalSettings.announcement || {};
  const help = portalSettings.help || {};
  const fosBalanceInfo = `This family's FOS obligation starts at ${money(balance.liabilityAmount || portal.data?.fos?.buyoutAmount || 500)}. Each approved volunteer hour reduces this amount by ${money(balance.hourValue || portal.data?.fos?.hourValue || 10)} until the requirement is complete.`;
  const lunch = portal.data?.lunch || {};
  const lunchMenus = lunch.menus || [];
  const activeLunchMenu = (lunch.menus || []).find((menu) => menu.id === lunchDraft.menuId) || lunch.menus?.[0] || null;
  const lunchItems = (activeLunchMenu?.items || []).map((item) => ({ ...item, menuId: activeLunchMenu.id, menuTitle: activeLunchMenu.title, itemKey: `${activeLunchMenu.id}:${item.id}` }));
  const lunchItemsByDate = useMemo(() => {
    const map = new Map();
    lunchItems.forEach((item) => {
      if (!item.date) return;
      map.set(item.date, [...(map.get(item.date) || []), item]);
    });
    return map;
  }, [lunchItems]);
  const selectedLunchItems = lunchItems.filter((item) => lunchDraft.selectedItems[item.itemKey]);
  const expectedLunchCost = selectedLunchItems.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const monthCells = buildSchoolMonthDays(activeLunchMenu?.weekStart || today);
  const activeStudentOrders = (lunch.orders || []).filter((order) => order.menuId === activeLunchMenu?.id && String(order.studentId || "") === String(lunchDraft.studentId || "") && order.status !== "Cancelled");
  const activeFamilyOrders = (lunch.orders || []).filter((order) => order.menuId === activeLunchMenu?.id && order.status !== "Cancelled");
  const submittedStudentLunchCost = activeStudentOrders.reduce((sum, order) => sum + Number(order.price || 0), 0);
  const submittedFamilyLunchCost = activeFamilyOrders.reduce((sum, order) => sum + Number(order.price || 0), 0);
  const lunchCostLabel = lunchDraft.editing || selectedLunchItems.length
    ? "Current Selection"
    : lunchDraft.studentId
      ? "Submitted Expected Cost"
      : "Family Submitted Total";
  const durableLunchCost = lunchDraft.editing || selectedLunchItems.length
    ? expectedLunchCost
    : lunchDraft.studentId
      ? submittedStudentLunchCost
      : submittedFamilyLunchCost;
  const activeOrderKeys = new Set(activeStudentOrders.map((order) => `${order.orderDate}:${order.itemName}`));
  const lunchMenuSummaries = useMemo(() => {
    if (!activeLunchMenu) return [];
    const studentsById = new Map((portal.data?.family?.students || []).map((student) => [String(student.id), student]));
    const grouped = new Map();
    (lunch.orders || [])
      .filter((order) => order.menuId === activeLunchMenu.id && order.status !== "Cancelled")
      .forEach((order) => {
        const key = String(order.studentId || order.studentName || "");
        const existing = grouped.get(key) || {
          studentId: order.studentId || "",
          studentName: studentsById.get(String(order.studentId || ""))?.name || order.studentName || "Student",
          count: 0,
          futureCount: 0,
          expectedCost: 0,
        };
        existing.count += 1;
        existing.expectedCost += Number(order.price || 0);
        if (order.orderDate >= today && order.status === "Anticipated" && !order.chargedAt) existing.futureCount += 1;
        grouped.set(key, existing);
      });
    return [...grouped.values()].sort((a, b) => a.studentName.localeCompare(b.studentName));
  }, [activeLunchMenu?.id, lunch.orders, portal.data?.family?.students]);

  useEffect(() => {
    if (!lunchMenus.length) return;
    if (lunchDraft.menuId && lunchMenus.some((menu) => menu.id === lunchDraft.menuId)) return;
    setLunchDraft((current) => ({ ...current, menuId: lunchMenus[0].id, selectedItems: {} }));
  }, [lunchMenus.length, lunchDraft.menuId]);

  function invoiceTitle(invoice) {
    if (!invoice) return "Invoice";
    if (invoice.type === "tuition") return `${invoice.schoolYear || invoice.invoice?.schoolYear || "Tuition"} Tuition Breakdown`;
    const firstCharge = Array.isArray(invoice.invoice?.charges) ? invoice.invoice.charges[0]?.description : "";
    return invoice.invoice?.title || invoice.invoice?.invoiceTitle || firstCharge || "Incidental Invoice";
  }

  function invoiceTotal(invoice) {
    if (!invoice) return 0;
    if (Number(invoice.total)) return Number(invoice.total);
    if (Number(invoice.invoice?.total)) return Number(invoice.invoice.total);
    if (Number(invoice.invoice?.balanceDue)) return Number(invoice.invoice.balanceDue);
    if (invoice.type === "tuition" && Array.isArray(invoice.invoice?.students)) {
      const studentTotal = invoice.invoice.students.reduce((sum, student) => {
        const discounts = Array.isArray(student.discounts)
          ? student.discounts.reduce((discountSum, discount) => discountSum + Number(discount.amount || 0), 0)
          : 0;
        const discountedTuition = Math.max(Number(student.tuition || 0) - discounts, 0);
        const earlyPayDiscount = discountedTuition * 0.05;
        return sum + Math.max(discountedTuition - earlyPayDiscount, 0) + Number(student.comprehensiveFee || 0);
      }, 0);
      return studentTotal + (invoice.invoice.registrationFeePaid ? 0 : Number(invoice.invoice.registrationFee || 0));
    }
    return 0;
  }

  function chargeRows(invoice) {
    const charges = invoice?.invoice?.charges;
    if (Array.isArray(charges) && charges.length) return charges.map((charge) => ({ label: charge.description || charge.label || "Charge", amount: charge.amount }));
    const students = invoice?.invoice?.students;
    if (Array.isArray(students) && students.length) {
      return students.flatMap((student) => [
        { label: `${student.name || "Student"} tuition`, amount: student.tuition },
        { label: `${student.name || "Student"} comprehensive fee`, amount: student.comprehensiveFee },
      ]).filter((row) => Number(row.amount || 0));
    }
    return [];
  }

  function incidentalUrl(invoice) {
    if (invoice?.type !== "incidental" || !invoice.publicToken) return "";
    return `${window.location.origin}${window.location.pathname}#/incidental-pay/${encodeURIComponent(invoice.publicToken)}`;
  }

  function permissionSignUrl(slip) {
    if (!slip?.signingToken) return "";
    return `${window.location.origin}${window.location.pathname}#/permission-sign/${encodeURIComponent(slip.signingToken)}`;
  }

  async function openSignedPermissionPdf(slip) {
    if (!slip?.submissionId || !slip?.pdfToken) {
      setPermissionStatus("Signed PDF is not available yet. Please contact the WVCS office if you need a copy.");
      return;
    }
    setPermissionStatus("Opening signed permission slip...");
    const pdfWindow = window.open("about:blank", "_blank");
    if (pdfWindow) {
      pdfWindow.opener = null;
      pdfWindow.document.title = "Opening signed permission slip...";
      pdfWindow.document.body.innerHTML = "<p style=\"font-family: system-ui, sans-serif; padding: 24px;\">Opening signed permission slip...</p>";
    }
    try {
      const url = await createParentPermissionPdfUrl({ token: slip.pdfToken, submissionId: slip.submissionId });
      if (url) {
        if (pdfWindow) {
          pdfWindow.location.href = url;
        } else {
          window.location.href = url;
        }
        setPermissionStatus("");
      } else {
        if (pdfWindow) pdfWindow.close();
        setPermissionStatus("Signed PDF is not available yet.");
      }
    } catch (error) {
      if (pdfWindow) pdfWindow.close();
      setPermissionStatus(`Unable to open signed PDF: ${error.message}`);
    }
  }

  async function submitHours() {
    if (!draft.activityDate || !draft.activity || !Number(draft.hours)) {
      setStatus("Enter the date, activity, and hours before submitting.");
      return;
    }
    setSubmitting(true);
    setStatus("Submitting FOS hours...");
    try {
      await submitFosHours(token, draft);
      setStatus("Hours submitted. They are pending office verification.");
      setDraft((current) => ({ ...current, activity: "", hours: "", notes: "" }));
      setShowFosForm(false);
      await loadPortal();
    } catch (error) {
      setStatus(`Unable to submit hours: ${error.message}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function sendLoginLink() {
    const email = loginDraft.email.trim().toLowerCase();
    if (!email) {
      setLoginStatus("Enter the email address connected to your WVCS family record.");
      return;
    }
    setLoginStatus("Sending WVCS secure sign-in link...");
    try {
      const result = await sendFamilyLoginLink(email);
      setLinkSent(Boolean(result.sent));
      setLoginStatus(result.sent ? "Check your email for the WVCS Family Portal sign-in link." : result.reason || "Unable to send the sign-in link.");
    } catch (error) {
      setLoginStatus(error.message);
    }
  }

  async function signOutFamilyPortal() {
    await supabase.auth.signOut();
    setPortal({ loading: false, error: "", data: null });
  }

  async function submitLunchOrder() {
    if (!lunchDraft.studentId || (!lunchDraft.editing && !selectedLunchItems.length)) {
      setLunchStatus("Choose a student and at least one lunch item before submitting.");
      return;
    }
    setLunchStatus(lunchDraft.editing ? "Saving lunch menu edits..." : "Submitting lunch orders...");
    try {
      if (lunchDraft.editing) {
        const result = await updateLunchMenuOrder({
          menuId: activeLunchMenu.id,
          studentId: lunchDraft.studentId,
          orders: selectedLunchItems.map((item) => ({ itemId: item.id })),
        });
        setLunchStatus(`Lunch menu updated. Added ${result.added || 0} and removed ${result.removed || 0} future item(s).`);
      } else {
        await submitLunchOrders(selectedLunchItems.map((item) => ({ studentId: lunchDraft.studentId, menuId: item.menuId, itemId: item.id })));
        setLunchStatus(`Lunch menu submitted. Expected cost: ${money(expectedLunchCost)}. The office will charge the account only for lunches that are served.`);
      }
      setLunchDraft((current) => ({ ...current, selectedItems: {}, editing: false }));
      await loadPortal();
    } catch (error) {
      setLunchStatus(`Unable to submit lunch order: ${error.message}`);
    }
  }

  function hasLunchMealForDate(item) {
    return lunchItems.some((candidate) =>
      candidate.date === item.date &&
      !candidate.requiresMeal &&
      candidate.itemKey !== item.itemKey &&
      lunchDraft.selectedItems[candidate.itemKey]
    );
  }

  function toggleLunchItem(item) {
    if (item.date < today) {
      setLunchStatus("Past lunch dates can no longer be edited.");
      return;
    }
    if (item.requiresMeal && !hasLunchMealForDate(item)) {
      setLunchStatus("Choose a regular meal for that date before adding this restricted item.");
      return;
    }
    setLunchDraft((current) => ({
      ...current,
      selectedItems: {
        ...current.selectedItems,
        [item.itemKey]: !current.selectedItems[item.itemKey],
      },
    }));
    setLunchStatus("");
  }

  async function submitDriverApplication() {
    if (!driverDraft.commercialLicense || !driverDraft.accidentLastThreeYears || !driverDraft.movingViolationLastThreeYears || !driverDraft.duiOrSuspensionHistory) {
      setDriverStatus("Answer each driving history question before submitting.");
      return;
    }
    if (driverDraft.accidentLastThreeYears === "Yes" && !driverDraft.accidentExplanation.trim()) {
      setDriverStatus("Please describe the accident and cause before submitting.");
      return;
    }
    if (driverDraft.movingViolationLastThreeYears === "Yes" && !driverDraft.movingViolationExplanation.trim()) {
      setDriverStatus("Please describe the moving violation before submitting.");
      return;
    }
    if (driverDraft.duiOrSuspensionHistory === "Yes") {
      setDriverStatus("This application cannot be submitted for verification with a yes answer to the DWI/DUI, suspension, reckless operation, or revocation question.");
      return;
    }
    if (!driverDraft.stateLicense.trim() || !driverDraft.driverRequirementsAcknowledged) {
      setDriverStatus("Complete the volunteer driver requirements section before submitting.");
      return;
    }
    if (!driverDraft.driverDeclarationAcknowledged || !driverDraft.electronicSignature.trim() || !driverDraft.signatureDate) {
      setDriverStatus("Complete the declaration and electronic signature before submitting.");
      return;
    }
    if (!driverFiles.license || !driverFiles.insurance) {
      setDriverStatus("Attach a picture of your driver's license and insurance card before submitting.");
      return;
    }
    setSubmittingDriver(true);
    setDriverStatus("Submitting volunteer driver application...");
    try {
      const attachments = [
        await fileToAttachment(driverFiles.license, "driver_license", "Driver's License"),
        await fileToAttachment(driverFiles.insurance, "insurance_card", "Insurance Card"),
      ];
      await submitVolunteerDriverApplication(driverDraft, attachments);
      setDriverStatus("Application submitted. It is pending office verification.");
      setDriverFiles({ license: null, insurance: null });
      setDriverDraft(driverApplicationDefaults);
      await loadPortal();
    } catch (error) {
      setDriverStatus(`Unable to submit driver application: ${error.message}`);
    } finally {
      setSubmittingDriver(false);
    }
  }

  function startLunchEdit(summary) {
    const selectedItems = {};
    lunchItems.forEach((item) => {
      if (item.date >= today && (lunch.orders || []).some((order) =>
        order.menuId === activeLunchMenu?.id &&
        String(order.studentId || "") === String(summary.studentId || "") &&
        order.status !== "Cancelled" &&
        order.orderDate === item.date &&
        order.itemName === item.name
      )) {
        selectedItems[item.itemKey] = true;
      }
    });
    setLunchDraft((current) => ({ ...current, studentId: summary.studentId, selectedItems, editing: true }));
    setLunchStatus(`Editing ${monthName(activeLunchMenu.weekStart)} lunch choices for ${summary.studentName}. Past dates are locked.`);
  }

  async function addLunchFunds() {
    const amount = Number(lunchDraft.amount);
    if (!Number.isFinite(amount) || amount < 0.5) {
      setLunchPaymentStatus("Enter a lunch deposit amount of at least $0.50.");
      return;
    }
    if (lunchCheckoutState === "opening") return;
    setLunchCheckoutState("opening");
    setLunchPaymentStatus("Opening secure checkout...");
    try {
      const result = await createLunchCheckout(amount.toFixed(2));
      if (!result.url) throw new Error(result.reason || "Unable to create checkout.");
      setLunchCheckoutState("opened");
      setLunchPaymentStatus("Secure checkout opened.");
      window.location.href = result.url;
    } catch (error) {
      setLunchPaymentStatus(`Unable to open checkout: ${error.message}`);
      setLunchCheckoutState("idle");
    }
  }

  if (secureLogin && !familySession.loading && !familySession.user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100">
        <section className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-8">
          <div className="w-full rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">WVCS Family Portal</div>
            <h1 className="mt-2 text-3xl font-bold text-white">Family Sign In</h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Enter the parent or guardian email address that WVCS has connected to your family record. The system will send a secure sign-in link to that email.
            </p>
            <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm leading-6 text-sky-100">
              Use the email address WVCS has on file. If you cannot access your portal, contact the school office so we can confirm the correct parent or guardian email.
            </div>
            <div className="mt-5 grid gap-3">
              <Field label="Email">
                <Input type="email" value={loginDraft.email} onChange={(event) => setLoginDraft({ ...loginDraft, email: event.target.value })} placeholder="parent@example.com" />
              </Field>
              <button
                type="button"
                onClick={sendLoginLink}
                disabled={!isSupabaseConfigured}
                className="inline-flex w-full items-center justify-center rounded-lg border border-sky-400 bg-sky-500 px-3 py-3 text-sm font-bold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {linkSent ? "Send Link Again" : "Send Sign-In Link"}
              </button>
              {linkSent && (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm leading-6 text-slate-300">
                  Keep this page open, then use the link in your email. On this device, you should stay signed in for future visits unless you sign out or your browser clears the session.
                </div>
              )}
            </div>
            {loginStatus && <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{loginStatus}</div>}
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <section className="mx-auto max-w-[1720px] px-4 py-6 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">WVCS Family Portal</div>
            <h1 className="mt-2 text-3xl font-bold text-white">{portal.data?.family?.familyName || "Family Portal"}</h1>
            <p className="mt-2 text-sm text-slate-400">
              {previewFamilyKey ? "Office preview of the family portal." : "View FOS progress, invoice history, and family account tools."}
            </p>
            <p className="mt-2 max-w-3xl text-xs leading-5 text-slate-500">
              Regular tuition account balances are handled through FACTS. Full-pay tuition breakdown invoices requested through the WVCS office may appear here and are paid directly through the office.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadPortal}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
            >
              <RefreshCw size={16} />
              Refresh
            </button>
            {secureLogin && familySession.user && (
              <button
                type="button"
                onClick={signOutFamilyPortal}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        {portal.loading && <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">Loading family portal...</div>}
        {portal.error && <div className="mt-6 rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">{portal.error}</div>}

        {portal.data && (
          <div className="mt-6 space-y-5">
            {announcement.enabled && announcement.message && (
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-200">{announcement.title || "Family Portal Announcement"}</div>
                <div className="mt-2 text-sm leading-6 text-slate-100">{announcement.message}</div>
              </div>
            )}

            <div className="grid gap-3 md:grid-cols-4">
              <Stat label="Open Invoices" value={openInvoices.length} tone="amber" />
              <Stat label="Open Balance" value={money(openInvoiceBalance)} tone="sky" />
              <Stat label="FOS Remaining" value={`${balance.remainingHours || 0} hrs`} tone="amber" />
              <Stat label="FOS Amount Owed" value={money(balance.remainingBalance)} tone="rose" info={fosBalanceInfo} />
            </div>

            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
              {[
                ["overview", "Overview", Users],
                ["invoices", "Invoices", ReceiptText],
                ["permissions", "Permission Slips", FileSignature],
                ["lunch", "Lunch", Utensils],
                ["driver", "Volunteer Driver", CheckCircle2],
                ["fos", "FOS Hours", Clock],
              ].map(([id, label, Icon]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    activeTab === id
                      ? "border-sky-400 bg-sky-500 text-white"
                      : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>

            {activeTab === "overview" && (
              <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
                <div className="space-y-5">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <FileText size={16} className="text-sky-300" />
                      Account Summary
                    </div>
                    <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
                      Regular tuition accounts are processed through FACTS. Full-pay tuition breakdown payments recorded by the WVCS office may appear here.
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Latest Invoice</div>
                        <div className="mt-2 text-sm font-bold text-white">{latestInvoice ? invoiceTitle(latestInvoice) : "No invoices yet"}</div>
                        {latestInvoice && <div className="mt-1 text-xs text-slate-500">{latestInvoice.paymentStatus || latestInvoice.status} | {money(invoiceTotal(latestInvoice))}</div>}
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">FOS Progress</div>
                        <div className="mt-2 text-sm font-bold text-white">{balance.approvedHours || 0} approved hours</div>
                        <div className="mt-1 text-xs text-slate-500">{balance.remainingHours || 0} hours remaining</div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Lunch Balance</div>
                        <div className="mt-2 text-sm font-bold text-white">{money(lunch.balance || 0)}</div>
                        <div className="mt-1 text-xs text-slate-500">Family lunch account</div>
                      </div>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 md:col-span-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Permission Slips</div>
                            <div className="mt-2 text-sm font-bold text-white">
                              {permissionNeedsSignature.length ? `${permissionNeedsSignature.length} need signature` : "No permission slips need signature"}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">{completedPermissionSlips.length} completed slip(s) available</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveTab("permissions")}
                            className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/20"
                          >
                            Open Permission Slips
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <CheckCircle2 size={16} className="text-emerald-300" />
                      Recent FOS History
                    </div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                      {entries.slice(0, 4).map((entry) => (
                        <div key={entry.id} className="grid gap-2 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[100px_1fr_80px_90px]">
                          <div className="text-slate-400">{shortDate(entry.activityDate)}</div>
                          <div>
                            <div className="font-semibold text-white">{entry.activity}</div>
                            {entry.officeNote && <div className="mt-1 text-xs text-slate-500">{entry.officeNote}</div>}
                          </div>
                          <div className="text-slate-300">{entry.approvedHours || entry.submittedHours} hrs</div>
                          <div className="font-semibold text-sky-200">{entry.status}</div>
                        </div>
                      ))}
                      {!entries.length && <div className="p-4 text-sm text-slate-500">No FOS hours have been submitted yet.</div>}
                    </div>
                  </div>
                </div>

                <div className="space-y-5">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-bold text-white">Students</div>
                    <div className="mt-3 space-y-2">
                      {(portal.data.family?.students || []).map((student) => (
                        <div key={student.id} className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200">
                          {student.name} {student.grade ? <span className="text-slate-500">Grade {student.grade}</span> : null}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <DollarSign size={16} className="text-emerald-300" />
                      Lunch Balance
                    </div>
                    <div className="mt-3 text-2xl font-bold text-white">{money(lunch.balance || 0)}</div>
                    <button
                      type="button"
                      onClick={() => setActiveTab("lunch")}
                      className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                    >
                      <Utensils size={16} />
                      Open Lunch Account
                    </button>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <Info size={16} className="text-sky-300" />
                      Need Help?
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">
                      {help.message || "For help accessing your family portal, please contact the WVCS office."}
                    </p>
                    <div className="mt-3 grid gap-2 text-sm">
                      {help.phone && <a href={`tel:${help.phone}`} className="font-semibold text-sky-200 hover:text-sky-100">{help.phone}</a>}
                      {help.email && <a href={`mailto:${help.email}`} className="font-semibold text-sky-200 hover:text-sky-100">{help.email}</a>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "permissions" && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <Stat label="Needs Signature" value={permissionNeedsSignature.length} tone={permissionNeedsSignature.length ? "amber" : "green"} />
                  <Stat label="Completed" value={completedPermissionSlips.length} tone="green" />
                  <Stat label="Total Slips" value={permissionSlips.length} tone="sky" />
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <FileSignature size={16} className="text-sky-300" />
                    Permission Slips
                  </div>
                  <div className="mt-1 text-xs leading-5 text-slate-500">
                    These records are tied to the students connected to your WVCS family record.
                  </div>
                  {permissionStatus && <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{permissionStatus}</div>}
                  <div className="mt-4 grid gap-3">
                    {permissionSlips.map((slip) => (
                      <div key={slip.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-bold text-white">{slip.title || "Permission Slip"}</div>
                              <span className={`rounded-full border px-2 py-1 text-[11px] font-bold ${
                                slip.status === "Completed"
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                  : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              }`}>
                                {slip.status}
                              </span>
                            </div>
                            <div className="mt-1 text-xs leading-5 text-slate-500">
                              {slip.studentName || "Student"}{slip.grade ? ` | Grade ${slip.grade}` : ""}{slip.eventDate ? ` | ${shortDate(slip.eventDate)}` : ""}
                              {slip.destination ? ` | ${slip.destination}` : ""}
                            </div>
                            {slip.signedAt && (
                              <div className="mt-1 text-xs text-emerald-300">
                                Signed {shortDate(slip.signedAt)}{slip.signedBy ? ` by ${slip.signedBy}` : ""}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {slip.status === "Needs Signature" && permissionSignUrl(slip) && (
                              <a
                                href={permissionSignUrl(slip)}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-500/20"
                              >
                                <FileSignature size={14} />
                                Sign Now
                              </a>
                            )}
                            {slip.status === "Completed" && (
                              <button
                                type="button"
                                onClick={() => openSignedPermissionPdf(slip)}
                                className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-100 hover:bg-sky-500/20"
                              >
                                <ExternalLink size={14} />
                                View Signed PDF
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {!permissionSlips.length && (
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-500">
                        No permission slips are connected to this family yet.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === "lunch" && (
              <div className="space-y-5">
                <div className="grid gap-5 xl:grid-cols-[290px_minmax(0,1fr)] xl:items-start">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <DollarSign size={16} className="text-emerald-300" />
                      Lunch Balance
                    </div>
                    <div className="mt-3 text-3xl font-bold text-white">{money(lunch.balance || 0)}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">
                      Online deposits add to your family lunch account. WVCS charges the account only after the office marks a lunch as served.
                    </div>
                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Input inputMode="decimal" value={lunchDraft.amount} onChange={(event) => setLunchDraft({ ...lunchDraft, amount: event.target.value })} placeholder="25.00" />
                      <button
                        type="button"
                        onClick={addLunchFunds}
                        disabled={lunchCheckoutState === "opening"}
                        aria-busy={lunchCheckoutState === "opening"}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {lunchCheckoutState === "opening" ? <Loader2 size={16} className="animate-spin" /> : lunchCheckoutState === "opened" ? <CheckCircle2 size={16} /> : <CreditCard size={16} />}
                        {lunchCheckoutState === "opening" ? "Opening..." : lunchCheckoutState === "opened" ? "Opened" : "Add Funds"}
                      </button>
                    </div>
                    {lunchPaymentStatus && (
                      <div className={`mt-3 rounded-lg border px-3 py-2 text-sm font-semibold ${
                        lunchPaymentStatus.startsWith("Unable") || lunchPaymentStatus.startsWith("Enter")
                          ? "border-rose-500/30 bg-rose-500/10 text-rose-100"
                          : "border-sky-500/30 bg-sky-500/10 text-sky-100"
                      }`}>
                        {lunchPaymentStatus}
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <Utensils size={16} className="text-sky-300" />
                        Monthly Lunch Menu
                      </div>
                      {activeLunchMenu && (
                        <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-100">
                          Published Menu
                        </div>
                      )}
                    </div>
                    <div className="mt-4 grid gap-3">
                      {lunchMenus.length > 1 && (
                        <Field label="Menu">
                          <select
                            value={activeLunchMenu?.id || ""}
                            onChange={(event) => setLunchDraft({ ...lunchDraft, menuId: event.target.value, selectedItems: {}, editing: false })}
                            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                          >
                            {lunchMenus.map((menu) => <option key={menu.id} value={menu.id}>{menu.title}</option>)}
                          </select>
                        </Field>
                      )}
                      <Field label="Student">
                        <select
                          value={lunchDraft.studentId}
                          onChange={(event) => setLunchDraft({ ...lunchDraft, studentId: event.target.value, selectedItems: {}, editing: false })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                        >
                          <option value="">Select student</option>
                          {(portal.data.family?.students || []).map((student) => <option key={student.id} value={student.id}>{student.name} {student.grade ? `(Grade ${student.grade})` : ""}</option>)}
                        </select>
                      </Field>
                      <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-bold text-white">{activeLunchMenu?.title || "Lunch Menu"}</div>
                            <div className="text-xs text-slate-500">{activeLunchMenu ? monthName(activeLunchMenu.weekStart) : `No published menu loaded (${lunchMenus.length} received)`}</div>
                          </div>
                          <div className="text-right">
                            <div className="text-xs uppercase tracking-[0.14em] text-slate-500">{lunchCostLabel}</div>
                            <div className="text-xl font-bold text-emerald-200">{money(durableLunchCost)}</div>
                            {!lunchDraft.editing && !selectedLunchItems.length && Boolean(activeFamilyOrders.length) && (
                              <div className="mt-0.5 text-[11px] text-slate-500">Saved monthly lunch choices</div>
                            )}
                          </div>
                        </div>
                        {activeLunchMenu?.notes && <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs leading-5 text-slate-300">{activeLunchMenu.notes}</div>}
                      </div>
                      {lunchMenuSummaries.length > 0 && (
                        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-200">Submitted Menus</div>
                          <div className="mt-2 grid gap-2 md:grid-cols-2">
                            {lunchMenuSummaries.map((summary) => (
                              <div key={`${activeLunchMenu.id}-${summary.studentId || summary.studentName}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/20 bg-slate-950/70 px-3 py-2 text-sm">
                                <div>
                                  <div className="font-semibold text-white">
                                    {monthName(activeLunchMenu.weekStart)} Lunch Menu submitted for {summary.studentName}
                                  </div>
                                  <div className="mt-0.5 text-xs text-slate-500">
                                    {summary.count} item(s) selected{summary.futureCount ? ` | ${summary.futureCount} future item(s) editable` : " | past or processed items locked"}
                                  </div>
                                  <div className="mt-1 text-xs font-semibold text-emerald-200">Expected cost: {money(summary.expectedCost)}</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => startLunchEdit(summary)}
                                  disabled={!summary.futureCount}
                                  className="rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-xs font-bold text-sky-100 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Edit
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {activeLunchMenu && !lunchItems.length && (
                        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm leading-6 text-amber-100">
                          This lunch menu is published, but it does not have any dated lunch items saved yet. Please contact the WVCS office.
                        </div>
                      )}
                      {activeLunchMenu && lunchItems.length > 0 && (
                        <div className="grid gap-2 md:hidden">
                          {monthCells.filter(Boolean).map((cellDate) => {
                            const cellIso = isoDate(cellDate);
                            const dayItems = lunchItemsByDate.get(cellIso) || [];
                            return (
                              <div key={`mobile-${cellIso}`} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div>
                                    <div className="text-sm font-bold text-white">
                                      {cellDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                                    </div>
                                    <div className="mt-0.5 text-xs text-slate-500">{dayItems.length ? `${dayItems.length} option${dayItems.length === 1 ? "" : "s"}` : "No lunch offered"}</div>
                                  </div>
                                  {dayItems.some((item) => lunchDraft.selectedItems[item.itemKey]) && (
                                    <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-100">
                                      Selected
                                    </span>
                                  )}
                                </div>
                                <div className="mt-3 grid gap-2">
                                  {dayItems.map((item) => {
                                    const lockedPast = lunchDraft.editing && item.date < today && activeOrderKeys.has(`${item.date}:${item.name}`);
                                    const checked = lockedPast || Boolean(lunchDraft.selectedItems[item.itemKey]);
                                    return (
                                      <button
                                        key={item.itemKey}
                                        type="button"
                                        onClick={() => toggleLunchItem(item)}
                                        disabled={lockedPast}
                                        className={`flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-left text-sm ${
                                          checked ? "border-emerald-400 bg-emerald-500/15 text-emerald-50" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/50"
                                        } ${lockedPast ? "cursor-not-allowed opacity-70" : ""}`}
                                      >
                                        <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? "border-emerald-300 bg-emerald-400 text-slate-950" : "border-slate-600"}`}>
                                          {checked ? "✓" : ""}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block font-bold">{item.name}</span>
                                          <span className="block text-xs text-slate-500">{money(item.price)}{item.requiresMeal ? " | Requires meal" : ""}{lockedPast ? " | Locked" : ""}</span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                  {!dayItems.length && <div className="rounded-lg border border-dashed border-slate-800 p-3 text-center text-sm text-slate-600">No lunch</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <div className="hidden overflow-x-auto rounded-lg border border-slate-800 md:block">
                        <div className="min-w-[900px]">
                          <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-900 text-center text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                            {weekDays.map((day) => <div key={day} className="border-r border-slate-800 px-2 py-2 last:border-r-0">{day}</div>)}
                          </div>
                          <div className="grid grid-cols-5">
                            {monthCells.map((cellDate, index) => {
                              const cellIso = cellDate ? isoDate(cellDate) : "";
                              const dayItems = cellIso ? lunchItemsByDate.get(cellIso) || [] : [];
                              return (
                                <div key={cellIso || `blank-${index}`} className="min-h-40 border-r border-b border-slate-800 bg-slate-950 p-2 last:border-r-0">
                                  {cellDate ? (
                                    <>
                                      <div className="text-sm font-bold text-slate-200">{cellDate.getDate()}</div>
                                      <div className="mt-2 space-y-2">
                                        {dayItems.map((item) => {
                                          const lockedPast = lunchDraft.editing && item.date < today && activeOrderKeys.has(`${item.date}:${item.name}`);
                                          const checked = lockedPast || Boolean(lunchDraft.selectedItems[item.itemKey]);
                                          return (
                                            <button
                                              key={item.itemKey}
                                              type="button"
                                              onClick={() => toggleLunchItem(item)}
                                              disabled={lockedPast}
                                              className={`flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs transition ${
                                                checked ? "border-emerald-400 bg-emerald-500/15 text-emerald-50" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/50"
                                              } ${lockedPast ? "cursor-not-allowed opacity-70" : ""}`}
                                            >
                                              <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-emerald-300 bg-emerald-400 text-slate-950" : "border-slate-600"}`}>
                                                {checked ? "✓" : ""}
                                              </span>
                                              <span>
                                                <span className="block font-semibold">{item.name}</span>
                                                <span className="block text-slate-500">{money(item.price)}</span>
                                                {item.requiresMeal && <span className="block text-amber-200">Requires meal</span>}
                                                {lockedPast && <span className="block text-slate-500">Locked</span>}
                                              </span>
                                            </button>
                                          );
                                        })}
                                        {!dayItems.length && <div className="rounded-md border border-dashed border-slate-800 p-2 text-center text-xs text-slate-600">No lunch</div>}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="h-full rounded-md bg-slate-900/60" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={submitLunchOrder}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                      >
                        <Send size={16} />
                        {lunchDraft.editing ? "Save Lunch Menu Edits" : "Submit Monthly Lunch Order"}
                      </button>
                    </div>
                    {!activeLunchMenu && <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-500">No lunch menus are published yet. Use Refresh after the office publishes a menu. Menus received: {lunchMenus.length}.</div>}
                    {lunchStatus && <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{lunchStatus}</div>}
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-2">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-bold text-white">Lunch Orders</div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                      {(lunch.orders || []).map((order) => (
                        <div key={order.id} className="grid gap-2 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[100px_1fr_90px]">
                          <div className="text-slate-400">{shortDate(order.orderDate)}</div>
                          <div>
                            <div className="font-semibold text-white">{order.studentName}: {order.itemName}</div>
                            <div className="text-xs text-slate-500">{money(order.price)} | {order.source || "Lunch order"}</div>
                          </div>
                          <div className="font-semibold text-sky-200">{order.status}</div>
                        </div>
                      ))}
                      {!lunch.orders?.length && <div className="p-4 text-sm text-slate-500">No lunch orders yet.</div>}
                    </div>
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-bold text-white">Lunch Account History</div>
                    <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                      {(lunch.transactions || []).map((transaction) => (
                        <div key={transaction.id} className="flex items-start justify-between gap-3 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0">
                          <div>
                            <div className="font-semibold text-white">{transaction.description || transaction.type}</div>
                            <div className="text-xs text-slate-500">{shortDate(transaction.createdAt?.slice(0, 10))}</div>
                          </div>
                          <div className={transaction.amount < 0 ? "font-bold text-rose-200" : "font-bold text-emerald-200"}>{money(transaction.amount)}</div>
                        </div>
                      ))}
                      {!lunch.transactions?.length && <div className="p-4 text-sm text-slate-500">No lunch account activity yet.</div>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "invoices" && (
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <ReceiptText size={16} className="text-sky-300" />
                  Invoice History
                </div>
                <div className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm leading-6 text-amber-100">
                  Regular tuition balances are handled through FACTS. Full-pay tuition breakdown invoices listed here are paid directly through the WVCS office and are not paid through FACTS.
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {invoices.map((invoice) => (
                    <button
                      key={`${invoice.id}-${invoice.type}-${invoice.schoolYear || invoice.status}`}
                      type="button"
                      onClick={() =>
                        setSelectedInvoice((current) =>
                          current?.id === invoice.id && current?.type === invoice.type ? null : { id: invoice.id, type: invoice.type }
                        )
                      }
                      className={`block w-full rounded-lg border px-3 py-2 text-left text-sm transition hover:bg-slate-800 ${
                        visibleInvoice?.id === invoice.id && visibleInvoice?.type === invoice.type
                          ? "border-sky-500/50 bg-sky-500/10"
                          : "border-slate-800 bg-slate-950"
                      }`}
                    >
                      <div className="font-semibold text-white">{invoiceTitle(invoice)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        {invoice.type === "tuition" ? `Tuition breakdown | ${invoice.paymentStatus || "Pay through WVCS office"}` : invoice.paymentStatus || invoice.status}
                        {invoiceTotal(invoice) ? ` | ${money(invoiceTotal(invoice))}` : ""}
                      </div>
                    </button>
                  ))}
                  {!invoices.length && <div className="text-sm text-slate-500">No invoice history is available yet.</div>}
                </div>
                {visibleInvoice && (
                  <div className="mt-4 rounded-lg border border-sky-500/30 bg-slate-950 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-300">Invoice Viewer</div>
                        <div className="mt-1 text-base font-bold text-white">{invoiceTitle(visibleInvoice)}</div>
                        <div className="mt-1 text-xs text-slate-500">
                          {visibleInvoice.paymentStatus || visibleInvoice.status || "Invoice"} {visibleInvoice.sentAt ? `| Sent ${shortDate(visibleInvoice.sentAt)}` : ""}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Total</div>
                        <div className="text-lg font-bold text-white">{money(invoiceTotal(visibleInvoice))}</div>
                      </div>
                    </div>
                    <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                      {chargeRows(visibleInvoice).map((row, index) => (
                        <div key={`${row.label}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0">
                          <div className="text-slate-200">{row.label}</div>
                          <div className="font-semibold text-white">{money(row.amount)}</div>
                        </div>
                      ))}
                      {!chargeRows(visibleInvoice).length && (
                        <div className="px-3 py-3 text-sm text-slate-500">This invoice record does not include line-item details.</div>
                      )}
                    </div>
                    {visibleInvoice.receiptNumber && <div className="mt-3 text-xs text-slate-400">Receipt: {visibleInvoice.receiptNumber}</div>}
                    {incidentalUrl(visibleInvoice) && (
                      <a
                        href={incidentalUrl(visibleInvoice)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                      >
                        Open Full Invoice
                      </a>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "driver" && (
              <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
                <div className="space-y-4">
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <CheckCircle2 size={16} className={verifiedDriverApplication ? "text-emerald-300" : "text-slate-500"} />
                      Volunteer Driver Status
                    </div>
                    <div className={`mt-3 rounded-lg border p-3 ${verifiedDriverApplication ? "border-emerald-500/30 bg-emerald-500/10" : "border-slate-800 bg-slate-950"}`}>
                      <div className={`text-lg font-bold ${verifiedDriverApplication ? "text-emerald-200" : "text-white"}`}>
                        {verifiedDriverApplication ? "Verified Driver" : latestDriverApplication?.status || "Not Verified"}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {verifiedDriverApplication
                          ? `Verified through ${shortDate(verifiedDriverApplication.expiresAt)}.`
                          : latestDriverApplication
                            ? `Latest application submitted ${shortDate(latestDriverApplication.submittedAt)}.`
                            : "Submit the application and required documents for office review."}
                      </div>
                      {latestDriverApplication?.officeNote && <div className="mt-2 text-xs text-slate-300">Office note: {latestDriverApplication.officeNote}</div>}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                    <div className="text-sm font-bold text-white">Minimum Requirements</div>
                    <div className="mt-2 text-sm leading-6 text-slate-400">
                      WVCS requires minimum liability coverage of $100,000 per person, $300,000 per accident, and $50,000 property damage.
                    </div>
                    <div className="mt-3 text-xs leading-5 text-slate-500">
                      A new volunteer driver application is required each school year. Verification lasts one year from office approval.
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <FileText size={16} className="text-sky-300" />
                    Volunteer Driver Application
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <Field label="School Year"><Input value={driverDraft.schoolYear} onChange={(event) => setDriverDraft({ ...driverDraft, schoolYear: event.target.value })} /></Field>
                    <Field label="Driver Name"><Input value={driverDraft.parentName} onChange={(event) => setDriverDraft({ ...driverDraft, parentName: event.target.value })} placeholder="Parent/guardian name" /></Field>
                    <Field label="Driver's License #"><Input value={driverDraft.driverLicenseNumber} onChange={(event) => setDriverDraft({ ...driverDraft, driverLicenseNumber: event.target.value })} /></Field>
                    <Field label="License Expiration"><Input type="date" value={driverDraft.licenseExpiration} onChange={(event) => setDriverDraft({ ...driverDraft, licenseExpiration: event.target.value })} /></Field>
                    <Field label="Phone"><Input value={driverDraft.phoneHome} onChange={(event) => setDriverDraft({ ...driverDraft, phoneHome: event.target.value })} /></Field>
                    <Field label="Work Phone"><Input value={driverDraft.phoneWork} onChange={(event) => setDriverDraft({ ...driverDraft, phoneWork: event.target.value })} /></Field>
                    <div className="md:col-span-2"><Field label="Address"><Input value={driverDraft.address} onChange={(event) => setDriverDraft({ ...driverDraft, address: event.target.value })} /></Field></div>
                  </div>

                  <div className="mt-5 grid gap-4 lg:grid-cols-2">
                    {[1, 2].map((carNumber) => (
                      <div key={carNumber} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="text-sm font-bold text-white">Vehicle {carNumber}{carNumber === 2 ? " (optional)" : ""}</div>
                        <div className="mt-3 grid gap-3">
                          <Field label="Car Model / Year"><Input value={driverDraft[`car${carNumber}ModelYear`]} onChange={(event) => setDriverDraft({ ...driverDraft, [`car${carNumber}ModelYear`]: event.target.value })} /></Field>
                          <Field label="Working Seatbelts"><Input inputMode="numeric" value={driverDraft[`car${carNumber}Seatbelts`]} onChange={(event) => setDriverDraft({ ...driverDraft, [`car${carNumber}Seatbelts`]: event.target.value })} /></Field>
                          <Field label="License Plate"><Input value={driverDraft[`car${carNumber}LicensePlate`]} onChange={(event) => setDriverDraft({ ...driverDraft, [`car${carNumber}LicensePlate`]: event.target.value })} /></Field>
                          <Field label="Insurance Company"><Input value={driverDraft[`car${carNumber}InsuranceCompany`]} onChange={(event) => setDriverDraft({ ...driverDraft, [`car${carNumber}InsuranceCompany`]: event.target.value })} /></Field>
                          <Field label="Policy #"><Input value={driverDraft[`car${carNumber}PolicyNumber`]} onChange={(event) => setDriverDraft({ ...driverDraft, [`car${carNumber}PolicyNumber`]: event.target.value })} /></Field>
                          <Field label="Uninsured / Underinsured Coverage">
                            <select value={driverDraft[`car${carNumber}UninsuredCoverage`]} onChange={(event) => setDriverDraft({ ...driverDraft, [`car${carNumber}UninsuredCoverage`]: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400">
                              <option value="">Select</option>
                              <option value="Yes">Yes</option>
                              <option value="No">No</option>
                            </select>
                          </Field>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="text-sm font-bold text-white">Insurance Coverage for Primary Vehicle</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <Field label="Per Person"><Input inputMode="decimal" value={driverDraft.liabilityPerPerson} onChange={(event) => setDriverDraft({ ...driverDraft, liabilityPerPerson: event.target.value })} placeholder="100000" /></Field>
                      <Field label="Per Accident"><Input inputMode="decimal" value={driverDraft.liabilityPerAccident} onChange={(event) => setDriverDraft({ ...driverDraft, liabilityPerAccident: event.target.value })} placeholder="300000" /></Field>
                      <Field label="Property Damage"><Input inputMode="decimal" value={driverDraft.propertyDamage} onChange={(event) => setDriverDraft({ ...driverDraft, propertyDamage: event.target.value })} placeholder="50000" /></Field>
                    </div>
                  </div>

                  <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="text-sm font-bold text-white">Driving History</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <Field label="Licensed to drive a commercial vehicle?">
                        <select value={driverDraft.commercialLicense} onChange={(event) => setDriverDraft({ ...driverDraft, commercialLicense: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400">
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </Field>
                      <Field label="Accident in the last three years?">
                        <select value={driverDraft.accidentLastThreeYears} onChange={(event) => setDriverDraft({ ...driverDraft, accidentLastThreeYears: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400">
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </Field>
                      {driverDraft.accidentLastThreeYears === "Yes" && (
                        <div className="md:col-span-2">
                          <Field label="Accident description and cause">
                            <textarea value={driverDraft.accidentExplanation} onChange={(event) => setDriverDraft({ ...driverDraft, accidentExplanation: event.target.value })} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" />
                          </Field>
                        </div>
                      )}
                      <Field label="Moving violation ticket in the last three years?">
                        <select value={driverDraft.movingViolationLastThreeYears} onChange={(event) => setDriverDraft({ ...driverDraft, movingViolationLastThreeYears: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400">
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </Field>
                      <Field label="DWI/DUI, suspension, reckless operation, or revocation?">
                        <select value={driverDraft.duiOrSuspensionHistory} onChange={(event) => setDriverDraft({ ...driverDraft, duiOrSuspensionHistory: event.target.value })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400">
                          <option value="">Select</option>
                          <option value="Yes">Yes</option>
                          <option value="No">No</option>
                        </select>
                      </Field>
                      {driverDraft.movingViolationLastThreeYears === "Yes" && (
                        <div className="md:col-span-2">
                          <Field label="Moving violation description">
                            <textarea value={driverDraft.movingViolationExplanation} onChange={(event) => setDriverDraft({ ...driverDraft, movingViolationExplanation: event.target.value })} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" />
                          </Field>
                        </div>
                      )}
                    </div>
                    {driverDraft.duiOrSuspensionHistory === "Yes" && (
                      <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-xs leading-5 text-rose-100">
                        WVCS cannot use volunteer drivers with a yes answer to this item.
                      </div>
                    )}
                  </div>

                  <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="text-sm font-bold text-white">Requirements for Volunteer Drivers</div>
                    <div className="mt-3 max-w-sm">
                      <Field label="State of valid driver's license"><Input value={driverDraft.stateLicense} onChange={(event) => setDriverDraft({ ...driverDraft, stateLicense: event.target.value })} placeholder="OR" /></Field>
                    </div>
                    <label className="mt-3 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                      <input type="checkbox" checked={driverDraft.driverRequirementsAcknowledged} onChange={(event) => setDriverDraft({ ...driverDraft, driverRequirementsAcknowledged: event.target.checked })} className="mt-1 h-4 w-4 accent-sky-500" />
                      <span>I certify that I have a valid driver&apos;s license, will keep required insurance active, will notify WVCS of accidents, citations, license or insurance changes, will use working seatbelts and required child restraints, and will follow WVCS driver/chaperone instructions.</span>
                    </label>
                  </div>

                  <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="text-sm font-bold text-white">Declaration and Electronic Signature</div>
                    <label className="mt-3 flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm text-slate-300">
                      <input type="checkbox" checked={driverDraft.driverDeclarationAcknowledged} onChange={(event) => setDriverDraft({ ...driverDraft, driverDeclarationAcknowledged: event.target.checked })} className="mt-1 h-4 w-4 accent-sky-500" />
                      <span>I affirm that I will carefully transport students under my care, obey all traffic laws, and that the information in this application is true and correct to the best of my knowledge.</span>
                    </label>
                    <div className="mt-3 grid gap-3 md:grid-cols-[1fr_180px]">
                      <Field label="Electronic signature"><Input value={driverDraft.electronicSignature} onChange={(event) => setDriverDraft({ ...driverDraft, electronicSignature: event.target.value })} placeholder="Type full legal name" /></Field>
                      <Field label="Date"><Input type="date" value={driverDraft.signatureDate} onChange={(event) => setDriverDraft({ ...driverDraft, signatureDate: event.target.value })} /></Field>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 md:grid-cols-2">
                    <Field label="Driver's License Image">
                      <input type="file" accept="image/*,.pdf" onChange={(event) => setDriverFiles({ ...driverFiles, license: event.target.files?.[0] || null })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
                    </Field>
                    <Field label="Insurance Card Image">
                      <input type="file" accept="image/*,.pdf" onChange={(event) => setDriverFiles({ ...driverFiles, insurance: event.target.files?.[0] || null })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200" />
                    </Field>
                  </div>

                  <button type="button" onClick={submitDriverApplication} disabled={submittingDriver} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-3 text-sm font-bold text-sky-100 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60">
                    <Send size={16} />
                    {submittingDriver ? "Submitting..." : "Submit for Office Verification"}
                  </button>
                  {driverStatus && <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{driverStatus}</div>}
                </div>
              </div>
            )}

            {activeTab === "fos" && (
              <div className="space-y-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <Stat label="Approved Hours" value={balance.approvedHours || 0} tone="green" />
                  <Stat label="Remaining Hours" value={balance.remainingHours || 0} tone="amber" />
                  <Stat label="FOS Amount Owed" value={money(balance.remainingBalance)} tone="rose" info={fosBalanceInfo} />
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <Clock size={16} className="text-sky-300" />
                      FOS Hours
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowFosForm((current) => !current)}
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                    >
                      <Send size={16} />
                      {showFosForm ? "Close Form" : "Report Volunteer Hours"}
                    </button>
                  </div>

                  {showFosForm && (
                    <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-4">
                      <div className="grid gap-3 md:grid-cols-2">
                        <Field label="Parent / Guardian Name">
                          <Input value={draft.parentName} onChange={(event) => setDraft({ ...draft, parentName: event.target.value })} />
                        </Field>
                        <Field label="Email">
                          <Input type="email" value={draft.parentEmail} onChange={(event) => setDraft({ ...draft, parentEmail: event.target.value })} />
                        </Field>
                        <Field label="Date">
                          <Input type="date" value={draft.activityDate} onChange={(event) => setDraft({ ...draft, activityDate: event.target.value })} />
                        </Field>
                        <Field label="Hours">
                          <Input inputMode="decimal" value={draft.hours} onChange={(event) => setDraft({ ...draft, hours: event.target.value })} placeholder="0.00" />
                        </Field>
                        <div className="md:col-span-2">
                          <Field label="Activity">
                            <Input value={draft.activity} onChange={(event) => setDraft({ ...draft, activity: event.target.value })} placeholder="Auction help, classroom support, event setup..." />
                          </Field>
                        </div>
                        <div className="md:col-span-2">
                          <Field label="Notes">
                            <Input value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Optional details" />
                          </Field>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={submitHours}
                        disabled={submitting}
                        aria-busy={submitting}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:opacity-60"
                      >
                        <Send size={16} />
                        {submitting ? "Submitting..." : "Submit Hours"}
                      </button>
                    </div>
                  )}
                  {status && <div className="mt-3 text-sm text-sky-200">{status}</div>}
                </div>

                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="flex items-center gap-2 text-sm font-bold text-white">
                    <CheckCircle2 size={16} className="text-emerald-300" />
                    FOS History
                  </div>
                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                    {entries.map((entry) => (
                      <div key={entry.id} className="grid gap-2 border-b border-slate-800 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[100px_1fr_80px_90px]">
                        <div className="text-slate-400">{shortDate(entry.activityDate)}</div>
                        <div>
                          <div className="font-semibold text-white">{entry.activity}</div>
                          {entry.officeNote && <div className="mt-1 text-xs text-slate-500">{entry.officeNote}</div>}
                        </div>
                        <div className="text-slate-300">{entry.approvedHours || entry.submittedHours} hrs</div>
                        <div className="font-semibold text-sky-200">{entry.status}</div>
                      </div>
                    ))}
                    {!entries.length && <div className="p-4 text-sm text-slate-500">No FOS hours have been submitted yet.</div>}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
