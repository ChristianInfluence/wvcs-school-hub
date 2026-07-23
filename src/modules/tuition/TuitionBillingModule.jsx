import { useMemo, useRef, useState } from "react";
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

const today = new Date().toISOString().slice(0, 10);

const defaultInvoice = {
  schoolYear: "2026-2027",
  familyName: "Example Family",
  parentName: "Parent/Guardian Name",
  parentEmail: "",
  invoiceDate: today,
  dueDate: "",
  preparedBy: "WVCS Office",
  note:
    "Thank you for partnering with Willamette Valley Christian School. Please contact the school office with any questions about this tuition breakdown.",
  paymentNote: "Early pay discount applies when paid by check, cashier's check, or money order by August 31.",
  registrationFee: "250.00",
  students: [
    {
      id: "student-1",
      name: "Student One",
      grade: "8th",
      tuition: "8155.00",
      newStudentDiscount: "2038.75",
      earlyPayDiscount: "305.81",
      comprehensiveFee: "450.00",
      feeNote: "Includes consumable materials, field trips, retreats, and yearbooks.",
    },
    {
      id: "student-2",
      name: "Student Two",
      grade: "9th",
      tuition: "8630.00",
      newStudentDiscount: "2157.50",
      earlyPayDiscount: "323.63",
      comprehensiveFee: "450.00",
      feeNote: "Includes consumable materials, field trips, retreats, and yearbooks.",
    },
  ],
  incidentals: [
    {
      id: "incidental-1",
      description: "",
      amount: "",
    },
  ],
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

function studentTotal(student) {
  return (
    money(student.tuition) -
    money(student.newStudentDiscount) -
    money(student.earlyPayDiscount) +
    money(student.comprehensiveFee)
  );
}

function invoiceTotals(invoice) {
  const studentSubtotal = invoice.students.reduce((total, student) => total + studentTotal(student), 0);
  const incidentalTotal = invoice.incidentals.reduce((total, item) => total + money(item.amount), 0);
  const registrationFee = money(invoice.registrationFee);
  return {
    studentSubtotal,
    incidentalTotal,
    registrationFee,
    grandTotal: studentSubtotal + incidentalTotal + registrationFee,
  };
}

function invoiceTitle(invoice) {
  const family = invoice.familyName?.trim() || "Family";
  const schoolYear = invoice.schoolYear?.trim() || "School Year";
  return `${family} ${schoolYear} Tuition Breakdown`;
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
      className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 ${props.className || ""}`}
    />
  );
}

function MoneyInput(props) {
  return <Input inputMode="decimal" placeholder="0.00" {...props} />;
}

function InvoicePreview({ invoice, invoiceRef }) {
  const totals = invoiceTotals(invoice);
  const activeIncidentals = invoice.incidentals.filter((item) => item.description || money(item.amount));

  return (
    <div ref={invoiceRef} className="tuition-invoice bg-white p-10 text-slate-950 shadow-xl">
      <div className="flex items-start justify-between gap-8 border-b border-slate-200 pb-6">
        <div>
          <div className="text-xs font-bold uppercase text-sky-700">Willamette Valley Christian School</div>
          <h1 className="mt-2 text-3xl font-bold text-slate-950">{invoiceTitle(invoice)}</h1>
          <div className="mt-3 text-sm text-slate-600">
            <div>{invoice.parentName || "Parent/Guardian"}</div>
            {invoice.parentEmail && <div>{invoice.parentEmail}</div>}
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
                <div className="flex justify-between gap-4 text-emerald-700">
                  <span>New Student Discount</span>
                  <span className="font-semibold">-{formatCurrency(student.newStudentDiscount)}</span>
                </div>
                <div className="flex justify-between gap-4 text-emerald-700">
                  <span>Early Pay Discount</span>
                  <span className="font-semibold">-{formatCurrency(student.earlyPayDiscount)}</span>
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
              <span>Registration Fee</span>
              <span className="font-semibold">{formatCurrency(invoice.registrationFee)}</span>
            </div>
            {activeIncidentals.map((item) => (
              <div key={`${item.id}-preview`} className="flex justify-between gap-4">
                <span>{item.description || "Incidental charge"}</span>
                <span className="font-semibold">{formatCurrency(item.amount)}</span>
              </div>
            ))}
            {activeIncidentals.length > 0 && (
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-2 text-slate-600">
                <span>Incidentals subtotal</span>
                <span className="font-semibold">{formatCurrency(totals.incidentalTotal)}</span>
              </div>
            )}
            <div className="mt-4 flex items-center justify-between gap-4 border-t-2 border-slate-900 pt-4 text-xl font-bold">
              <span>Total Amount</span>
              <span>{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-8 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
        {invoice.note}
      </div>

      <div className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-500">
        Willamette Valley Christian School | 9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236 | wvcs.org
      </div>
    </div>
  );
}

export default function TuitionBillingModule() {
  const [invoice, setInvoice] = useState(defaultInvoice);
  const [status, setStatus] = useState("");
  const invoiceRef = useRef(null);
  const totals = useMemo(() => invoiceTotals(invoice), [invoice]);

  function updateInvoice(patch) {
    setInvoice((current) => ({ ...current, ...patch }));
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
      students: [
        ...current.students,
        {
          id: uid("student"),
          name: "",
          grade: "",
          tuition: "",
          newStudentDiscount: "",
          earlyPayDiscount: "",
          comprehensiveFee: "450.00",
          feeNote: "Includes consumable materials, field trips, retreats, and yearbooks.",
        },
      ],
    }));
  }

  function removeStudent(studentId) {
    setInvoice((current) => ({
      ...current,
      students: current.students.length > 1 ? current.students.filter((student) => student.id !== studentId) : current.students,
    }));
  }

  function updateIncidental(itemId, patch) {
    setInvoice((current) => ({
      ...current,
      incidentals: current.incidentals.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    }));
  }

  function addIncidental() {
    setInvoice((current) => ({
      ...current,
      incidentals: [...current.incidentals, { id: uid("incidental"), description: "", amount: "" }],
    }));
  }

  function removeIncidental(itemId) {
    setInvoice((current) => ({
      ...current,
      incidentals: current.incidentals.length > 1 ? current.incidentals.filter((item) => item.id !== itemId) : current.incidentals,
    }));
  }

  function resetInvoice() {
    setInvoice({
      ...defaultInvoice,
      invoiceDate: today,
      students: defaultInvoice.students.map((student) => ({ ...student })),
      incidentals: defaultInvoice.incidentals.map((item) => ({ ...item })),
    });
    setStatus("Started a fresh invoice draft.");
  }

  async function downloadPdf() {
    if (!invoiceRef.current) return;
    setStatus("Preparing PDF...");
    const html2pdf = (await import("html2pdf.js")).default;
    await html2pdf()
      .set({
        margin: 0.25,
        filename: `${invoiceTitle(invoice).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
      })
      .from(invoiceRef.current)
      .save();
    setStatus("PDF downloaded.");
  }

  function printInvoice() {
    window.print();
  }

  function prepareEmail() {
    const subject = encodeURIComponent(invoiceTitle(invoice));
    const body = encodeURIComponent(
      [
        `Hello ${invoice.parentName || "Parent/Guardian"},`,
        "",
        `Attached is your ${invoice.schoolYear || ""} tuition breakdown from Willamette Valley Christian School.`,
        `Total amount: ${formatCurrency(totals.grandTotal)}`,
        "",
        "Please contact the school office with any questions.",
        "",
        "Willamette Valley Christian School",
        "503-393-5236",
      ].join("\n")
    );
    window.location.href = `mailto:${invoice.parentEmail || ""}?subject=${subject}&body=${body}`;
    setStatus("Email draft opened. Attach the downloaded PDF before sending.");
  }

  function saveDraft() {
    localStorage.setItem("wvcs-tuition-invoice-draft", JSON.stringify(invoice));
    setStatus("Invoice draft saved on this device.");
  }

  function loadDraft() {
    try {
      const saved = localStorage.getItem("wvcs-tuition-invoice-draft");
      if (!saved) {
        setStatus("No saved draft was found on this device.");
        return;
      }
      setInvoice(JSON.parse(saved));
      setStatus("Saved draft loaded.");
    } catch (error) {
      setStatus(`Unable to load saved draft: ${error.message}`);
    }
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
            <h1 className="mt-2 text-2xl font-bold text-white">Tuition & Billing</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Build a professional tuition breakdown, include student-specific discounts and fees, add incidental charges, then print or export a PDF for parents.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={saveDraft}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              <Save size={16} />
              Save Draft
            </button>
            <button
              type="button"
              onClick={loadDraft}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Load Draft
            </button>
            <button
              type="button"
              onClick={resetInvoice}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              New Invoice
            </button>
          </div>
        </div>

        {status && (
          <div className="mt-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100">
            {status}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-[520px_1fr]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-white">
                <Calculator size={16} className="text-sky-300" />
                Invoice Details
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Field label="Family Name">
                  <Input value={invoice.familyName} onChange={(event) => updateInvoice({ familyName: event.target.value })} />
                </Field>
                <Field label="School Year">
                  <Input value={invoice.schoolYear} onChange={(event) => updateInvoice({ schoolYear: event.target.value })} />
                </Field>
                <Field label="Parent Name">
                  <Input value={invoice.parentName} onChange={(event) => updateInvoice({ parentName: event.target.value })} />
                </Field>
                <Field label="Parent Email">
                  <Input type="email" value={invoice.parentEmail} onChange={(event) => updateInvoice({ parentEmail: event.target.value })} />
                </Field>
                <Field label="Invoice Date">
                  <Input type="date" value={invoice.invoiceDate} onChange={(event) => updateInvoice({ invoiceDate: event.target.value })} />
                </Field>
                <Field label="Due Date">
                  <Input type="date" value={invoice.dueDate} onChange={(event) => updateInvoice({ dueDate: event.target.value })} />
                </Field>
                <Field label="Registration Fee">
                  <MoneyInput value={invoice.registrationFee} onChange={(event) => updateInvoice({ registrationFee: event.target.value })} />
                </Field>
                <Field label="Prepared By">
                  <Input value={invoice.preparedBy} onChange={(event) => updateInvoice({ preparedBy: event.target.value })} />
                </Field>
              </div>
              <label className="mt-3 grid gap-1 text-sm font-medium text-slate-200">
                Parent Note
                <textarea
                  value={invoice.note}
                  onChange={(event) => updateInvoice({ note: event.target.value })}
                  className="min-h-24 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
              </label>
              <label className="mt-3 grid gap-1 text-sm font-medium text-slate-200">
                Discount Note
                <textarea
                  value={invoice.paymentNote}
                  onChange={(event) => updateInvoice({ paymentNote: event.target.value })}
                  className="min-h-20 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
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
                        <Input value={student.name} onChange={(event) => updateStudent(student.id, { name: event.target.value })} />
                      </Field>
                      <Field label="Grade">
                        <Input value={student.grade} onChange={(event) => updateStudent(student.id, { grade: event.target.value })} />
                      </Field>
                      <Field label="Tuition">
                        <MoneyInput value={student.tuition} onChange={(event) => updateStudent(student.id, { tuition: event.target.value })} />
                      </Field>
                      <Field label="New Student Discount">
                        <MoneyInput value={student.newStudentDiscount} onChange={(event) => updateStudent(student.id, { newStudentDiscount: event.target.value })} />
                      </Field>
                      <Field label="Early Pay Discount">
                        <MoneyInput value={student.earlyPayDiscount} onChange={(event) => updateStudent(student.id, { earlyPayDiscount: event.target.value })} />
                      </Field>
                      <Field label="Comprehensive Fee">
                        <MoneyInput value={student.comprehensiveFee} onChange={(event) => updateStudent(student.id, { comprehensiveFee: event.target.value })} />
                      </Field>
                    </div>
                    <label className="mt-3 grid gap-1 text-sm font-medium text-slate-200">
                      Fee Note
                      <Input value={student.feeNote} onChange={(event) => updateStudent(student.id, { feeNote: event.target.value })} />
                    </label>
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200">
                      Student Total: {formatCurrency(studentTotal(student))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-white">Incidentals</div>
                <button
                  type="button"
                  onClick={addIncidental}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                >
                  <Plus size={15} />
                  Add Charge
                </button>
              </div>
              <div className="mt-4 space-y-3">
                {invoice.incidentals.map((item) => (
                  <div key={item.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 sm:grid-cols-[1fr_140px_auto]">
                    <Input
                      value={item.description}
                      onChange={(event) => updateIncidental(item.id, { description: event.target.value })}
                      placeholder="Description, such as lunch balance or activity fee"
                    />
                    <MoneyInput value={item.amount} onChange={(event) => updateIncidental(item.id, { amount: event.target.value })} />
                    <button
                      type="button"
                      onClick={() => removeIncidental(item.id)}
                      className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-300"
                      aria-label="Remove incidental"
                    >
                      <Trash2 size={15} />
                    </button>
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
                    onClick={prepareEmail}
                    className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20"
                  >
                    <Mail size={16} />
                    Email Parent
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
      </div>
    </section>
  );
}
