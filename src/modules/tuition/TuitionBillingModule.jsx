import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  Download,
  Mail,
  Plus,
  Printer,
  ReceiptText,
  Save,
  Trash2,
} from "lucide-react";
import {
  deleteTuitionInvoice,
  fetchTuitionInvoices,
  saveTuitionInvoice,
  sendTuitionInvoiceEmail,
} from "../../lib/tuitionBillingData.js";
import warriorHeadNew from "../../assets/warrior-head-new.png";

const today = new Date().toISOString().slice(0, 10);

const DISCOUNT_OPTIONS = [
  "Staff Discount",
  "Pastoral Discount",
  "New Family Discount",
  "Financial Aid",
  "Multi-student",
];

const DEFAULT_PAYMENT_NOTE = "Early pay discount applies when paid by check, cashier's check, or money order by August 28th.";
const DEFAULT_FEE_NOTE = "Includes consumable materials, field trips, retreats, and yearbooks.";
const EARLY_PAY_DISCOUNT_RATE = 0.05;

function createBlankParent() {
  return {
    id: uid("parent"),
    name: "",
    email: "",
  };
}

function createBlankDiscount(label = DISCOUNT_OPTIONS[0]) {
  return {
    id: uid("discount"),
    label,
    customLabel: "",
    amount: "",
  };
}

function createBlankStudent() {
  return {
    id: uid("student"),
    name: "",
    grade: "",
    tuition: "",
    discounts: [],
    comprehensiveFee: "450.00",
    feeNote: DEFAULT_FEE_NOTE,
  };
}

const defaultInvoice = {
  schoolYear: "2026-2027",
  familyName: "",
  parentName: "",
  parentEmail: "",
  parents: [createBlankParent()],
  invoiceDate: today,
  dueDate: "",
  preparedBy: "",
  note: "",
  paymentNote: DEFAULT_PAYMENT_NOTE,
  registrationFee: "250.00",
  registrationFeePaid: false,
  students: [createBlankStudent()],
};

const defaultIncidentalInvoice = {
  familyName: "",
  parentName: "",
  parentEmail: "",
  invoiceDate: today,
  dueDate: "",
  note: "Please contact the school office with any questions about these incidental charges.",
  charges: [{ id: "charge-1", description: "", amount: "" }],
};

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(value) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(money(value));
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return value;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getInvoiceParents(invoice) {
  if (Array.isArray(invoice.parents) && invoice.parents.length) {
    return invoice.parents.map((parent) => ({
      id: parent.id || uid("parent"),
      name: parent.name || "",
      email: parent.email || "",
    }));
  }

  return [
    {
      id: "parent-primary",
      name: invoice.parentName || "",
      email: invoice.parentEmail || "",
    },
  ];
}

function getParentRecipients(invoice) {
  return Array.from(
    new Set(getInvoiceParents(invoice).map((parent) => String(parent.email || "").trim()).filter(Boolean))
  );
}

function getParentDisplayName(invoice) {
  const names = getInvoiceParents(invoice).map((parent) => parent.name).filter(Boolean);
  if (!names.length) return "Parent/Guardian";
  if (names.length === 1) return names[0];
  return names.join(" and ");
}

function getStudentDiscounts(student) {
  if (Array.isArray(student.discounts)) {
    return student.discounts.map((discount) => ({
      id: discount.id || uid("discount"),
      label: discount.label || DISCOUNT_OPTIONS[0],
      customLabel: discount.customLabel || "",
      amount: discount.amount || "",
    }));
  }

  return [
    money(student.newStudentDiscount)
      ? {
          id: uid("discount"),
          label: "New Family Discount",
          customLabel: "",
          amount: student.newStudentDiscount,
        }
      : null,
  ].filter(Boolean);
}

function getDiscountLabel(discount) {
  return discount.label === "Manual" ? discount.customLabel || "Custom Discount" : discount.label;
}

function studentDiscountTotal(student) {
  return getStudentDiscounts(student).reduce((total, discount) => total + money(discount.amount), 0);
}

function studentTuitionAfterDiscounts(student) {
  return Math.max(money(student.tuition) - studentDiscountTotal(student), 0);
}

