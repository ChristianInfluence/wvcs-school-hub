import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Mail,
  Plus,
  Printer,
  ReceiptText,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import {
  deleteIncidentalInvoice,
  deleteTuitionInvoice,
  createIncidentalCheckoutSession,
  fetchIncidentalInvoiceByToken,
  fetchIncidentalInvoices,
  fetchOfficeFamilyDirectory,
  fetchTuitionInvoices,
  saveIncidentalInvoice,
  saveTuitionInvoice,
  sendIncidentalInvoiceEmail,
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
  id: "",
  publicToken: "",
  familyKey: "",
  familyName: "",
  parentName: "",
  parentEmail: "",
  parents: [],
  studentIds: [],
  students: [],
  invoiceDate: today,
  dueDate: "",
  status: "Draft",
  paymentStatus: "Unpaid",
  paymentUrl: "",
  paidAt: "",
  paidInOffice: false,
  paymentMethod: "",
  checkNumber: "",
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

function incidentalTotal(invoice) {
  return (invoice.charges || []).reduce((total, charge) => total + money(charge.amount), 0);
}

function incidentalTitle(invoice) {
  const family = invoice.familyName?.trim() || "Family";
  return `${family} Incidental Invoice`;
}

function getIncidentalParents(invoice) {
  if (Array.isArray(invoice.parents) && invoice.parents.length) return invoice.parents;
  return [
    {
      name: invoice.parentName || "",
      email: invoice.parentEmail || "",
    },
  ].filter((parent) => parent.name || parent.email);
}

function getIncidentalRecipients(invoice) {
  return [...new Set(getIncidentalParents(invoice).map((parent) => String(parent.email || "").trim().toLowerCase()).filter(Boolean))];
}

function getIncidentalStudentSummary(invoice) {
  const students = Array.isArray(invoice.students) ? invoice.students : [];
  if (!students.length) return "";
  return students.map((student) => `${student.name}${student.grade ? ` (${student.grade})` : ""}`).join(", ");
}

function getRecordInvoice(record) {
  return {
    ...defaultIncidentalInvoice,
    ...(record.invoice || {}),
    id: record.id || record.invoice?.id || "",
    publicToken: record.publicToken || record.invoice?.publicToken || "",
    familyKey: record.familyKey || record.invoice?.familyKey || "",
    familyName: record.familyName || record.invoice?.familyName || "",
    studentIds: record.studentIds || record.invoice?.studentIds || [],
    status: record.status || record.invoice?.status || "Draft",
    paymentStatus: record.paymentStatus || record.invoice?.paymentStatus || "Unpaid",
    paymentUrl: record.paymentUrl || record.invoice?.paymentUrl || "",
    sentAt: record.sentAt || record.invoice?.sentAt || "",
    sentTo: record.sentTo || record.invoice?.sentTo || [],
    paidAt: record.paidAt || record.invoice?.paidAt || "",
    paidInOffice: Boolean(record.paidInOffice || record.invoice?.paidInOffice),
    paymentMethod: record.paymentMethod || record.invoice?.paymentMethod || "",
    checkNumber: record.checkNumber || record.invoice?.checkNumber || "",
  };
}

function getReceivableTotals(records) {
  return records.reduce(
    (totals, record) => {
      const invoice = getRecordInvoice(record);
      const total = incidentalTotal(invoice);
      totals.total += total;
      if (invoice.paymentStatus === "Paid") totals.paid += total;
      else if (invoice.paymentStatus !== "Voided") totals.open += total;
      return totals;
    },
    { total: 0, open: 0, paid: 0 }
  );
}

function familyMatchesSearch(family, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    family.familyName,
    ...(family.parents || []).flatMap((parent) => [parent.name, parent.email]),
    ...(family.students || []).flatMap((student) => [student.name, student.grade]),
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function recordMatchesSearch(record, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const invoice = getRecordInvoice(record);
  return [
    invoice.familyName,
    invoice.parentName,
    invoice.parentEmail,
    invoice.status,
    invoice.paymentStatus,
    invoice.paymentMethod,
    invoice.checkNumber,
    getIncidentalStudentSummary(invoice),
    ...(invoice.charges || []).map((charge) => charge.description),
  ]
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function getIncidentalPortalUrl(invoice) {
  if (!invoice.publicToken) return "";
  return `${window.location.origin}${window.location.pathname}#/incidental-pay/${encodeURIComponent(invoice.publicToken)}`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildIncidentalReceiptDocument(invoice) {
  const total = incidentalTotal(invoice);
  const paidDate = invoice.paidAt ? formatDate(String(invoice.paidAt).slice(0, 10)) : formatDate(today);
  const method = invoice.paymentMethod ? invoice.paymentMethod.charAt(0).toUpperCase() + invoice.paymentMethod.slice(1) : "Payment";
  const checkLine = invoice.paymentMethod === "check" && invoice.checkNumber ? `<div><strong>Check #:</strong> ${escapeHtml(invoice.checkNumber)}</div>` : "";
  const chargeRows = (invoice.charges || [])
    .map(
      (charge) => `
        <tr>
          <td>${escapeHtml(charge.description || "Incidental charge")}</td>
          <td class="amount">${escapeHtml(formatCurrency(charge.amount))}</td>
        </tr>
      `
    )
    .join("");

  return `
    <!doctype html>
    <html>
      <head>
        <title>${escapeHtml(invoice.familyName || "Incidental")} Receipt</title>
        <style>
          @page { size: letter portrait; margin: 0.5in; }
          body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
          .receipt { max-width: 7.2in; margin: 0 auto; }
          .header { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #0f172a; padding-bottom: 18px; }
          .school { font-size: 11px; font-weight: 800; letter-spacing: .08em; color: #0369a1; text-transform: uppercase; }
          h1 { margin: 8px 0 0; font-size: 28px; }
          .meta { border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; min-width: 210px; font-size: 13px; line-height: 1.7; background: #f8fafc; }
          table { width: 100%; border-collapse: collapse; margin-top: 24px; font-size: 13px; }
          th { background: #f1f5f9; text-align: left; color: #334155; }
          th, td { border: 1px solid #cbd5e1; padding: 10px 12px; }
          .amount { text-align: right; font-weight: 700; }
          .total { margin-top: 18px; display: flex; justify-content: flex-end; font-size: 18px; font-weight: 800; }
          .paid { margin-top: 20px; border-radius: 8px; background: #ecfdf5; color: #047857; padding: 14px; font-weight: 800; }
          .footer { margin-top: 28px; border-top: 1px solid #cbd5e1; padding-top: 12px; font-size: 11px; color: #64748b; }
        </style>
      </head>
      <body>
        <main class="receipt">
          <section class="header">
            <div>
              <div class="school">Willamette Valley Christian School</div>
              <h1>Payment Receipt</h1>
              <p>${escapeHtml(invoice.familyName || "Family")}</p>
              ${getIncidentalStudentSummary(invoice) ? `<p>${escapeHtml(getIncidentalStudentSummary(invoice))}</p>` : ""}
            </div>
            <div class="meta">
              <div><strong>Date Paid:</strong> ${escapeHtml(paidDate)}</div>
              <div><strong>Method:</strong> ${escapeHtml(method)}</div>
              ${checkLine}
              <div><strong>Receipt Total:</strong> ${escapeHtml(formatCurrency(total))}</div>
            </div>
          </section>
          <div class="paid">Paid in full: ${escapeHtml(formatCurrency(total))}</div>
          <table>
            <thead><tr><th>Description</th><th class="amount">Amount</th></tr></thead>
            <tbody>${chargeRows}</tbody>
          </table>
          <div class="total">Total Paid: ${escapeHtml(formatCurrency(total))}</div>
          <div class="footer">Willamette Valley Christian School | 9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236 | wvcs.org</div>
        </main>
      </body>
    </html>
  `;
}

function buildTuitionInvoiceDocument(invoice) {
  const totals = invoiceTotals(invoice);
  const parents = getInvoiceParents(invoice);
  const parentEmails = parents.map((parent) => parent.email).filter(Boolean);
  const studentCards = invoice.students
    .map((student) => {
      const discountRows = getStudentDiscounts(student)
        .filter((discount) => money(discount.amount))
        .map(
          (discount) => `
            <div class="line discount">
              <span>${escapeHtml(getDiscountLabel(discount))}</span>
              <strong>-${escapeHtml(formatCurrency(discount.amount))}</strong>
            </div>
          `
        )
        .join("");
      return `
        <section class="card student-card">
          <div class="card-head">
            <h2>${escapeHtml(student.name || "Student")}${student.grade ? ` - ${escapeHtml(student.grade)}` : ""}</h2>
            <strong>${escapeHtml(formatCurrency(studentTotal(student)))}</strong>
          </div>
          <div class="card-body">
            <div class="line">
              <span>Tuition</span>
              <strong>${escapeHtml(formatCurrency(student.tuition))}</strong>
            </div>
            ${discountRows}
            <div class="line discount">
              <span>5% Early Pay Discount</span>
              <strong>-${escapeHtml(formatCurrency(studentEarlyPayDiscount(student)))}</strong>
            </div>
            <div class="line">
              <span>Comprehensive Fees${student.feeNote ? ` <small>(${escapeHtml(student.feeNote)})</small>` : ""}</span>
              <strong>${escapeHtml(formatCurrency(student.comprehensiveFee))}</strong>
            </div>
            ${invoice.paymentNote ? `<p class="note-line">${escapeHtml(invoice.paymentNote)}</p>` : ""}
          </div>
        </section>
      `;
    })
    .join("");

  const totalRows = invoice.students
    .map(
      (student) => `
        <div class="line">
          <span>${escapeHtml(student.name || "Student")} tuition total</span>
          <strong>${escapeHtml(formatCurrency(studentTotal(student)))}</strong>
        </div>
      `
    )
    .join("");

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(invoiceTitle(invoice))}</title>
    <style>
      @page { size: letter portrait; margin: 0.16in; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #ffffff; color: #0f172a; font-family: Arial, Helvetica, sans-serif; }
      body { width: 8.5in; min-height: 11in; }
      .invoice-print-page {
        width: 7.95in;
        min-height: 10.5in;
        margin: 0 auto;
        padding: 0.3in 0.28in;
        background: #ffffff;
        color: #0f172a;
        font-size: 11.75px;
        line-height: 1.35;
      }
      .top { display: flex; justify-content: space-between; gap: 0.32in; border-bottom: 1px solid #cbd5e1; padding-bottom: 0.16in; }
      .brand { display: flex; gap: 0.15in; align-items: flex-start; }
      .brand img { width: 0.68in; height: 0.68in; object-fit: contain; }
      .eyebrow { color: #0369a1; font-size: 9.75px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
      h1 { margin: 0.045in 0 0; font-size: 24px; line-height: 1.08; color: #020617; }
      h2 { margin: 0; font-size: 14.5px; color: #020617; }
      .parent { margin-top: 0.08in; color: #475569; font-size: 11.25px; }
      .meta { min-width: 2.0in; border: 1px solid #e2e8f0; border-radius: 7px; background: #f8fafc; padding: 0.12in; }
      .meta-row { display: flex; justify-content: space-between; gap: 0.14in; margin-bottom: 0.05in; }
      .meta-row:last-child { margin-bottom: 0; }
      .meta-row span:first-child { color: #64748b; font-weight: 700; }
      .cards { margin-top: 0.19in; }
      .card { border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; break-inside: avoid; page-break-inside: avoid; margin-bottom: 0.16in; }
      .card-head { display: flex; justify-content: space-between; gap: 0.22in; align-items: center; background: #f8fafc; border-bottom: 1px solid #e2e8f0; padding: 0.09in 0.13in; }
      .card-body { padding: 0.12in 0.13in; }
      .line { display: flex; justify-content: space-between; gap: 0.2in; margin-bottom: 0.052in; }
      .line:last-child { margin-bottom: 0; }
      .line strong { white-space: nowrap; }
      .discount { color: #047857; }
      small { color: #64748b; font-size: 9.5px; }
      .note-line { margin: 0.09in 0 0; color: #64748b; font-size: 10px; }
      .paid { color: #047857; font-size: 9.5px; font-weight: 800; margin-left: 0.07in; }
      .strike { color: #64748b; text-decoration: line-through; }
      .grand { border-top: 2px solid #020617; margin-top: 0.1in; padding-top: 0.1in; font-size: 16.5px; font-weight: 800; }
      .family-note { margin-top: 0.16in; border-radius: 8px; background: #f8fafc; padding: 0.12in 0.13in; color: #475569; }
      .footer { margin-top: 0.18in; border-top: 1px solid #cbd5e1; padding-top: 0.1in; color: #64748b; font-size: 10px; }
      @media print {
        html, body { width: 8.5in; height: 11in; overflow: hidden; }
        .invoice-print-page { margin: 0 auto; }
      }
    </style>
  </head>
  <body>
    <main class="invoice-print-page">
      <header class="top">
        <div class="brand">
          <img src="${warriorHeadNew}" alt="Willamette Valley Christian School">
          <div>
            <div class="eyebrow">Willamette Valley Christian School</div>
            <h1>${escapeHtml(invoiceTitle(invoice))}</h1>
            <div class="parent">
              <div>${escapeHtml(getParentDisplayName(invoice))}</div>
              ${parentEmails.map((email) => `<div>${escapeHtml(email)}</div>`).join("")}
            </div>
          </div>
        </div>
        <div class="meta">
          <div class="meta-row"><span>Invoice Date</span><strong>${escapeHtml(formatDate(invoice.invoiceDate) || "Not set")}</strong></div>
          <div class="meta-row"><span>Due Date</span><strong>${escapeHtml(formatDate(invoice.dueDate) || "Not set")}</strong></div>
          <div class="meta-row"><span>Prepared By</span><strong>${escapeHtml(invoice.preparedBy || "WVCS Office")}</strong></div>
        </div>
      </header>
      <section class="cards">
        ${studentCards}
        <section class="card total-card">
          <div class="card-head"><h2>Total for the ${escapeHtml(invoice.schoolYear || "School")} Year</h2></div>
          <div class="card-body">
            ${totalRows}
            <div class="line">
              <span>Registration Fee${invoice.registrationFeePaid ? '<span class="paid">Already paid</span>' : ""}</span>
              <strong>${invoice.registrationFeePaid ? `<span class="strike">${escapeHtml(formatCurrency(invoice.registrationFee))}</span> <span class="paid">$0 due</span>` : escapeHtml(formatCurrency(invoice.registrationFee))}</strong>
            </div>
            <div class="line grand">
              <span>Total Amount</span>
              <strong>${escapeHtml(formatCurrency(totals.grandTotal))}</strong>
            </div>
          </div>
        </section>
      </section>
      ${invoice.note ? `<div class="family-note">${escapeHtml(invoice.note)}</div>` : ""}
      <footer class="footer">Willamette Valley Christian School | 9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236 | wvcs.org</footer>
    </main>
  </body>
</html>`;
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

function IncidentalInvoicePreview({ invoice, publicView = false, onStartPayment, paymentBusy = false }) {
  const total = incidentalTotal(invoice);
  const portalUrl = !publicView ? getIncidentalPortalUrl(invoice) : "";
  const payUrl = invoice.paymentUrl || "";
  const paymentReady = Boolean(payUrl || publicView || portalUrl);

  return (
    <div className="bg-white p-8 text-slate-950 shadow-xl">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <img src={warriorHeadNew} alt="Willamette Valley Christian School" className="h-14 w-14 object-contain" />
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.12em] text-sky-700">Willamette Valley Christian School</div>
            <h1 className="mt-2 text-2xl font-bold text-slate-950">{incidentalTitle(invoice)}</h1>
            <div className="mt-3 text-sm leading-6 text-slate-600">
              <div>{invoice.parentName || "Parent/Guardian"}</div>
              {invoice.parentEmail && <div>{invoice.parentEmail}</div>}
              {getIncidentalStudentSummary(invoice) && <div>{getIncidentalStudentSummary(invoice)}</div>}
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
            <span className="font-semibold text-slate-500">Payment</span>
            <span>{invoice.paymentStatus || "Unpaid"}</span>
          </div>
        </div>
      </div>

      <section className="mt-6 overflow-hidden rounded-lg border border-slate-200">
        <div className="grid grid-cols-[1fr_140px] bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700">
          <div>Description</div>
          <div className="text-right">Amount</div>
        </div>
        {(invoice.charges || []).map((charge) => (
          <div key={charge.id} className="grid grid-cols-[1fr_140px] border-t border-slate-200 px-5 py-3 text-sm">
            <div>{charge.description || "Charge description"}</div>
            <div className="text-right font-semibold">{formatCurrency(charge.amount)}</div>
          </div>
        ))}
        <div className="grid grid-cols-[1fr_140px] border-t-2 border-slate-900 px-5 py-4 text-lg font-bold">
          <div>Total Due</div>
          <div className="text-right">{formatCurrency(total)}</div>
        </div>
      </section>

      {invoice.note && (
        <div className="mt-6 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
          {invoice.note}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-sky-200 bg-sky-50 p-4">
        <div className="text-sm font-bold text-slate-950">Payment Portal</div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {invoice.paymentStatus === "Paid"
            ? "Thank you. This invoice is marked paid."
            : paymentReady
            ? "Use the secure payment button below to pay this incidental invoice."
            : "Online payment processing is being prepared. Please contact the school office for payment instructions."}
        </p>
        {invoice.paymentStatus === "Paid" ? (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-white px-4 py-3 text-sm font-bold text-emerald-700">
            Paid
          </div>
        ) : payUrl ? (
          <a
            href={payUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
          >
            <CreditCard size={16} />
            Pay Securely
          </a>
        ) : portalUrl ? (
          <a
            href={portalUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500"
          >
            <CreditCard size={16} />
            Open Payment Portal
          </a>
        ) : publicView ? (
          <button
            type="button"
            onClick={onStartPayment}
            disabled={paymentBusy}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CreditCard size={16} />
            {paymentBusy ? "Opening..." : "Pay Securely"}
          </button>
        ) : (
          <div className="mt-4 rounded-lg border border-sky-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            Payment link not connected yet
          </div>
        )}
        {!publicView && portalUrl && (
          <div className="mt-3 break-all text-xs text-slate-500">{portalUrl}</div>
        )}
      </div>

      <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">
        Willamette Valley Christian School | 9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236 | wvcs.org
      </div>
    </div>
  );
}

export function IncidentalPaymentPortalPage({ token = "" }) {
  const [state, setState] = useState({ loading: true, invoice: null, error: "" });
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadInvoice() {
      try {
        const result = await fetchIncidentalInvoiceByToken(token);
        if (!active) return;
        if (!result.found) {
          setState({ loading: false, invoice: null, error: "This invoice link could not be found." });
          return;
        }
        const invoice = {
          ...defaultIncidentalInvoice,
          ...(result.invoice?.invoice || {}),
          id: result.invoice?.id || "",
          publicToken: result.invoice?.publicToken || token,
          status: result.invoice?.status || "Sent",
          paymentStatus: result.invoice?.paymentStatus || "Unpaid",
          paymentUrl: result.invoice?.paymentUrl || result.invoice?.invoice?.paymentUrl || "",
          sentAt: result.invoice?.sentAt || "",
          paidAt: result.invoice?.paidAt || "",
        };
        setState({ loading: false, invoice, error: "" });
      } catch (error) {
        if (active) setState({ loading: false, invoice: null, error: `Unable to load invoice: ${error.message}` });
      }
    }
    loadInvoice();
    return () => {
      active = false;
    };
  }, [token]);

  async function startStripePayment() {
    setPaymentBusy(true);
    setPaymentMessage("Opening secure checkout...");
    try {
      const result = await createIncidentalCheckoutSession(token);
      if (!result.created || !result.url) throw new Error(result.reason || result.error || "Stripe checkout could not be opened.");
      window.location.href = result.url;
    } catch (error) {
      setPaymentMessage(`Unable to open checkout: ${error.message}`);
      setPaymentBusy(false);
    }
  }

  if (state.loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-slate-100">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">
          Loading invoice...
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-5 text-slate-100">
        <div className="w-full max-w-lg rounded-lg border border-slate-800 bg-slate-900 p-6 text-center">
          <img src={warriorHeadNew} alt="WVCS Warrior" className="mx-auto h-14 w-14 object-contain" />
          <h1 className="mt-4 text-xl font-bold text-white">Invoice Not Available</h1>
          <p className="mt-3 text-sm leading-6 text-slate-400">{state.error}</p>
          <a href="https://wvcs.org" className="mt-5 inline-flex rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100">
            Return to WVCS
          </a>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-6 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">WVCS Payment Portal</div>
          <h1 className="mt-2 text-2xl font-bold text-white">Incidental Invoice</h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Review the invoice below, then use the secure payment button if online payment is available.
          </p>
          {paymentMessage && (
            <div className="mt-3 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
              {paymentMessage}
            </div>
          )}
        </div>
        <IncidentalInvoicePreview
          invoice={state.invoice}
          publicView
          onStartPayment={startStripePayment}
          paymentBusy={paymentBusy}
        />
      </div>
    </main>
  );
}

export default function TuitionBillingModule({ currentUserEmail = "" }) {
  const [activeView, setActiveView] = useState("tuition");
  const [invoice, setInvoice] = useState(defaultInvoice);
  const [incidentalInvoice, setIncidentalInvoice] = useState(defaultIncidentalInvoice);
  const [incidentalWorkspaceView, setIncidentalWorkspaceView] = useState("invoice");
  const [familyDirectory, setFamilyDirectory] = useState([]);
  const [familySearch, setFamilySearch] = useState("");
  const [familyDirectoryStatus, setFamilyDirectoryStatus] = useState("Loading family roster...");
  const [receivablesSearch, setReceivablesSearch] = useState("");
  const [receivablesStatusFilter, setReceivablesStatusFilter] = useState("open");
  const [savedInvoices, setSavedInvoices] = useState([]);
  const [savedIncidentalInvoices, setSavedIncidentalInvoices] = useState([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState("");
  const [selectedIncidentalInvoiceId, setSelectedIncidentalInvoiceId] = useState("");
  const [status, setStatus] = useState("");
  const [savedStatus, setSavedStatus] = useState("Loading saved invoices...");
  const [incidentalStatus, setIncidentalStatus] = useState("Loading incidental invoices...");
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendingIncidentalEmail, setSendingIncidentalEmail] = useState(false);
  const invoiceRef = useRef(null);
  const totals = useMemo(() => invoiceTotals(invoice), [invoice]);
  const groupedSavedInvoices = useMemo(() => groupInvoicesByYear(savedInvoices), [savedInvoices]);
  const incidentalDraftTotal = useMemo(() => incidentalTotal(incidentalInvoice), [incidentalInvoice]);
  const familySearchResults = useMemo(
    () => familyDirectory.filter((family) => familyMatchesSearch(family, familySearch)).slice(0, 10),
    [familyDirectory, familySearch]
  );
  const filteredReceivables = useMemo(
    () =>
      savedIncidentalInvoices
        .filter((record) => {
          const invoice = getRecordInvoice(record);
          if (receivablesStatusFilter === "open") return invoice.paymentStatus !== "Paid" && invoice.paymentStatus !== "Voided";
          if (receivablesStatusFilter === "paid") return invoice.paymentStatus === "Paid";
          if (receivablesStatusFilter === "voided") return invoice.paymentStatus === "Voided";
          return true;
        })
        .filter((record) => recordMatchesSearch(record, receivablesSearch)),
    [savedIncidentalInvoices, receivablesSearch, receivablesStatusFilter]
  );
  const receivableTotals = useMemo(() => getReceivableTotals(savedIncidentalInvoices), [savedIncidentalInvoices]);

  async function loadSavedInvoices() {
    try {
      const result = await fetchTuitionInvoices();
      setSavedInvoices(result.invoices || []);
      setSavedStatus(result.loaded ? "Saved invoices loaded." : result.reason || "Showing local saved invoices.");
    } catch (error) {
      setSavedStatus(`Unable to load saved invoices: ${error.message}`);
    }
  }

  async function loadSavedIncidentalInvoices() {
    try {
      const result = await fetchIncidentalInvoices();
      setSavedIncidentalInvoices(result.invoices || []);
      setIncidentalStatus(result.loaded ? "Incidental invoices loaded." : result.reason || "Showing local incidental invoices.");
    } catch (error) {
      setIncidentalStatus(`Unable to load incidental invoices: ${error.message}`);
    }
  }

  async function loadFamilyDirectory() {
    try {
      const result = await fetchOfficeFamilyDirectory();
      setFamilyDirectory(result.families || []);
      setFamilyDirectoryStatus(result.loaded ? "Family roster loaded." : result.reason || "Family roster unavailable.");
    } catch (error) {
      setFamilyDirectoryStatus(`Unable to load family roster: ${error.message}`);
    }
  }

  useEffect(() => {
    loadSavedInvoices();
    loadSavedIncidentalInvoices();
    loadFamilyDirectory();
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
    const html2pdf = (await import("html2pdf.js")).default;
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-10000px";
    host.style.top = "0";
    host.style.width = "8.5in";
    host.style.background = "#ffffff";
    host.innerHTML = buildTuitionInvoiceDocument(invoice);
    document.body.appendChild(host);
    try {
      const page = host.querySelector(".invoice-print-page");
      const worker = html2pdf()
        .set({
          margin: [0.16, 0.275, 0.16, 0.275],
          filename: getInvoiceFileName(invoice),
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 816 },
          pagebreak: { mode: ["css", "legacy"], avoid: [".student-card", ".total-card"] },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait", compress: true },
        })
        .from(page)
        .toPdf();
      const pdf = await worker.get("pdf");
      return pdf.output("blob");
    } finally {
      host.remove();
    }
  }

  async function downloadPdf() {
    try {
      setStatus("Preparing PDF...");
      const blob = await createInvoicePdfBlob();
      if (!blob) throw new Error("Unable to create invoice PDF.");
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = getInvoiceFileName(invoice);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("PDF downloaded.");
    } catch (error) {
      setStatus(`Unable to download PDF: ${error.message}`);
    }
  }

  function printInvoice() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("Unable to open print window. Check your popup settings and try again.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildTuitionInvoiceDocument(invoice));
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
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

  async function saveCurrentIncidentalInvoice(patch = {}) {
    return saveCurrentIncidentalInvoiceFor(
      {
        ...incidentalInvoice,
        id: incidentalInvoice.id || selectedIncidentalInvoiceId || "",
      },
      patch
    );
  }

  async function saveIncidentalDraft() {
    try {
      const saved = await saveCurrentIncidentalInvoice({ status: incidentalInvoice.status || "Draft" });
      setStatus(`${saved.familyName || "Incidental invoice"} saved.`);
    } catch (error) {
      setStatus(`Unable to save incidental invoice: ${error.message}`);
    }
  }

  function loadIncidentalRecord(record) {
    setIncidentalInvoice(getRecordInvoice(record));
    setSelectedIncidentalInvoiceId(record.id);
    setIncidentalWorkspaceView("invoice");
    setStatus(`Loaded ${record.familyName || "incidental invoice"}.`);
  }

  function selectIncidentalFamily(family) {
    const primaryParent = family.parents?.find((parent) => parent.email) || family.parents?.[0] || { name: "", email: "" };
    setIncidentalInvoice((current) => ({
      ...current,
      familyKey: family.familyKey,
      familyName: family.familyName,
      parentName: primaryParent.name,
      parentEmail: primaryParent.email,
      parents: family.parents || [],
      studentIds: (family.students || []).map((student) => student.studentId).filter(Boolean),
      students: family.students || [],
    }));
    setFamilySearch(family.familyName);
    setStatus(`Attached incidental invoice to ${family.familyName}.`);
  }

  function startManualReceivableEntry() {
    setIncidentalInvoice({
      ...defaultIncidentalInvoice,
      id: "",
      publicToken: "",
      invoiceDate: today,
      status: "Manual Entry",
      paymentStatus: "Unpaid",
      note: "Manual accounts receivable entry.",
      charges: [{ id: uid("charge"), description: "", amount: "" }],
    });
    setSelectedIncidentalInvoiceId("");
    setIncidentalWorkspaceView("invoice");
    setStatus("Started a manual accounts receivable entry.");
  }

  async function removeSavedIncidentalInvoice(record) {
    const confirmed = window.confirm(`Delete the incidental invoice for ${record.familyName || "this family"}?`);
    if (!confirmed) return;
    try {
      await deleteIncidentalInvoice(record.id);
      setSavedIncidentalInvoices((current) => current.filter((item) => item.id !== record.id));
      if (selectedIncidentalInvoiceId === record.id) {
        resetIncidentalInvoice();
      }
      setStatus("Incidental invoice deleted.");
    } catch (error) {
      setStatus(`Unable to delete incidental invoice: ${error.message}`);
    }
  }

  function resetIncidentalInvoice() {
    setIncidentalInvoice({
      ...defaultIncidentalInvoice,
      id: "",
      publicToken: "",
      invoiceDate: today,
      charges: defaultIncidentalInvoice.charges.map((charge) => ({ ...charge })),
    });
    setSelectedIncidentalInvoiceId("");
    setStatus("Started a fresh incidental invoice.");
  }

  async function copyIncidentalPortalLink() {
    try {
      const saved = incidentalInvoice.publicToken
        ? { invoice: { ...incidentalInvoice } }
        : await saveCurrentIncidentalInvoice({ status: incidentalInvoice.status || "Draft" });
      const portalInvoice = saved.invoice?.invoice || saved.invoice || incidentalInvoice;
      const url = getIncidentalPortalUrl(portalInvoice);
      await navigator.clipboard.writeText(url);
      setStatus("Payment portal link copied.");
    } catch (error) {
      setStatus(`Unable to copy payment portal link: ${error.message}`);
    }
  }

  async function sendIncidentalEmail() {
    const recipients = getIncidentalRecipients(incidentalInvoice);
    if (!recipients.length) {
      setStatus("Select a family or enter at least one parent email before sending.");
      return;
    }
    setSendingIncidentalEmail(true);
    setStatus("Saving and sending incidental invoice email...");
    try {
      const savedRecord = await saveCurrentIncidentalInvoice({
        status: "Sent",
        sentAt: new Date().toISOString(),
        sentTo: recipients,
      });
      const savedInvoice = {
        ...savedRecord.invoice,
        id: savedRecord.id,
        publicToken: savedRecord.publicToken,
        paymentUrl: savedRecord.paymentUrl || savedRecord.invoice?.paymentUrl || "",
      };
      const result = await sendIncidentalInvoiceEmail({
        invoice: savedInvoice,
        total: incidentalTotal(savedInvoice),
        portalUrl: getIncidentalPortalUrl(savedInvoice),
        recipients,
      });
      setStatus(result.sent ? `Incidental invoice sent to ${recipients.join(", ")}.` : result.reason || "Email was not sent.");
    } catch (error) {
      setStatus(`Unable to send incidental invoice: ${error.message}`);
    } finally {
      setSendingIncidentalEmail(false);
    }
  }

  function updateIncidentalInvoice(patch) {
    setIncidentalInvoice((current) => ({ ...current, ...patch }));
  }

  async function markIncidentalPaidInOffice(recordOrInvoice = incidentalInvoice) {
    const invoiceToPay = recordOrInvoice.invoice ? getRecordInvoice(recordOrInvoice) : recordOrInvoice;
    if (!invoiceToPay.paymentMethod) {
      setStatus("Select cash, card, or check before marking paid in office.");
      return;
    }
    if (invoiceToPay.paymentMethod === "check" && !String(invoiceToPay.checkNumber || "").trim()) {
      setStatus("Enter the check number before marking a check payment paid.");
      return;
    }

    try {
      const paidAt = invoiceToPay.paidAt || new Date().toISOString();
      const record = await saveCurrentIncidentalInvoiceFor(invoiceToPay, {
        status: invoiceToPay.status === "Draft" ? "Saved" : invoiceToPay.status,
        paymentStatus: "Paid",
        paidAt,
        paidInOffice: true,
        paymentMethod: invoiceToPay.paymentMethod,
        checkNumber: invoiceToPay.paymentMethod === "check" ? invoiceToPay.checkNumber : "",
      });
      setStatus(`${record.familyName || "Incidental invoice"} marked paid in office.`);
    } catch (error) {
      setStatus(`Unable to mark paid in office: ${error.message}`);
    }
  }

  async function saveCurrentIncidentalInvoiceFor(baseInvoice, patch = {}) {
    const invoiceId = baseInvoice.id || crypto.randomUUID();
    const publicToken = baseInvoice.publicToken || crypto.randomUUID().replaceAll("-", "");
    const nextInvoice = {
      ...baseInvoice,
      ...patch,
      id: invoiceId,
      publicToken,
      status: patch.status || baseInvoice.status || "Draft",
      paymentStatus: patch.paymentStatus || baseInvoice.paymentStatus || "Unpaid",
      sentAt: patch.sentAt || baseInvoice.sentAt || "",
      sentTo: patch.sentTo || baseInvoice.sentTo || [],
      paidAt: patch.paidAt || baseInvoice.paidAt || "",
      paidInOffice: patch.paidInOffice ?? baseInvoice.paidInOffice ?? false,
      paymentMethod: patch.paymentMethod ?? baseInvoice.paymentMethod ?? "",
      checkNumber: patch.checkNumber ?? baseInvoice.checkNumber ?? "",
    };
    const record = {
      id: invoiceId,
      publicToken,
      familyKey: nextInvoice.familyKey || "",
      studentIds: nextInvoice.studentIds || [],
      invoice: nextInvoice,
      status: nextInvoice.status,
      paymentStatus: nextInvoice.paymentStatus,
      paymentUrl: nextInvoice.paymentUrl || "",
      sentAt: nextInvoice.sentAt || "",
      sentTo: nextInvoice.sentTo || [],
      paidAt: nextInvoice.paidAt || "",
      paidInOffice: nextInvoice.paidInOffice,
      paymentMethod: nextInvoice.paymentMethod,
      checkNumber: nextInvoice.checkNumber,
    };
    const result = await saveIncidentalInvoice(record, currentUserEmail);
    const savedInvoice = getRecordInvoice(result.invoice);
    setIncidentalInvoice(savedInvoice);
    setSelectedIncidentalInvoiceId(result.invoice.id);
    setSavedIncidentalInvoices((current) => [result.invoice, ...current.filter((item) => item.id !== result.invoice.id)]);
    setIncidentalStatus(result.local ? "Incidental invoice saved on this device." : "Incidental invoice saved.");
    return result.invoice;
  }

  function printIncidentalReceipt(recordOrInvoice = incidentalInvoice) {
    const receiptInvoice = recordOrInvoice.invoice ? getRecordInvoice(recordOrInvoice) : recordOrInvoice;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("Unable to open receipt print window. Check popup settings and try again.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildIncidentalReceiptDocument(receiptInvoice));
    printWindow.document.close();
    printWindow.focus();
    printWindow.setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 300);
  }

  async function exportIncidentalReceipt(recordOrInvoice = incidentalInvoice) {
    const receiptInvoice = recordOrInvoice.invoice ? getRecordInvoice(recordOrInvoice) : recordOrInvoice;
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      const host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-10000px";
      host.innerHTML = buildIncidentalReceiptDocument(receiptInvoice);
      document.body.appendChild(host);
      const filename = `${(receiptInvoice.familyName || "incidental").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-receipt.pdf`;
      await html2pdf()
        .set({
          margin: 0.5,
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
          jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
        })
        .from(host.querySelector(".receipt"))
        .save();
      host.remove();
      setStatus("Receipt exported.");
    } catch (error) {
      setStatus(`Unable to export receipt: ${error.message}`);
    }
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
        .tuition-invoice-pdf {
          width: 7.5in !important;
          padding: 0.3in !important;
          box-shadow: none !important;
          font-size: 11px !important;
          line-height: 1.25 !important;
        }
        .tuition-invoice-pdf h1 {
          font-size: 22px !important;
          line-height: 1.15 !important;
        }
        .tuition-invoice-pdf h2 {
          font-size: 15px !important;
        }
        .tuition-invoice-pdf .mt-8 {
          margin-top: 1rem !important;
        }
        .tuition-invoice-pdf .space-y-8 > :not([hidden]) ~ :not([hidden]) {
          margin-top: 1rem !important;
        }
        .tuition-invoice-pdf .p-5 {
          padding: 0.75rem !important;
        }
        .tuition-invoice-pdf .px-5 {
          padding-left: 0.75rem !important;
          padding-right: 0.75rem !important;
        }
        .tuition-invoice-pdf .py-3 {
          padding-top: 0.45rem !important;
          padding-bottom: 0.45rem !important;
        }
        .tuition-invoice-pdf img {
          width: 0.55in !important;
          height: 0.55in !important;
        }
        @page {
          size: letter portrait;
          margin: 0.22in;
        }
        @media print {
          html, body {
            width: 8.5in;
            min-height: 11in;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          body * { visibility: hidden; }
          .tuition-invoice, .tuition-invoice * { visibility: visible; }
          .tuition-invoice {
            position: absolute;
            left: 0;
            top: 0;
            width: 7.55in !important;
            min-height: auto !important;
            padding: 0.3in !important;
            box-shadow: none !important;
            font-size: 11px !important;
            line-height: 1.25 !important;
            page-break-after: avoid;
            break-after: avoid;
          }
          .tuition-invoice h1 {
            font-size: 22px !important;
            line-height: 1.15 !important;
          }
          .tuition-invoice h2 {
            font-size: 15px !important;
          }
          .tuition-invoice .mt-8 {
            margin-top: 1rem !important;
          }
          .tuition-invoice .space-y-8 > :not([hidden]) ~ :not([hidden]) {
            margin-top: 1rem !important;
          }
          .tuition-invoice .p-5 {
            padding: 0.75rem !important;
          }
          .tuition-invoice .px-5 {
            padding-left: 0.75rem !important;
            padding-right: 0.75rem !important;
          }
          .tuition-invoice .py-3 {
            padding-top: 0.45rem !important;
            padding-bottom: 0.45rem !important;
          }
          .tuition-invoice img {
            width: 0.55in !important;
            height: 0.55in !important;
          }
        }
      `}</style>
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
              <ReceiptText size={15} />
              Office Manager and Finance
            </div>
            <h1 className="mt-2 text-2xl font-bold text-white">Office & Finance</h1>
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
        <div className="mt-6 grid gap-4 xl:grid-cols-[220px_430px_minmax(760px,1fr)]">
          <div className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-3">
              <div className="grid gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-white">Saved Invoices</div>
                  <div className="mt-1 truncate text-xs text-slate-500">{savedStatus}</div>
                </div>
                <button
                  type="button"
                  onClick={loadSavedInvoices}
                  className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="max-h-[860px] overflow-auto p-2">
              {Object.entries(groupedSavedInvoices).map(([year, records]) => (
                <div key={year} className="mb-3">
                  <div className="sticky top-0 z-10 rounded-md bg-slate-800 px-2 py-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-300">
                    {year}
                  </div>
                  <div className="mt-2 space-y-2">
                    {records.map((record) => (
                      <div
                        key={record.id}
                        className={`rounded-lg border p-2 ${
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
                                {formatShortDate(record.updatedAt) || "Recent"}
                              </div>
                            </div>
                            <span
                              className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
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
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            onClick={() => loadInvoiceRecord(record)}
                            className="flex-1 rounded-lg border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
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
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-400">
                  Saved invoices will appear here by year and family.
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
                <Field label="Prepared By">
                  <Input
                    value={invoice.preparedBy}
                    onChange={(event) => updateInvoice({ preparedBy: event.target.value })}
                    placeholder="WVCS Office"
                  />
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Registration Fee">
                    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                      <MoneyInput value={invoice.registrationFee} onChange={(event) => updateInvoice({ registrationFee: event.target.value })} />
                      <label className="flex min-h-10 items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-300">
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
                </div>
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
              <button
                type="button"
                onClick={saveDraft}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
              >
                <Save size={16} />
                Save Invoice
              </button>
            </div>

          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="text-sm font-bold text-white">Invoice Preview</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={downloadPdf}
                    className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                  >
                    <Download size={16} />
                    Download PDF
                  </button>
                  <button
                    type="button"
                    onClick={printInvoice}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <Printer size={16} />
                    Print
                  </button>
                  <button
                    type="button"
                    onClick={sendInvoiceEmail}
                    disabled={sendingEmail}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                  >
                    <Mail size={16} />
                    {sendingEmail ? "Sending..." : "Send Email"}
                  </button>
                </div>
                <div className="basis-full text-xs text-slate-400">Current total: {formatCurrency(totals.grandTotal)}</div>
              </div>
            </div>
            <div className="overflow-hidden rounded-lg bg-slate-800 p-3">
              <div className="mx-auto w-[8.5in] max-w-full">
                <InvoicePreview invoice={invoice} invoiceRef={invoiceRef} />
              </div>
            </div>
          </div>
        </div>
        )}

        {activeView === "incidentals" && (
          <>
          <div className="mt-5 flex flex-wrap gap-2 rounded-lg border border-slate-800 bg-slate-900 p-2">
            {[
              ["invoice", "Create / Send Invoice", ReceiptText],
              ["receivables", "Accounts Receivable", Calculator],
            ].map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setIncidentalWorkspaceView(id)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                  incidentalWorkspaceView === id
                    ? "border-sky-400 bg-sky-500 text-white"
                    : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
                }`}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>

          {incidentalWorkspaceView === "invoice" && (
          <div className="mt-6 grid gap-4 xl:grid-cols-[240px_480px_minmax(640px,1fr)]">
            <div className="rounded-lg border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 p-3">
                <div className="text-sm font-bold text-white">Saved Incidentals</div>
                <div className="mt-1 text-xs text-slate-500">{incidentalStatus}</div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={loadSavedIncidentalInvoices}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    <RefreshCw size={13} />
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={resetIncidentalInvoice}
                    className="rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                  >
                    New
                  </button>
                </div>
              </div>
              <div className="max-h-[820px] overflow-auto p-2">
                {savedIncidentalInvoices.map((record) => (
                  <div
                    key={record.id}
                    className={`mb-2 rounded-lg border p-2 ${
                      selectedIncidentalInvoiceId === record.id
                        ? "border-sky-400 bg-sky-500/10"
                        : "border-slate-800 bg-slate-950"
                    }`}
                  >
                    <button type="button" onClick={() => loadIncidentalRecord(record)} className="w-full text-left">
                      <div className="truncate text-sm font-bold text-white">{record.familyName || "Unnamed Family"}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        <span className="rounded-full border border-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">
                          {record.status || "Draft"}
                        </span>
                        <span
                          className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${
                            record.paymentStatus === "Paid"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                          }`}
                        >
                          {record.paymentStatus || "Unpaid"}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{formatShortDate(record.updatedAt) || "Recent"}</div>
                    </button>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() => loadIncidentalRecord(record)}
                        className="flex-1 rounded-lg border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSavedIncidentalInvoice(record)}
                        className="rounded-lg border border-rose-500/40 px-2.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
                {!savedIncidentalInvoices.length && (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-3 text-xs leading-5 text-slate-400">
                    Saved incidental invoices will appear here.
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Calculator size={16} className="text-sky-300" />
                  Incidental Invoice Details
                </div>
                <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">Attach to Family Roster</div>
                      <div className="mt-1 text-xs text-slate-500">{familyDirectoryStatus}</div>
                    </div>
                    <button
                      type="button"
                      onClick={loadFamilyDirectory}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                    >
                      <RefreshCw size={13} />
                      Refresh
                    </button>
                  </div>
                  <label className="relative mt-3 block">
                    <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-500" />
                    <Input
                      value={familySearch}
                      onChange={(event) => setFamilySearch(event.target.value)}
                      placeholder="Type family, parent email, student name, or grade"
                      className="pl-9"
                    />
                  </label>
                  {familySearchResults.length > 0 && (
                    <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-800 bg-slate-900">
                      {familySearchResults.map((family) => (
                        <button
                          key={family.familyKey}
                          type="button"
                          onClick={() => selectIncidentalFamily(family)}
                          className="block w-full border-b border-slate-800 px-3 py-2 text-left last:border-b-0 hover:bg-slate-800"
                        >
                          <div className="text-sm font-bold text-white">{family.familyName}</div>
                          <div className="mt-1 text-xs text-slate-400">
                            {(family.students || []).map((student) => `${student.name}${student.grade ? ` (${student.grade})` : ""}`).join(", ")}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {(family.parents || []).map((parent) => parent.email || parent.name).filter(Boolean).join(" | ")}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {incidentalInvoice.familyKey && (
                    <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">
                      Attached to {incidentalInvoice.familyName}: {getIncidentalStudentSummary(incidentalInvoice) || "family roster"}
                    </div>
                  )}
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
                  {getIncidentalParents(incidentalInvoice).length > 1 && (
                    <div className="sm:col-span-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                      Recipients: {getIncidentalRecipients(incidentalInvoice).join(", ")}
                    </div>
                  )}
                  <Field label="Invoice Date">
                    <Input type="date" value={incidentalInvoice.invoiceDate} onChange={(event) => updateIncidentalInvoice({ invoiceDate: event.target.value })} />
                  </Field>
                  <Field label="Due Date">
                    <Input type="date" value={incidentalInvoice.dueDate} onChange={(event) => updateIncidentalInvoice({ dueDate: event.target.value })} />
                  </Field>
                  <Field label="Payment Status">
                    <select
                      value={incidentalInvoice.paymentStatus || "Unpaid"}
                      onChange={(event) => updateIncidentalInvoice({ paymentStatus: event.target.value })}
                      className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                    >
                      <option>Unpaid</option>
                      <option>Pending</option>
                      <option>Paid</option>
                      <option>Voided</option>
                    </select>
                  </Field>
                  <div className="sm:col-span-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                      <CheckCircle2 size={16} className="text-emerald-300" />
                      Paid in Office
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                      <Field label="Date Paid">
                        <Input
                          type="date"
                          value={incidentalInvoice.paidAt ? String(incidentalInvoice.paidAt).slice(0, 10) : today}
                          onChange={(event) =>
                            updateIncidentalInvoice({
                              paidAt: event.target.value ? new Date(`${event.target.value}T12:00:00`).toISOString() : "",
                            })
                          }
                        />
                      </Field>
                      <Field label="Method">
                        <select
                          value={incidentalInvoice.paymentMethod || ""}
                          onChange={(event) =>
                            updateIncidentalInvoice({
                              paymentMethod: event.target.value,
                              checkNumber: event.target.value === "check" ? incidentalInvoice.checkNumber : "",
                            })
                          }
                          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                        >
                          <option value="">Select method</option>
                          <option value="cash">Cash</option>
                          <option value="card">Card</option>
                          <option value="check">Check</option>
                        </select>
                      </Field>
                      <Field label="Check Number">
                        <Input
                          value={incidentalInvoice.checkNumber || ""}
                          onChange={(event) => updateIncidentalInvoice({ checkNumber: event.target.value })}
                          placeholder="Required for check"
                          disabled={incidentalInvoice.paymentMethod !== "check"}
                          className={incidentalInvoice.paymentMethod !== "check" ? "opacity-50" : ""}
                        />
                      </Field>
                      <button
                        type="button"
                        onClick={() => markIncidentalPaidInOffice()}
                        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                      >
                        <CheckCircle2 size={16} />
                        Mark Paid
                      </button>
                    </div>
                    {incidentalInvoice.paymentStatus === "Paid" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => printIncidentalReceipt()}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                        >
                          <Printer size={16} />
                          Print Receipt
                        </button>
                        <button
                          type="button"
                          onClick={() => exportIncidentalReceipt()}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20"
                        >
                          <Download size={16} />
                          Export Receipt
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <div className="text-sm font-semibold text-slate-200">Parent Payment Portal</div>
                      {incidentalInvoice.publicToken ? (
                        <div className="mt-2 break-all rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                          {getIncidentalPortalUrl(incidentalInvoice)}
                        </div>
                      ) : (
                        <div className="mt-2 rounded-lg border border-dashed border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-500">
                          Save the invoice to generate the parent payment portal link automatically.
                        </div>
                      )}
                      <p className="mt-2 text-xs leading-5 text-slate-500">
                        Families use this Hub portal link. Stripe checkout is created automatically when they click Pay Securely.
                      </p>
                    </div>
                  </div>
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

              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Payment Portal</div>
                    <div className="mt-1 text-xs text-slate-500">Save once to generate the parent-facing link.</div>
                  </div>
                  <div className="text-right text-lg font-bold text-white">{formatCurrency(incidentalDraftTotal)}</div>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={saveIncidentalDraft}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                  >
                    <Save size={16} />
                    Save Invoice
                  </button>
                  <button
                    type="button"
                    onClick={copyIncidentalPortalLink}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <Copy size={16} />
                    Copy Portal Link
                  </button>
                  <button
                    type="button"
                    onClick={sendIncidentalEmail}
                    disabled={sendingIncidentalEmail}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Mail size={16} />
                    {sendingIncidentalEmail ? "Sending..." : "Send Email"}
                  </button>
                </div>
                {incidentalInvoice.publicToken && (
                  <a
                    href={getIncidentalPortalUrl(incidentalInvoice)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-sky-300 hover:text-sky-200"
                  >
                    <ExternalLink size={14} />
                    Open parent payment portal
                  </a>
                )}
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Send or copy the Hub portal link. Families click Pay Securely there, and Stripe Checkout opens automatically.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-white">Live Preview</div>
                    <div className="mt-1 text-xs text-slate-500">This is the parent-facing invoice layout.</div>
                  </div>
                  <button
                    type="button"
                    onClick={saveIncidentalDraft}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-1.5 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                  >
                    <Save size={16} />
                    Save
                  </button>
                </div>
              </div>
              <div className="overflow-hidden rounded-lg bg-slate-800 p-3">
                <div className="mx-auto max-w-[8.5in]">
                  <IncidentalInvoicePreview invoice={incidentalInvoice} />
                </div>
              </div>
            </div>
          </div>
          )}
          {incidentalWorkspaceView === "receivables" && (
            <div className="mt-6 space-y-4">
              <div className="grid gap-3 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Open AR</div>
                  <div className="mt-2 text-2xl font-bold text-white">{formatCurrency(receivableTotals.open)}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Paid</div>
                  <div className="mt-2 text-2xl font-bold text-emerald-200">{formatCurrency(receivableTotals.paid)}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">All Incidentals</div>
                  <div className="mt-2 text-2xl font-bold text-white">{formatCurrency(receivableTotals.total)}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Records</div>
                  <div className="mt-2 text-2xl font-bold text-white">{filteredReceivables.length}</div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto_auto] lg:items-center">
                  <label className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-2.5 text-slate-500" />
                    <Input
                      value={receivablesSearch}
                      onChange={(event) => setReceivablesSearch(event.target.value)}
                      placeholder="Search family, student, charge, payment method, or check number"
                      className="pl-9"
                    />
                  </label>
                  <select
                    value={receivablesStatusFilter}
                    onChange={(event) => setReceivablesStatusFilter(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                  >
                    <option value="open">Open only</option>
                    <option value="paid">Paid only</option>
                    <option value="voided">Voided only</option>
                    <option value="all">All records</option>
                  </select>
                  <button
                    type="button"
                    onClick={startManualReceivableEntry}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                  >
                    <Plus size={16} />
                    Manual Entry
                  </button>
                  <button
                    type="button"
                    onClick={loadSavedIncidentalInvoices}
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                  >
                    <RefreshCw size={16} />
                    Refresh
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
                <div className="grid grid-cols-[1.4fr_1fr_120px_150px_190px] gap-3 border-b border-slate-800 bg-slate-950 px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  <div>Family / Students</div>
                  <div>Charges</div>
                  <div className="text-right">Total</div>
                  <div>Status</div>
                  <div>Actions</div>
                </div>
                <div className="max-h-[720px] overflow-auto">
                  {filteredReceivables.map((record) => {
                    const recordInvoice = getRecordInvoice(record);
                    return (
                      <div key={record.id} className="grid grid-cols-[1.4fr_1fr_120px_150px_190px] gap-3 border-b border-slate-800 px-4 py-3 text-sm last:border-b-0">
                        <div>
                          <div className="font-bold text-white">{recordInvoice.familyName || "Unnamed Family"}</div>
                          <div className="mt-1 text-xs leading-5 text-slate-500">{getIncidentalStudentSummary(recordInvoice) || "No roster students attached"}</div>
                          {recordInvoice.paidAt && <div className="mt-1 text-xs text-emerald-300">Paid {formatShortDate(recordInvoice.paidAt)}</div>}
                        </div>
                        <div className="text-slate-300">
                          {(recordInvoice.charges || []).slice(0, 2).map((charge) => (
                            <div key={charge.id || charge.description} className="truncate">{charge.description || "Charge"}</div>
                          ))}
                          {(recordInvoice.charges || []).length > 2 && <div className="text-xs text-slate-500">+{recordInvoice.charges.length - 2} more</div>}
                        </div>
                        <div className="text-right font-bold text-white">{formatCurrency(incidentalTotal(recordInvoice))}</div>
                        <div>
                          <div className={`inline-flex rounded-full border px-2 py-1 text-xs font-bold ${
                            recordInvoice.paymentStatus === "Paid"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-200"
                              : "border-amber-500/40 bg-amber-500/10 text-amber-200"
                          }`}>
                            {recordInvoice.paymentStatus || "Unpaid"}
                          </div>
                          {recordInvoice.paymentMethod && (
                            <div className="mt-2 text-xs text-slate-500">
                              {recordInvoice.paymentMethod}{recordInvoice.checkNumber ? ` #${recordInvoice.checkNumber}` : ""}
                            </div>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <button
                            type="button"
                            onClick={() => loadIncidentalRecord(record)}
                            className="rounded-lg border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                          >
                            Open
                          </button>
                          {recordInvoice.paymentStatus === "Paid" ? (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => printIncidentalReceipt(record)}
                                className="rounded-lg border border-slate-700 px-2 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                              >
                                Print
                              </button>
                              <button
                                type="button"
                                onClick={() => exportIncidentalReceipt(record)}
                                className="rounded-lg border border-emerald-500/40 px-2 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/10"
                              >
                                Receipt
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setIncidentalInvoice(recordInvoice);
                                setSelectedIncidentalInvoiceId(record.id);
                                setIncidentalWorkspaceView("invoice");
                              }}
                              className="rounded-lg border border-emerald-500/40 px-2 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/10"
                            >
                              Record Payment
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {!filteredReceivables.length && (
                    <div className="p-6 text-sm text-slate-500">No incidental receivables match this search.</div>
                  )}
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </div>
    </section>
  );
}