function studentEarlyPayDiscount(student) {
  return studentTuitionAfterDiscounts(student) * EARLY_PAY_DISCOUNT_RATE;
}

function studentTotal(student) {
  return (
    studentTuitionAfterDiscounts(student) -
    studentEarlyPayDiscount(student) +
    money(student.comprehensiveFee)
  );
}

function invoiceTotals(invoice) {
  const studentSubtotal = invoice.students.reduce((total, student) => total + studentTotal(student), 0);
  const registrationFee = money(invoice.registrationFee);
  const registrationFeeDue = invoice.registrationFeePaid ? 0 : registrationFee;
  return {
    studentSubtotal,
    registrationFee,
    registrationFeeDue,
    grandTotal: studentSubtotal + registrationFeeDue,
  };
}

function invoiceTitle(invoice) {
  const family = invoice.familyName?.trim() || "Family";
  const schoolYear = invoice.schoolYear?.trim() || "School Year";
  return `${family} ${schoolYear} Tuition Breakdown`;
}

function groupInvoicesByYear(invoices) {
  const sorted = [...invoices].sort((a, b) => {
    const yearCompare = String(b.schoolYear || "").localeCompare(String(a.schoolYear || ""));
    if (yearCompare !== 0) return yearCompare;
    return String(a.familyName || "").localeCompare(String(b.familyName || ""));
  });

  return sorted.reduce((groups, record) => {
    const year = record.schoolYear || "No School Year";
    groups[year] = [...(groups[year] || []), record];
    return groups;
  }, {});
}

function formatShortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm font-medium text-slate-200">
      {label}
      {children}
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400 ${props.className || ""}`}
    />
  );
}

function MoneyInput(props) {
  return <Input inputMode="decimal" placeholder="0.00" {...props} />;
}

function getInvoiceFileName(invoice) {
  return `${invoiceTitle(invoice).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`;
}

async function blobToBase64(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return String(dataUrl).split(",")[1];
}

function InvoicePreview({ invoice, invoiceRef }) {
  const totals = invoiceTotals(invoice);
  const parents = getInvoiceParents(invoice);

  return (
    <div ref={invoiceRef} className="tuition-invoice bg-white p-10 text-slate-950 shadow-xl">
      <div className="flex items-start justify-between gap-8 border-b border-slate-200 pb-6">
        <div className="flex items-start gap-4">
          <img src={warriorHeadNew} alt="Willamette Valley Christian School" className="h-16 w-16 object-contain" />
          <div>
            <div className="text-xs font-bold uppercase text-sky-700">Willamette Valley Christian School</div>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">{invoiceTitle(invoice)}</h1>
            <div className="mt-3 text-sm text-slate-600">
              <div>{getParentDisplayName(invoice)}</div>
              {parents
                .map((parent) => parent.email)
                .filter(Boolean)
                .map((email) => (
                  <div key={email}>{email}</div>
                ))}
            </div>
          </div>
        </div>
        <div className="min-w-48 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm">
          <div className="flex justify-between gap-4">
            <span className="font-semibold text-slate-500">Invoice Date</span>
            <span>{formatDate(invoice.invoiceDate) || "Not set"}</span>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <span className="font-semibold text-slate-500">Due Date</span>
            <span>{formatDate(invoice.dueDate) || "Not set"}</span>
          </div>
          <div className="mt-2 flex justify-between gap-4">
            <span className="font-semibold text-slate-500">Prepared By</span>
            <span>{invoice.preparedBy || "WVCS Office"}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {invoice.students.map((student) => (
          <section key={student.id} className="break-inside-avoid rounded-lg border border-slate-200">
            <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3">
              <h2 className="text-lg font-bold text-slate-950">
                {student.name || "Student"}{student.grade ? ` - ${student.grade}` : ""}
              </h2>
              <div className="text-sm font-bold text-slate-700">{formatCurrency(studentTotal(student))}</div>
            </div>
            <div className="p-5">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <span>Tuition</span>
                  <span className="font-semibold">{formatCurrency(student.tuition)}</span>
                </div>
                {getStudentDiscounts(student)
                  .filter((discount) => money(discount.amount))
                  .map((discount) => (
                    <div key={discount.id} className="flex justify-between gap-4 text-emerald-700">
                      <span>{getDiscountLabel(discount)}</span>
                      <span className="font-semibold">-{formatCurrency(discount.amount)}</span>
                    </div>
                  ))}
                <div className="flex justify-between gap-4 text-emerald-700">
                  <span>5% Early Pay Discount</span>
                  <span className="font-semibold">-{formatCurrency(studentEarlyPayDiscount(student))}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span>
                    Comprehensive Fees
                    {student.feeNote && <span className="ml-1 text-xs text-slate-500">({student.feeNote})</span>}
                  </span>
                  <span className="font-semibold">{formatCurrency(student.comprehensiveFee)}</span>
                </div>
              </div>
              {invoice.paymentNote && <p className="mt-4 text-xs leading-5 text-slate-500">{invoice.paymentNote}</p>}
            </div>
          </section>
        ))}

        <section className="break-inside-avoid rounded-lg border border-slate-200">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-3">
            <h2 className="text-lg font-bold text-slate-950">Total for the {invoice.schoolYear || "School"} Year</h2>
          </div>
          <div className="space-y-2 p-5 text-sm">
            {invoice.students.map((student) => (
              <div key={`${student.id}-total`} className="flex justify-between gap-4">
                <span>{student.name || "Student"} tuition total</span>
                <span className="font-semibold">{formatCurrency(studentTotal(student))}</span>
              </div>
            ))}
            <div className="flex justify-between gap-4">
              <span>
                Registration Fee
                {invoice.registrationFeePaid && <span className="ml-2 text-xs font-semibold text-emerald-700">Already paid</span>}
              </span>
              <span className="text-right">
                <span className={`font-semibold ${invoice.registrationFeePaid ? "text-slate-500 line-through" : ""}`}>
                  {formatCurrency(invoice.registrationFee)}
                </span>
                {invoice.registrationFeePaid && <span className="ml-2 text-xs font-semibold text-emerald-700">$0 due</span>}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-4 border-t-2 border-slate-900 pt-4 text-xl font-bold">
              <span>Total Amount</span>
              <span>{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>
        </section>
      </div>

      {invoice.note && (
        <div className="mt-8 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {invoice.note}
        </div>
      )}

      <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
        Willamette Valley Christian School | 9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236 | wvcs.org
      </div>
    </div>
  );
}

export default function TuitionBillingModule({ currentUserEmail = "" }) {
  const [activeView, setActiveView] = useState("tuition");
  const [invoice, setInvoice] = useState(defaultInvoice);
  const [incidentalInvoice, setIncidentalInvoice] = useState(defaultIncidentalInvoice);
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [status, setStatus] = useState("");
  const [savedStatus, setSavedStatus] = useState("Loading saved invoices...");
  const [sendingEmail, setSendingEmail] = useState(false);
  const invoiceRef = useRef(null);
  const totals = useMemo(() => invoiceTotals(invoice), [invoice]);
  const groupedSavedInvoices = useMemo(() => groupInvoicesByYear(savedInvoices), [savedInvoices]);

  async function loadSavedInvoices() {
    try {
      const result = await fetchTuitionInvoices();
      setSavedInvoices(result.invoices || []);
      setSavedStatus(result.loaded ? "Saved invoices loaded." : result.reason || "Showing local saved invoices.");
    } catch (error) {
      setSavedStatus(`Unable to load saved invoices: ${error.message}`);
    }
  }

  useEffect(() => {
    loadSavedInvoices();
  }, []);

  function updateInvoice(patch) {
    setInvoice((current) => ({ ...current, ...patch }));
  }

  function updateParent(parentId, patch) {
    setInvoice((current) => {
      const parents = getInvoiceParents(current).map((parent) => (parent.id === parentId ? { ...parent, ...patch } : parent));
      const firstParent = parents[0] || createBlankParent();
      return {
        ...current,
        parents,
        parentName: firstParent.name,
        parentEmail: firstParent.email,
      };
    });
  }

  function addParent() {
    setInvoice((current) => ({
      ...current,
      parents: [...getInvoiceParents(current), createBlankParent()],
    }));
  }

  function removeParent(parentId) {
    setInvoice((current) => {
      const nextParents = getInvoiceParents(current).filter((parent) => parent.id !== parentId);
      const parents = nextParents.length ? nextParents : [createBlankParent()];
      const firstParent = parents[0];
      return {
        ...current,
        parents,
        parentName: firstParent.name,
        parentEmail: firstParent.email,
      };
    });
  }

  async function saveCurrentInvoice(patch = {}) {
    const invoiceId = invoice.id || selectedInvoiceId || crypto.randomUUID();
    const nextInvoice = {
      ...invoice,
      id: invoiceId,
      status: patch.status || invoice.status || "Draft",
    };
    const record = {
      id: invoiceId,
      invoice: nextInvoice,
      status: patch.status || "Draft",
      sentAt: patch.sentAt || invoice.sentAt || "",
      sentTo: patch.sentTo || invoice.sentTo || [],
    };
    const result = await saveTuitionInvoice(record, currentUserEmail);
    setInvoice({
      ...result.invoice.invoice,
      id: result.invoice.id,
      status: result.invoice.status || "Draft",
      sentAt: result.invoice.sentAt || "",
      sentTo: result.invoice.sentTo || [],
    });
    setSelectedInvoiceId(result.invoice.id);
    setSavedInvoices((current) => [result.invoice, ...current.filter((item) => item.id !== result.invoice.id)]);
    setSavedStatus(result.local ? "Invoice saved on this device." : "Invoice saved.");
    return result.invoice;
  }

  async function handleSaveInvoice() {
    try {
      const saved = await saveCurrentInvoice({ status: invoice.status || "Draft" });
      setStatus(`${saved.familyName || "Invoice"} saved for ${saved.schoolYear || "school year"}.`);
    } catch (error) {
      setStatus(`Unable to save invoice: ${error.message}`);
    }
  }

  function loadInvoiceRecord(record) {
    setInvoice({
      ...defaultInvoice,
      ...(record.invoice || {}),
      id: record.id,
      status: record.status || "Draft",
      sentAt: record.sentAt || "",
      sentTo: record.sentTo || [],
    });
    setSelectedInvoiceId(record.id);
    setStatus(`Loaded ${record.familyName || "saved invoice"}.`);
  }

  async function removeSavedInvoice(record) {
    const confirmed = window.confirm(`Delete the saved invoice for ${record.familyName || "this family"}?`);
    if (!confirmed) return;
    try {
      await deleteTuitionInvoice(record.id);
      setSavedInvoices((current) => current.filter((item) => item.id !== record.id));
      if (selectedInvoiceId === record.id) {
        setSelectedInvoiceId("");
        resetInvoice();
      }
      setStatus("Saved invoice deleted.");
    } catch (error) {
      setStatus(`Unable to delete saved invoice: ${error.message}`);
    }
  }

  function updateStudent(studentId, patch) {
    setInvoice((current) => ({
      ...current,
      students: current.students.map((student) => (student.id === studentId ? { ...student, ...patch } : student)),
    }));
  }

  function addStudent() {
    setInvoice((current) => ({
      ...current,
      students: [...current.students, createBlankStudent()],
    }));
  }

  function removeStudent(studentId) {
    setInvoice((current) => ({
      ...current,
      students: current.students.length > 1 ? current.students.filter((student) => student.id !== studentId) : current.students,
    }));
  }

  function addStudentDiscount(studentId) {
    setInvoice((current) => ({
      ...current,
      students: current.students.map((student) =>
        student.id === studentId
          ? { ...student, discounts: [...getStudentDiscounts(student), createBlankDiscount()] }
          : student
      ),
    }));
  }

  function updateStudentDiscount(studentId, discountId, patch) {
    setInvoice((current) => ({
      ...current,
      students: current.students.map((student) =>
        student.id === studentId
          ? {
              ...student,
              discounts: getStudentDiscounts(student).map((discount) =>
                discount.id === discountId ? { ...discount, ...patch } : discount
              ),
            }
          : student
      ),
    }));
  }

  function removeStudentDiscount(studentId, discountId) {
    setInvoice((current) => ({
      ...current,
      students: current.students.map((student) =>
        student.id === studentId
          ? { ...student, discounts: getStudentDiscounts(student).filter((discount) => discount.id !== discountId) }
          : student
      ),
    }));
  }

  function resetInvoice() {
    setInvoice({
      ...defaultInvoice,
      id: "",
      status: "Draft",
      invoiceDate: today,
      students: defaultInvoice.students.map((student) => ({ ...student })),
    });
    setSelectedInvoiceId("");
    setStatus("Started a fresh invoice draft.");
  }

  async function createInvoicePdfBlob() {
    if (!invoiceRef.current) return;
    const html2pdf = (await import("html2pdf.js")).default;
    return html2pdf()
      .set({
        margin: 0.25,
        filename: getInvoiceFileName(invoice),
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      })
      .from(invoiceRef.current)
      .outputPdf("blob");
  }

  async function downloadPdf() {
    setStatus("Preparing PDF...");
    const blob = await createInvoicePdfBlob();
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = getInvoiceFileName(invoice);
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus("PDF downloaded.");
  }

  function printInvoice() {
    window.print();
  }

  async function sendInvoiceEmail() {
    const recipients = getParentRecipients(invoice);
    if (!recipients.length) {
      setStatus("Enter at least one parent email before sending.");
      return;
    }
    setSendingEmail(true);
    setStatus("Preparing and sending tuition breakdown email...");
    try {
      const blob = await createInvoicePdfBlob();
      if (!blob) throw new Error("Unable to create invoice PDF.");
      const result = await sendTuitionInvoiceEmail({
        invoice: {
          ...invoice,
          total: totals.grandTotal,
          title: invoiceTitle(invoice),
        },
        recipients,
        attachment: {
          filename: getInvoiceFileName(invoice),
          mimeType: "application/pdf",
          contentBase64: await blobToBase64(blob),
        },
      });
      if (result.sent) {
        await saveCurrentInvoice({
          status: "Sent",
          sentAt: new Date().toISOString(),
          sentTo: recipients,
        });
      }
      setStatus(result.sent ? `Tuition breakdown sent to ${recipients.join(", ")}.` : result.reason || "Email was not sent.");
    } catch (error) {
      setStatus(`Unable to send tuition breakdown email: ${error.message}`);
    } finally {
      setSendingEmail(false);
    }
  }

  function saveDraft() {
    handleSaveInvoice();
  }

  function updateIncidentalInvoice(patch) {
    setIncidentalInvoice((current) => ({ ...current, ...patch }));
  }

  function updateCharge(chargeId, patch) {
    setIncidentalInvoice((current) => ({
      ...current,
      charges: current.charges.map((charge) => (charge.id === chargeId ? { ...charge, ...patch } : charge)),
    }));
  }

  function addCharge() {
    setIncidentalInvoice((current) => ({
      ...current,
      charges: [...current.charges, { id: uid("charge"), description: "", amount: "" }],
    }));
  }

  function removeCharge(chargeId) {
    setIncidentalInvoice((current) => ({
      ...current,
      charges: current.charges.length > 1 ? current.charges.filter((charge) => charge.id !== chargeId) : current.charges,
    }));
  }

  return (
    <section className="min-h-[680px] bg-slate-950 px-5 py-6 text-slate-100">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .tuition-invoice, .tuition-invoice * { visibility: visible; }
          .tuition-invoice {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none !important;
          }
        }
      `}</style>
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              <ReceiptText size={15} />
              Office Manager and Payroll
            </div>
            <h1 className="mt-2 text-2xl font-bold text-white">Office & Payroll</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Prepare tuition breakdowns for families and manage separate incidental charge invoices from one office workspace.
            </p>
          </div>
          {activeView === "tuition" && (
            <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              <Save size={16} />
              Save Invoice
            </button>
            <button
              type="button"
              onClick={loadSavedInvoices}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Refresh List
            </button>
            <button
              type="button"
              onClick={resetInvoice}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              New Invoice
            </button>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
          {[
            ["tuition", "Tuition Breakdown", ReceiptText],
            ["incidentals", "Incidentals", Calculator],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveView(id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                activeView === id
                  ? "border-sky-400 bg-sky-500 text-white"
                  : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>

        {status && (
          <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            {status}
          </div>
        )}

        {activeView === "tuition" && (
        <div className="mt-6 grid gap-6 xl:grid-cols-[320px_520px_1fr]">
          <div className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-white">Saved Invoices</div>
                  <div className="mt-1 text-xs text-slate-500">{savedStatus}</div>
                </div>
                <button
                  type="button"
                  onClick={loadSavedInvoices}
                  className="rounded-lg border border-slate-700 px-2.5 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="max-h-[860px] overflow-auto p-3">
              {Object.entries(groupedSavedInvoices).map(([year, records]) => (
                <div key={year} className="mb-4">
                  <div className="sticky top-0 z-10 rounded-md bg-slate-800 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300">
                    {year}
                  </div>
                  <div className="mt-2 space-y-2">
                    {records.map((record) => (
                      <div
                        key={record.id}
                        className={`rounded-lg border p-3 ${
                          selectedInvoiceId === record.id
                            ? "border-sky-400 bg-sky-500/10"
                            : "border-slate-800 bg-slate-950"
                        }`}
                      >
                        <button type="button" onClick={() => loadInvoiceRecord(record)} className="w-full text-left">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-white">{record.familyName || "Unnamed Family"}</div>
                              <div className="mt-1 text-xs text-slate-500">
                                Updated {formatShortDate(record.updatedAt) || "recently"}
                              </div>
                            </div>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                                record.status === "Sent"
                                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                                  : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                              }`}
                            >
                              {record.status || "Draft"}
                            </span>
                          </div>
                          {record.sentAt && (
                            <div className="mt-2 text-xs text-slate-400">
                              Sent {formatShortDate(record.sentAt)}
                            </div>
                          )}
                        </button>
                        <div className="mt-3 flex gap-2">
                          <button
                            type="button"
                            onClick={() => loadInvoiceRecord(record)}
                            className="flex-1 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                          >
                            Open
                          </button>
                          <button
                            type="button"
                            onClick={() => removeSavedInvoice(record)}
                            className="rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {!savedInvoices.length && (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-sm leading-6 text-slate-400">
                  Saved tuition invoices will appear here, grouped by school year and alphabetized by family name.
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Calculator size={16} className="text-sky-300" />
                Invoice Details
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Family Name">
                  <Input
                    value={invoice.familyName}
                    onChange={(event) => updateInvoice({ familyName: event.target.value })}
                    placeholder="Example: Johnson Family"
                  />
                </Field>
                <Field label="School Year">
                  <Input
                    value={invoice.schoolYear}
                    onChange={(event) => updateInvoice({ schoolYear: event.target.value })}
                    placeholder="2026-2027"
                  />
                </Field>
                <Field label="Invoice Date">
                  <Input type="date" value={invoice.invoiceDate} onChange={(event) => updateInvoice({ invoiceDate: event.target.value })} />
                </Field>
                <Field label="Due Date">
                  <Input type="date" value={invoice.dueDate} onChange={(event) => updateInvoice({ dueDate: event.target.value })} />
                </Field>
                <Field label="Registration Fee">
                  <div className="grid gap-2">
                    <MoneyInput value={invoice.registrationFee} onChange={(event) => updateInvoice({ registrationFee: event.target.value })} />
                    <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(invoice.registrationFeePaid)}
                        onChange={(event) => updateInvoice({ registrationFeePaid: event.target.checked })}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
                      />
                      Registration fee already paid
                    </label>
                  </div>
                </Field>
                <Field label="Prepared By">
                  <Input
                    value={invoice.preparedBy}
                    onChange={(event) => updateInvoice({ preparedBy: event.target.value })}
                    placeholder="WVCS Office"
                  />
                </Field>
              </div>
              <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white">Parents / Guardians</div>
                  <button
                    type="button"
                    onClick={addParent}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                  >
                    <Plus size={15} />
                    Add Parent
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {getInvoiceParents(invoice).map((parent, index) => (
                    <div key={parent.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2 sm:grid-cols-[1fr_1fr_auto]">
                      <Input
                        value={parent.name}
                        onChange={(event) => updateParent(parent.id, { name: event.target.value })}
                        placeholder={index === 0 ? "Parent/guardian name" : "Additional parent/guardian"}
                      />
                      <Input
                        type="email"
                        value={parent.email}
                        onChange={(event) => updateParent(parent.id, { email: event.target.value })}
                        placeholder="parent@example.com"
                      />
                      {getInvoiceParents(invoice).length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeParent(parent.id)}
                          className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-300"
                          aria-label="Remove parent"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <label className="mt-3 grid gap-1 text-sm font-medium text-slate-200">
                Parent Note
                <textarea
                  value={invoice.note}
                  onChange={(event) => updateInvoice({ note: event.target.value })}
                  placeholder="Optional note for the family"
                  className="min-h-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
                />
              </label>
              <label className="mt-3 grid gap-1 text-sm font-medium text-slate-200">
                Discount Note
                <textarea
                  value={invoice.paymentNote}
                  onChange={(event) => updateInvoice({ paymentNote: event.target.value })}
                  placeholder="Example: Early pay discount applies when paid by check, cashier's check, or money order by August 31."
                  className="min-h-20 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-sky-400"
                />
              </label>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-white">Students</div>
                <button
                  type="button"
                  onClick={addStudent}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                >
                  <Plus size={15} />
                  Add Student
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {invoice.students.map((student) => (
                  <div key={student.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-white">{student.name || "Student"}</div>
                      <button
                        type="button"
                        onClick={() => removeStudent(student.id)}
                        className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-300"
                        aria-label="Remove student"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <Field label="Student Name">
                        <Input
                          value={student.name}
                          onChange={(event) => updateStudent(student.id, { name: event.target.value })}
                          placeholder="Student name"
                        />
                      </Field>
                      <Field label="Grade">
                        <Input value={student.grade} onChange={(event) => updateStudent(student.id, { grade: event.target.value })} placeholder="8th" />
                      </Field>
                      <Field label="Tuition">
                        <MoneyInput value={student.tuition} onChange={(event) => updateStudent(student.id, { tuition: event.target.value })} />
                      </Field>
                      <Field label="Comprehensive Fee">
                        <MoneyInput value={student.comprehensiveFee} onChange={(event) => updateStudent(student.id, { comprehensiveFee: event.target.value })} />
                      </Field>
                    </div>
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-white">Discounts</div>
                        <button
                          type="button"
                          onClick={() => addStudentDiscount(student.id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                        >
                          <Plus size={15} />
                          Add Discount
                        </button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {getStudentDiscounts(student).map((discount) => (
                          <div key={discount.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2 sm:grid-cols-[1fr_1fr_120px_auto]">
                            <select
                              value={discount.label}
                              onChange={(event) =>
                                updateStudentDiscount(student.id, discount.id, {
                                  label: event.target.value,
                                  customLabel: event.target.value === "Manual" ? discount.customLabel : "",
                                })
                              }
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                            >
                              {DISCOUNT_OPTIONS.map((option) => (
                                <option key={option} value={option}>
                                  {option}
                                </option>
                              ))}
                              <option value="Manual">Manual</option>
                            </select>
                            <Input
                              value={discount.customLabel}
                              onChange={(event) => updateStudentDiscount(student.id, discount.id, { customLabel: event.target.value })}
                              placeholder="Custom discount name"
                              disabled={discount.label !== "Manual"}
                              className={discount.label !== "Manual" ? "opacity-50" : ""}
                            />
                            <MoneyInput
                              value={discount.amount}
                              onChange={(event) => updateStudentDiscount(student.id, discount.id, { amount: event.target.value })}
                            />
                            <button
                              type="button"
                              onClick={() => removeStudentDiscount(student.id, discount.id)}
                              className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-300"
                              aria-label="Remove discount"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ))}
                        {!getStudentDiscounts(student).length && (
                          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-500">
                            No discounts added for this student.
                          </div>
                        )}
                      </div>
                    </div>
                    <label className="mt-3 grid gap-1 text-sm font-medium text-slate-200">
                      Fee Note
                      <Input
                        value={student.feeNote}
                        onChange={(event) => updateStudent(student.id, { feeNote: event.target.value })}
                        placeholder="Includes consumable materials, field trips, retreats, and yearbooks."
                      />
                    </label>
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200">
                      <div className="flex items-center justify-between gap-3">
                        <span>Automatic 5% Early Pay Discount</span>
                        <span className="text-emerald-300">-{formatCurrency(studentEarlyPayDiscount(student))}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-3 border-t border-slate-800 pt-2">
                        <span>Student Total</span>
                        <span>{formatCurrency(studentTotal(student))}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-sm font-bold text-white">Invoice Preview</div>
                  <div className="mt-1 text-xs text-slate-400">Current total: {formatCurrency(totals.grandTotal)}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadPdf}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                  >
                    <Download size={16} />
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={printInvoice}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <Printer size={16} />
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={sendInvoiceEmail}
                    disabled={sendingEmail}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                  >
                    <Mail size={16} />
                    {sendingEmail ? "Sending..." : "Send Email"}
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-auto rounded-lg bg-slate-800 p-4">
              <div className="mx-auto w-[8.5in] max-w-full">
                <InvoicePreview invoice={invoice} invoiceRef={invoiceRef} />
              </div>
            </div>
          </div>
        </div>
        )}

        {activeView === "incidentals" && (
          <div className="mt-6 grid gap-6 xl:grid-cols-[520px_1fr]">
            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Calculator size={16} className="text-sky-300" />
                  Incidental Invoice Details
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Field label="Family Name">
                    <Input value={incidentalInvoice.familyName} onChange={(event) => updateIncidentalInvoice({ familyName: event.target.value })} />
                  </Field>
                  <Field label="Parent Name">
                    <Input value={incidentalInvoice.parentName} onChange={(event) => updateIncidentalInvoice({ parentName: event.target.value })} />
                  </Field>
                  <Field label="Parent Email">
                    <Input type="email" value={incidentalInvoice.parentEmail} onChange={(event) => updateIncidentalInvoice({ parentEmail: event.target.value })} />
                  </Field>
                  <Field label="Invoice Date">
                    <Input type="date" value={incidentalInvoice.invoiceDate} onChange={(event) => updateIncidentalInvoice({ invoiceDate: event.target.value })} />
                  </Field>
                  <Field label="Due Date">
                    <Input type="date" value={incidentalInvoice.dueDate} onChange={(event) => updateIncidentalInvoice({ dueDate: event.target.value })} />
                  </Field>
                </div>
                <label className="mt-3 grid gap-1 text-sm font-medium text-slate-200">
                  Parent Note
                  <textarea
                    value={incidentalInvoice.note}
                    onChange={(event) => updateIncidentalInvoice({ note: event.target.value })}
                    className="min-h-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                  />
                </label>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-white">Charges</div>
                  <button
                    type="button"
                    onClick={addCharge}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                  >
                    <Plus size={15} />
                    Add Charge
                  </button>
                </div>
                <div className="mt-4 space-y-3">
                  {incidentalInvoice.charges.map((charge) => (
                    <div key={charge.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[1fr_140px_auto]">
                      <Input
                        value={charge.description}
                        onChange={(event) => updateCharge(charge.id, { description: event.target.value })}
                        placeholder="Description, such as lunch balance or activity fee"
                      />
                      <MoneyInput value={charge.amount} onChange={(event) => updateCharge(charge.id, { amount: event.target.value })} />
                      <button
                        type="button"
                        onClick={() => removeCharge(charge.id)}
                        className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-300"
                        aria-label="Remove charge"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="text-sm font-bold text-white">Incidental Billing Setup</div>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                This is now separated from tuition breakdowns. The next step is to connect this area to the payment method you want families to use for incidental charges, then send a payment invoice from here.
              </p>
              <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Current Draft Total</div>
                <div className="mt-2 text-3xl font-bold text-white">
                  {formatCurrency(incidentalInvoice.charges.reduce((total, charge) => total + money(charge.amount), 0))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
