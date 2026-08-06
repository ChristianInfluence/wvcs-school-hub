import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, FileSignature, Mail, Plus, Printer, RefreshCw, Save, Send, Trash2, UserCheck } from "lucide-react";
import {
  calculateStaffCompensation,
  currency,
  DEFAULT_STAFF_CONTRACT,
  DEFAULT_WORK_DAY_BREAKDOWN,
  deleteStaffContract,
  fetchStaffContracts,
  formatHours,
  saveStaffContract,
  staffContractAction,
  STAFF_CONTRACT_ADMIN_EMAIL,
} from "../../lib/staffContractsData.js";

const conditionItems = [
  "The teacher affirms that, as part of the qualifications for this position, he/she is a born again Christian who knows the Lord Jesus Christ as Savior.",
  "The teacher gives testimony that teaching in this Christian school is God's direction.",
  "The teacher will manifest by precept and example the highest Christian virtue and personal decorum, serving as a Christian role model both in and out of school.",
  "The teacher will faithfully attend a local church whose fundamental beliefs are in agreement with the Statement of Faith of this school.",
  "The teacher accepts without verbal or mental reservations both the Statement of Faith and the Educational Philosophy and Objectives of this school.",
  "The teacher has read the Teacher Job Description, Faculty Handbook, Student Handbook, and applicable school policies and agrees to abide by them.",
  "All state medical requirements for a teaching position must be filed with the school before the start of school.",
  "Assignment to room, grade, subject, and extracurricular duties is made at the discretion of the administrator or principal after consultation with the teacher.",
  "The teacher will strive to understand, appreciate, love, and serve the students entrusted to him/her for instruction.",
  "The teacher will maintain a classroom atmosphere conducive to learning, including maintaining a professional appearance.",
  "The teacher agrees to be present and on time for faculty devotions, remain after dismissal as required, and attend meetings and conferences called by administration.",
  "The teacher will avoid highly debatable topics that tend to divide evangelical believers.",
  "The teacher agrees to follow the Biblical pattern of Matthew 18:15-17 and Galatians 6:1, preserving confidentiality regarding pupil, parent, and school matters.",
  "The parties agree that disputes related to this agreement or employment relationship shall be settled by Biblically-based mediation and, if necessary, binding arbitration.",
  "The teacher acknowledges obligations under state law regarding child abuse reporting requirements and agrees to fulfill those obligations.",
  "Any previous written or oral agreements are merged into this agreement, which shall be interpreted under the laws of the State of Oregon.",
  "The teacher must give the board one month prior written notice of intended resignation unless a different termination date is mutually agreed upon.",
  "Where cause exists, the board may terminate this contract after written notice and opportunity to respond, unless immediate dismissal is warranted.",
  "The validity of this contract is contingent upon adequate enrollment which makes possible a cost-effective program.",
  "A teacher new to the staff will be given an orientation period of ninety days in which to prove teaching ability to the satisfaction of the administrator and school board.",
  "The teacher agrees to promptly notify the administrator if he/she cannot remain in harmony with the philosophy, standards, or administration of the school.",
];

const signerLabels = {
  admin: "Administrator",
  staff: "Staff Member",
  board: "Board Chair",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function statusTone(status) {
  if (status === "Complete") return "border-emerald-400/50 bg-emerald-500/15 text-emerald-100";
  if (status?.includes("Sent")) return "border-sky-400/50 bg-sky-500/15 text-sky-100";
  if (status?.includes("Signed")) return "border-amber-400/50 bg-amber-500/15 text-amber-100";
  return "border-slate-700 bg-slate-950 text-slate-300";
}

function signedLine(signature, fallback = "") {
  if (!signature?.name) return "Pending";
  return `${signature.name}${signature.email ? ` (${signature.email})` : fallback ? ` (${fallback})` : ""} on ${new Date(signature.signedAt || Date.now()).toLocaleDateString()}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function signatureTimestamp(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function signedSignatureHtml(signature, fallbackEmail = "") {
  if (!signature?.name) return `<span class="pending-signature">Pending</span>`;
  const email = signature.email || fallbackEmail || "";
  const timestamp = signatureTimestamp(signature.signedAt);
  return `
    <div class="script-signature">${escapeHtml(signature.name)}</div>
    <div class="signature-meta">
      Digitally signed by ${escapeHtml(signature.name)}${email ? ` (${escapeHtml(email)})` : ""}<br>
      ${timestamp ? `${escapeHtml(timestamp)} | ` : ""}${escapeHtml(signature.method || "typed electronic signature")}
    </div>
  `;
}

function makeAdminSignature(currentUserEmail = "") {
  return {
    name: "Matthew Conniry",
    email: currentUserEmail,
    role: "Administrator",
    signedAt: new Date().toISOString(),
    method: "typed electronic signature",
    signatureStyle: "script typed name",
    agreementText: "I have reviewed this staff contract packet and agree that applying my typed name records my electronic signature.",
    userAgent: navigator.userAgent || "",
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    signatureId: crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  };
}

function formatFtePercent(value) {
  const percent = Number(value || 0) * 100;
  if (!Number.isFinite(percent)) return "0";
  return percent.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function normalizedWorkDayBreakdown(contract) {
  return Array.isArray(contract.workDayBreakdown) && contract.workDayBreakdown.length
    ? contract.workDayBreakdown
    : Array.isArray(contract.compensation?.workDayBreakdown) && contract.compensation.workDayBreakdown.length
      ? contract.compensation.workDayBreakdown
      : DEFAULT_WORK_DAY_BREAKDOWN;
}

export function buildStaffContractHtml(contract) {
  const compensation = calculateStaffCompensation(contract);
  const customRows = (contract.customAdjustments || []).filter((item) => item.label || Number(item.amount));
  const workDayBreakdown = normalizedWorkDayBreakdown(contract);
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>WVCS Staff Contract - ${contract.staffName || "Staff"}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #e5e7eb; color: #111827; font-family: Arial, Helvetica, sans-serif; }
      .page { width: 8.5in; min-height: 11in; margin: 24px auto; background: white; padding: .55in .65in; box-shadow: 0 20px 50px rgba(15,23,42,.16); }
      .brand { border-bottom: 3px solid #0f172a; padding-bottom: 14px; margin-bottom: 18px; }
      .school { font-size: 18px; font-weight: 800; color: #0f172a; }
      .subtitle { color: #475569; font-size: 12px; margin-top: 4px; }
      h1 { margin: 0 0 10px; font-size: 22px; color: #0f172a; }
      h2 { margin: 18px 0 8px; font-size: 14px; color: #0f172a; text-transform: uppercase; letter-spacing: .08em; }
      p, li { font-size: 10.8px; line-height: 1.42; }
      .lead { font-size: 11.2px; }
      .fill { font-weight: 800; text-decoration: underline; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0 14px; font-size: 10.5px; }
      th { background: #f1f5f9; color: #334155; text-align: left; }
      th, td { border: 1px solid #cbd5e1; padding: 7px 8px; vertical-align: top; }
      .amount { text-align: right; font-weight: 700; }
      .total { background: #eff6ff; font-weight: 800; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      .sig { border-top: 1px solid #111827; padding-top: 5px; min-height: 42px; }
      .script-signature { font-family: "Brush Script MT", "Segoe Script", "Lucida Handwriting", cursive; font-size: 25px; line-height: 1.05; color: #111827; white-space: nowrap; }
      .signature-meta { margin-top: 3px; color: #475569; font-size: 8.8px; line-height: 1.25; }
      .pending-signature { color: #94a3b8; font-style: italic; }
      .fine { color: #475569; font-size: 9.5px; }
      .page-break { break-before: page; page-break-before: always; }
      @media print {
        body { background: white; }
        .page { margin: 0 auto; box-shadow: none; width: 8.5in; min-height: 10.8in; }
        button { display: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="brand">
        <div class="school">Willamette Valley Christian School</div>
        <div class="subtitle">9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236</div>
      </div>
      <h1>Teacher Contract</h1>
      <p class="lead">Believing that God has led in this decision, the school board of Willamette Valley Christian School has appointed <span class="fill">${contract.staffName || "________________"}</span> as ${contract.positionTitle || "teacher"} for the <span class="fill">${contract.schoolYear || "2026-2027"}</span> school year. This contract begins <span class="fill">${contract.contractStart || "__________"}</span>, and ends <span class="fill">${contract.contractEnd || "__________"}</span>, depending on satisfactory performance of assigned duties. In so doing, we recognize and affirm the ministry of teaching as a God-ordained vocation.</p>
      <p>By accepting this appointment, said teacher specifically acknowledges that this contract is for a limited duration and that all rights and privileges herein shall terminate upon the expiration date of this contract, unless voided earlier pursuant to the provisions below. No rights of tenure or presumption of continued employment are conferred or implied.</p>
      <p>Gross salary for this period of employment will be <span class="fill">${currency(compensation.annualSalary)}</span>, payable in equal monthly installments on the 30th of each month.</p>
      <h2>Paid Days and Time Off</h2>
      <table>
        <thead><tr><th>Category</th><th>Count</th><th>Dates Included</th></tr></thead>
        <tbody>
          ${workDayBreakdown.map((item) => `<tr><td>${item.category || ""}</td><td class="amount">${item.count || 0} ${item.unit || "days"}</td><td>${item.datesIncluded || ""}</td></tr>`).join("")}
        </tbody>
      </table>
      <p>Annual paid time off is prorated by FTE. At ${formatFtePercent(compensation.fte)}% FTE, this contract includes <span class="fill">${formatHours(compensation.sickHours)} hours</span> of sick/emergency time and <span class="fill">${formatHours(compensation.personalHours)} hours</span> of personal time.</p>
      <h2>Conditions of Employment</h2>
      <ol>${conditionItems.map((item) => `<li>${item}</li>`).join("")}</ol>
      <p>I have read and understand the duties, responsibilities, salary, and terms and conditions of this contract.</p>
      <div class="grid">
        <div class="sig">${signedSignatureHtml(contract.staffSignature, contract.staffEmail)}<br><strong>Teacher</strong></div>
        <div class="sig">${signedSignatureHtml(contract.adminSignature, STAFF_CONTRACT_ADMIN_EMAIL)}<br><strong>Administrator</strong></div>
      </div>
      <div style="height:22px"></div>
      <div class="sig">${signedSignatureHtml(contract.boardSignature)}<br><strong>Board Chairman</strong></div>
    </main>

    <main class="page page-break">
      <div class="brand">
        <div class="school">Willamette Valley Christian School</div>
        <div class="subtitle">Teacher Contract for ${contract.schoolYear || "2026-2027"}</div>
      </div>
      <h1>Staff Compensation Agreement</h1>
      <table>
        <tbody>
          <tr><th>Name</th><td>${contract.staffName || ""}</td><th>Email</th><td>${contract.staffEmail || ""}</td></tr>
          <tr><th>Position</th><td>${contract.positionTitle || "Teacher"}</td><th>FTE</th><td>${formatFtePercent(compensation.fte)}%</td></tr>
          <tr><th>Employment Begins</th><td>${contract.contractStart || ""}</td><th>Employment Ends</th><td>${contract.contractEnd || ""}</td></tr>
        </tbody>
      </table>
      <h2>Compensation Details</h2>
      <table>
        <tbody>
          <tr><td>Base Salary</td><td class="amount">${currency(compensation.baseSalary)}</td></tr>
          <tr><td>Full-time / Part-time Adjustment (${formatFtePercent(compensation.fte)}%)</td><td class="amount">${currency(compensation.proratedBase)}</td></tr>
          <tr><td>Loyalty years at WVCS (${contract.yearsAtWvcs || 0} x $100)</td><td class="amount">${currency(compensation.loyalty)}</td></tr>
          <tr><td>Master's Degree</td><td class="amount">${currency(compensation.masters)}</td></tr>
          <tr><td>State Certification / Endorsement</td><td class="amount">${currency(compensation.certification)}</td></tr>
          ${customRows.map((item) => `<tr><td>${item.label || "Custom adjustment"}</td><td class="amount">${currency(item.amount)}</td></tr>`).join("")}
          <tr class="total"><td>Total Annual Salary / Compensation</td><td class="amount">${currency(compensation.annualSalary)}</td></tr>
          <tr><td>Monthly Payment (12 equal payments)</td><td class="amount">${currency(compensation.monthlyPayment)}</td></tr>
        </tbody>
      </table>
      <h2>Paid Days / Leave Hours</h2>
      <table>
        <tbody>
          ${workDayBreakdown.map((item) => `<tr><td>${item.category || ""}</td><td class="amount">${item.count || 0} ${item.unit || "days"}</td><td>${item.datesIncluded || ""}</td></tr>`).join("")}
          <tr class="total"><td>Sick / Emergency Time (${formatFtePercent(compensation.fte)}% FTE)</td><td class="amount">${formatHours(compensation.sickHours)} hours</td><td>40 hours annually at 100% FTE, prorated by FTE.</td></tr>
          <tr class="total"><td>Personal Time (${formatFtePercent(compensation.fte)}% FTE)</td><td class="amount">${formatHours(compensation.personalHours)} hours</td><td>16 hours annually at 100% FTE, prorated by FTE.</td></tr>
        </tbody>
      </table>
      <h2>Method of Payment</h2>
      <p>The total annual salary shall be paid in 12 equal monthly payments, September through August. Paychecks will be issued on the 30th day of each month. Teachers not returning for the next school year will be paid their two remaining months salary on July 30 and August 30.</p>
      <h2>School Board Action</h2>
      <p>Employment authorized at WVCS School Board meeting of: <span class="fill">${contract.boardMeetingDate || "________________"}</span></p>
      <div class="grid">
        <div class="sig">${signedSignatureHtml(contract.staffSignature, contract.staffEmail)}<br><strong>Teacher's signature</strong></div>
        <div class="sig">${signedSignatureHtml(contract.boardSignature)}<br><strong>School Board Chairperson's signature</strong></div>
      </div>
      <p class="fine">Electronic signatures include typed signature name, signer role, email when available, timestamp, signature method, agreement text, and signing context stored in WVCS School Hub.</p>
      <button onclick="window.print()" style="margin-top:18px;padding:9px 14px;border:1px solid #0f172a;border-radius:8px;background:#0f172a;color:white;font-weight:800;">Print / Save PDF</button>
    </main>
  </body>
</html>`;
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput(props) {
  return <input {...props} className={`w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 ${props.className || ""}`} />;
}

function PrimaryButton({ children, className = "", ...props }) {
  return (
    <button {...props} className={`inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
      {children}
    </button>
  );
}

function MobileContractReview({ contract }) {
  const compensation = calculateStaffCompensation(contract);
  const customRows = (contract.customAdjustments || []).filter((item) => item.label || Number(item.amount));
  const workDayBreakdown = normalizedWorkDayBreakdown(contract);
  const detailRows = [
    ["Staff Member", contract.staffName || ""],
    ["Position", contract.positionTitle || "Teacher"],
    ["School Year", contract.schoolYear || "2026-2027"],
    ["Contract Dates", `${contract.contractStart || ""} - ${contract.contractEnd || ""}`],
    ["FTE", `${formatFtePercent(compensation.fte)}%`],
    ["Annual Salary", currency(compensation.annualSalary)],
    ["Monthly Payment", currency(compensation.monthlyPayment)],
  ];
  const payRows = [
    ["Base Salary", currency(compensation.baseSalary)],
    [`Prorated Base (${formatFtePercent(compensation.fte)}%)`, currency(compensation.proratedBase)],
    [`Loyalty (${contract.yearsAtWvcs || 0} x $100)`, currency(compensation.loyalty)],
    ["Master's Degree", currency(compensation.masters)],
    ["State Certification / Endorsement", currency(compensation.certification)],
    ...customRows.map((item) => [item.label || "Custom adjustment", currency(item.amount)]),
  ];
  return (
    <div className="space-y-4 md:hidden">
      <div className="rounded-lg border border-slate-200 bg-white p-4 text-slate-950">
        <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Mobile Contract Review</div>
        <h2 className="mt-1 text-xl font-black text-slate-950">Staff Contract Packet</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Review this mobile-friendly copy, then sign below. The official printable packet remains available on desktop or by using the print/save PDF button in the contract preview.
        </p>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-slate-950">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Agreement Summary</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {detailRows.map(([label, value]) => (
            <div key={label} className="grid grid-cols-[115px_1fr] gap-3 py-2 text-sm">
              <div className="font-bold text-slate-500">{label}</div>
              <div className="font-semibold text-slate-950">{value || "-"}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-slate-950">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Teacher Contract</h3>
        <p className="mt-3 text-sm leading-6 text-slate-700">
          Believing that God has led in this decision, Willamette Valley Christian School appoints {contract.staffName || "the staff member"} as {contract.positionTitle || "teacher"} for the {contract.schoolYear || "2026-2027"} school year.
        </p>
        <p className="mt-2 text-sm leading-6 text-slate-700">
          This contract is for a limited duration and does not create tenure or a presumption of continued employment beyond the contract period.
        </p>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-slate-950">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Compensation</h3>
        <div className="mt-3 divide-y divide-slate-100">
          {payRows.map(([label, value]) => (
            <div key={label} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="text-slate-600">{label}</div>
              <div className="font-black text-slate-950">{value}</div>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 bg-sky-50 px-2 py-2 text-sm">
            <div className="font-black text-sky-950">Total Annual Salary</div>
            <div className="font-black text-sky-950">{currency(compensation.annualSalary)}</div>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-slate-950">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Paid Days & Leave</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-emerald-50 p-3">
            <div className="text-xs font-bold text-emerald-700">Sick / Emergency</div>
            <div className="mt-1 text-lg font-black text-emerald-950">{formatHours(compensation.sickHours)} hrs</div>
          </div>
          <div className="rounded-lg bg-violet-50 p-3">
            <div className="text-xs font-bold text-violet-700">Personal Time</div>
            <div className="mt-1 text-lg font-black text-violet-950">{formatHours(compensation.personalHours)} hrs</div>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {workDayBreakdown.map((item, index) => (
            <div key={`${item.category}-${index}`} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm">
              <div className="font-black text-slate-950">{item.category}</div>
              <div className="mt-1 text-slate-600">{item.count || 0} {item.unit || "days"} | {item.datesIncluded || ""}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 text-slate-950">
        <h3 className="text-sm font-black uppercase tracking-[0.12em] text-slate-500">Conditions of Employment</h3>
        <ol className="mt-3 space-y-2 pl-5 text-sm leading-6 text-slate-700">
          {conditionItems.map((item) => <li key={item} className="list-decimal">{item}</li>)}
        </ol>
      </section>
    </div>
  );
}

export default function StaffContractsModule({ currentUserEmail = "", payrollContractSeed = null }) {
  const isAllowed = currentUserEmail.toLowerCase() === STAFF_CONTRACT_ADMIN_EMAIL;
  const [contracts, setContracts] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(DEFAULT_STAFF_CONTRACT);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [contractSort, setContractSort] = useState("name-asc");
  const [boardEmail, setBoardEmail] = useState("");
  const [selectedBoardIds, setSelectedBoardIds] = useState([]);
  const [contractToDelete, setContractToDelete] = useState(null);

  const compensation = useMemo(() => calculateStaffCompensation(draft), [draft]);
  const filtered = useMemo(() => {
    const searched = contracts.filter((contract) => `${contract.staffName} ${contract.schoolYear} ${contract.status}`.toLowerCase().includes(search.toLowerCase()));
    return [...searched].sort((a, b) => {
      if (contractSort === "name-desc") return String(b.staffName || "").localeCompare(String(a.staffName || ""));
      if (contractSort === "year-desc") return String(b.schoolYear || "").localeCompare(String(a.schoolYear || "")) || String(a.staffName || "").localeCompare(String(b.staffName || ""));
      if (contractSort === "year-asc") return String(a.schoolYear || "").localeCompare(String(b.schoolYear || "")) || String(a.staffName || "").localeCompare(String(b.staffName || ""));
      if (contractSort === "status") return String(a.status || "").localeCompare(String(b.status || "")) || String(a.staffName || "").localeCompare(String(b.staffName || ""));
      if (contractSort === "updated") return new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime();
      return String(a.staffName || "").localeCompare(String(b.staffName || ""));
    });
  }, [contracts, contractSort, search]);
  const boardReadyContracts = useMemo(
    () => contracts.filter((contract) => contract.id && contract.staffSignature?.name && !contract.boardSignature?.name),
    [contracts],
  );
  const selectedBoardContracts = useMemo(
    () => boardReadyContracts.filter((contract) => selectedBoardIds.includes(contract.id)),
    [boardReadyContracts, selectedBoardIds],
  );

  async function load() {
    if (!isAllowed) return;
    const result = await fetchStaffContracts();
    setContracts(result.contracts || []);
    if (!result.loaded) setStatus(result.reason || "Staff contract records are not available yet.");
  }

  useEffect(() => {
    load().catch((error) => setStatus(error.message));
  }, [isAllowed]);

  useEffect(() => {
    setSelectedBoardIds((ids) => ids.filter((id) => boardReadyContracts.some((contract) => contract.id === id)));
  }, [boardReadyContracts]);

  useEffect(() => {
    if (!payrollContractSeed?.nonce) return;
    const { nonce, ...seed } = payrollContractSeed;
    setSelectedId("");
    setDraft({ ...DEFAULT_STAFF_CONTRACT, customAdjustments: [], ...seed });
    setStatus(`Pulled payroll details for ${seed.staffName || "staff member"}. Review and save the contract packet.`);
  }, [payrollContractSeed?.nonce]);

  function selectContract(contract) {
    setSelectedId(contract.id);
    setDraft({ ...DEFAULT_STAFF_CONTRACT, ...contract });
    setContractToDelete(null);
    setStatus("");
  }

  function newContract() {
    setSelectedId("");
    setDraft({ ...DEFAULT_STAFF_CONTRACT, customAdjustments: [] });
    setContractToDelete(null);
    setStatus("Started a new contract packet.");
  }

  async function save(nextDraft = draft, message = "Contract saved.") {
    setBusy(true);
    try {
      const saved = await saveStaffContract(nextDraft, currentUserEmail);
      setDraft({ ...DEFAULT_STAFF_CONTRACT, ...saved });
      setSelectedId(saved.id);
      await load();
      setStatus(message);
      return saved;
    } catch (error) {
      setStatus(error.message);
      throw error;
    } finally {
      setBusy(false);
    }
  }

  async function deleteContract(contract) {
    if (!contract?.id) return;
    setBusy(true);
    try {
      await deleteStaffContract(contract.id, currentUserEmail);
      if (selectedId === contract.id) {
        setSelectedId("");
        setDraft({ ...DEFAULT_STAFF_CONTRACT, customAdjustments: [] });
      }
      setContractToDelete(null);
      await load();
      setStatus(`Deleted ${contract.staffName || "contract"}${contract.schoolYear ? ` (${contract.schoolYear})` : ""}.`);
    } catch (error) {
      setStatus(`Unable to delete contract: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function signAsAdmin() {
    const next = {
      ...draft,
      status: draft.status === "Draft" ? "Admin Signed" : draft.status,
      adminSignature: makeAdminSignature(currentUserEmail),
    };
    await save(next, "Administrator signature recorded.");
  }

  async function sendToStaff() {
    const saved = draft.id ? draft : await save(draft, "Contract saved.");
    setBusy(true);
    try {
      const result = await staffContractAction("send", { contractId: saved.id, signer: "staff", currentUserEmail });
      setDraft({ ...DEFAULT_STAFF_CONTRACT, ...result.contract });
      await load();
      setStatus(`Sent to ${saved.staffEmail}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function sendToBoard() {
    const boardEmail = window.prompt("Board chair email address:");
    if (!boardEmail) return;
    setBusy(true);
    try {
      const result = await staffContractAction("send", { contractId: draft.id, signer: "board", boardEmail, currentUserEmail });
      setDraft({ ...DEFAULT_STAFF_CONTRACT, ...result.contract });
      await load();
      setStatus(`Sent to ${boardEmail}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleBoardContract(contractId) {
    setSelectedBoardIds((ids) => (
      ids.includes(contractId)
        ? ids.filter((id) => id !== contractId)
        : [...ids, contractId]
    ));
  }

  function toggleAllBoardReady() {
    setSelectedBoardIds((ids) => (
      ids.length === boardReadyContracts.length
        ? []
        : boardReadyContracts.map((contract) => contract.id)
    ));
  }

  async function bulkSendToBoard() {
    if (!selectedBoardContracts.length) {
      setStatus("Select at least one staff-signed contract to send to the board chair.");
      return;
    }
    const recipient = boardEmail.trim();
    if (!recipient) {
      setStatus("Enter the board chair email address before sending.");
      return;
    }
    const names = selectedBoardContracts.map((contract) => contract.staffName || "Unnamed").join(", ");
    const confirmed = window.confirm(`Send ${selectedBoardContracts.length} contract${selectedBoardContracts.length === 1 ? "" : "s"} to ${recipient} for board signature?\n\n${names}`);
    if (!confirmed) return;
    setBusy(true);
    try {
      const result = await staffContractAction("bulk-send-board", {
        contractIds: selectedBoardContracts.map((contract) => contract.id),
        boardEmail: recipient,
        currentUserEmail,
      });
      if (result.contracts?.length && selectedId) {
        const updatedSelected = result.contracts.find((contract) => contract.id === selectedId);
        if (updatedSelected) setDraft({ ...DEFAULT_STAFF_CONTRACT, ...updatedSelected });
      }
      setSelectedBoardIds([]);
      await load();
      setStatus(`Sent ${result.sentCount || selectedBoardContracts.length} contract${(result.sentCount || selectedBoardContracts.length) === 1 ? "" : "s"} to ${recipient}.`);
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function printPreview() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("Unable to open print window. Check popup settings.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildStaffContractHtml(draft));
    printWindow.document.close();
    printWindow.focus();
  }

  function updateCustom(index, patch) {
    const customAdjustments = [...(draft.customAdjustments || [])];
    customAdjustments[index] = { ...customAdjustments[index], ...patch };
    setDraft({ ...draft, customAdjustments });
  }

  function updateWorkDayBreakdown(index, patch) {
    const workDayBreakdown = [...normalizedWorkDayBreakdown(draft)];
    workDayBreakdown[index] = { ...workDayBreakdown[index], ...patch };
    setDraft({ ...draft, workDayBreakdown });
  }

  if (!isAllowed) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">This staff contract area is private.</div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid max-w-[1600px] gap-4 px-5 py-5 lg:grid-cols-[260px_1fr]">
      <aside className="rounded-lg border border-slate-800 bg-slate-900 p-2.5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-bold text-white">Saved Contracts</div>
          <button type="button" onClick={load} className="rounded-md border border-slate-700 bg-slate-950 p-1.5 text-slate-200 hover:bg-slate-800"><RefreshCw size={14} /></button>
        </div>
        <TextInput placeholder="Search staff..." value={search} onChange={(event) => setSearch(event.target.value)} className="px-2 py-1.5 text-xs" />
        <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
          <select
            value={contractSort}
            onChange={(event) => setContractSort(event.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-semibold text-slate-200 outline-none focus:border-sky-400"
          >
            <option value="name-asc">Name A-Z</option>
            <option value="name-desc">Name Z-A</option>
            <option value="year-desc">Year newest</option>
            <option value="year-asc">Year oldest</option>
            <option value="status">Status</option>
            <option value="updated">Recently updated</option>
          </select>
          <div className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-center text-xs font-bold text-slate-400">{filtered.length}</div>
        </div>
        <button type="button" onClick={newContract} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs font-bold text-slate-100 hover:bg-slate-800">
          <Plus size={15} /> New Contract
        </button>
        <details className="mt-2 rounded-lg border border-violet-500/30 bg-violet-500/10 p-2">
          <summary className="cursor-pointer text-xs font-black text-violet-100">Bulk Send Board</summary>
          <div className="mt-2 space-y-2">
            <TextInput placeholder="Board chair email" value={boardEmail} onChange={(event) => setBoardEmail(event.target.value)} className="px-2 py-1.5 text-xs" />
            <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-violet-100">
              <span>{boardReadyContracts.length} ready</span>
              <button type="button" onClick={toggleAllBoardReady} className="rounded-md border border-violet-400/40 bg-slate-950 px-2 py-1 text-violet-100 hover:bg-violet-500/20">
                {selectedBoardIds.length === boardReadyContracts.length && boardReadyContracts.length ? "Clear" : "Select all"}
              </button>
            </div>
            <div className="max-h-52 space-y-1 overflow-auto pr-1">
              {boardReadyContracts.map((contract) => (
                <label key={contract.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-slate-800 bg-slate-950 px-2 py-1.5 text-xs text-slate-200 hover:border-violet-400/50">
                  <input
                    type="checkbox"
                    checked={selectedBoardIds.includes(contract.id)}
                    onChange={() => toggleBoardContract(contract.id)}
                    className="mt-0.5 h-3.5 w-3.5 accent-violet-500"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-bold text-white">{contract.staffName || "Unnamed"}</span>
                    <span className="block truncate text-[10px] text-slate-500">{contract.schoolYear || "No year"}</span>
                  </span>
                </label>
              ))}
              {!boardReadyContracts.length && (
                <div className="rounded-md border border-slate-800 bg-slate-950 px-2 py-2 text-[11px] text-slate-500">
                  No contracts are waiting for board signature.
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={busy || !selectedBoardIds.length}
              onClick={bulkSendToBoard}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-500/50 bg-violet-500/20 px-2 py-1.5 text-xs font-black text-violet-50 hover:bg-violet-500/30 disabled:opacity-50"
            >
              <Send size={14} /> Send Selected
            </button>
          </div>
        </details>
        <div className="mt-2 max-h-[74vh] space-y-1 overflow-auto pr-1">
          {filtered.map((contract) => (
            <div key={contract.id} className={`rounded-md border transition ${selectedId === contract.id ? "border-sky-400 bg-sky-500/15" : "border-slate-800 bg-slate-950"}`}>
              <div className="grid grid-cols-[1fr_auto] items-stretch">
                <button type="button" onClick={() => selectContract(contract)} className="min-w-0 px-2 py-1.5 text-left hover:bg-slate-800/70">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate text-xs font-bold text-white">{contract.staffName || "Unnamed"}</div>
                    <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-bold leading-none ${statusTone(contract.status)}`}>{contract.status}</span>
                  </div>
                  <div className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{contract.schoolYear || "No year"}{contract.positionTitle ? ` | ${contract.positionTitle}` : ""}</div>
                </button>
                <button
                  type="button"
                  onClick={() => setContractToDelete(contract)}
                  className="border-l border-slate-800 px-2 text-slate-500 hover:bg-rose-500/10 hover:text-rose-200"
                  title={`Delete ${contract.staffName || "contract"}`}
                  aria-label={`Delete ${contract.staffName || "contract"}`}
                >
                  <Trash2 size={13} />
                </button>
              </div>
              {contractToDelete?.id === contract.id && (
                <div className="border-t border-rose-500/30 bg-rose-500/10 p-2">
                  <div className="text-[11px] font-bold text-rose-50">Delete this contract?</div>
                  <div className="mt-0.5 text-[10px] leading-4 text-rose-100/80">
                    This removes the saved contract record for {contract.staffName || "this staff member"}.
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setContractToDelete(null)}
                      className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-bold text-slate-200 hover:bg-slate-800"
                    >
                      Keep
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      aria-busy={busy}
                      onClick={() => deleteContract(contract)}
                      className="rounded-md border border-rose-400 bg-rose-500 px-2 py-1 text-[10px] font-bold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </aside>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
          <div>
            <div className="flex items-center gap-2 text-lg font-bold text-white"><FileSignature size={20} className="text-sky-300" /> Staff Contracts</div>
            <div className="text-xs text-slate-500">Private contract generation and signature workflow.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <PrimaryButton disabled={busy} onClick={() => save()}><Save size={16} /> Save</PrimaryButton>
            <button type="button" onClick={printPreview} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"><Printer size={16} /> Preview / Print</button>
            <button type="button" disabled={busy || !draft.id} onClick={signAsAdmin} className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-3 py-2 text-sm font-bold text-emerald-100 disabled:opacity-50"><UserCheck size={16} /> Sign Admin</button>
            <button type="button" disabled={busy || !draft.id || !draft.adminSignature?.name} onClick={sendToStaff} className="inline-flex items-center gap-2 rounded-lg border border-sky-500/50 bg-sky-500/15 px-3 py-2 text-sm font-bold text-sky-100 disabled:opacity-50"><Mail size={16} /> Send Staff</button>
            <button type="button" disabled={busy || !draft.id || !draft.staffSignature?.name} onClick={sendToBoard} className="inline-flex items-center gap-2 rounded-lg border border-violet-500/50 bg-violet-500/15 px-3 py-2 text-sm font-bold text-violet-100 disabled:opacity-50"><Send size={16} /> Send Board</button>
          </div>
        </div>
        {status && <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">{status}</div>}

        <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-slate-800 bg-slate-900 p-4 md:grid-cols-2">
              <Field label="Staff Name"><TextInput value={draft.staffName} onChange={(event) => setDraft({ ...draft, staffName: event.target.value })} /></Field>
              <Field label="Staff Email"><TextInput value={draft.staffEmail} onChange={(event) => setDraft({ ...draft, staffEmail: event.target.value })} /></Field>
              <Field label="School Year"><TextInput value={draft.schoolYear} onChange={(event) => setDraft({ ...draft, schoolYear: event.target.value })} /></Field>
              <Field label="Position"><TextInput value={draft.positionTitle} onChange={(event) => setDraft({ ...draft, positionTitle: event.target.value })} /></Field>
              <Field label="Contract Starts"><TextInput value={draft.contractStart} onChange={(event) => setDraft({ ...draft, contractStart: event.target.value })} /></Field>
              <Field label="Contract Ends"><TextInput value={draft.contractEnd} onChange={(event) => setDraft({ ...draft, contractEnd: event.target.value })} /></Field>
              <Field label="Board Meeting Date"><TextInput value={draft.boardMeetingDate} onChange={(event) => setDraft({ ...draft, boardMeetingDate: event.target.value })} /></Field>
              <Field label="FTE Percent">
                <input type="number" min="0" max="100" step="0.01" value={formatFtePercent(draft.fte)} onChange={(event) => setDraft({ ...draft, fte: Number(event.target.value || 0) / 100 })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" />
              </Field>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 text-sm font-bold text-white">Compensation</div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Base Salary"><TextInput type="number" value={draft.baseSalary} onChange={(event) => setDraft({ ...draft, baseSalary: Number(event.target.value || 0) })} /></Field>
                <Field label="Years at WVCS"><TextInput type="number" value={draft.yearsAtWvcs} onChange={(event) => setDraft({ ...draft, yearsAtWvcs: Number(event.target.value || 0) })} /></Field>
                <div className="flex items-end gap-4 pb-2">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-200"><input type="checkbox" checked={draft.hasMasters} onChange={(event) => setDraft({ ...draft, hasMasters: event.target.checked })} className="h-4 w-4 accent-sky-500" /> Master's</label>
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-200"><input type="checkbox" checked={draft.hasStateCertification} onChange={(event) => setDraft({ ...draft, hasStateCertification: event.target.checked })} className="h-4 w-4 accent-sky-500" /> State cert</label>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {(draft.customAdjustments || []).map((item, index) => (
                  <div key={index} className="grid gap-2 md:grid-cols-[1fr_160px_44px]">
                    <TextInput placeholder="Custom salary adjustment" value={item.label || ""} onChange={(event) => updateCustom(index, { label: event.target.value })} />
                    <TextInput type="number" placeholder="Amount" value={item.amount || ""} onChange={(event) => updateCustom(index, { amount: Number(event.target.value || 0) })} />
                    <button type="button" onClick={() => setDraft({ ...draft, customAdjustments: draft.customAdjustments.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800">x</button>
                  </div>
                ))}
                <button type="button" onClick={() => setDraft({ ...draft, customAdjustments: [...(draft.customAdjustments || []), { label: "", amount: 0 }] })} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800">
                  + Add custom adjustment
                </button>
              </div>
            </div>

            <details className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <summary className="cursor-pointer text-sm font-bold text-white">Paid Days & Time Off</summary>
              <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3 text-xs text-slate-400">
                Sick and personal time are calculated from FTE and saved with the contract for future time-off tracking.
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Sick / Emergency</div>
                  <div className="mt-1 text-2xl font-bold text-white">{formatHours(compensation.sickHours)} hours</div>
                  <div className="text-xs text-slate-500">40 hours at 100% FTE</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Personal Time</div>
                  <div className="mt-1 text-2xl font-bold text-white">{formatHours(compensation.personalHours)} hours</div>
                  <div className="text-xs text-slate-500">16 hours at 100% FTE</div>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {normalizedWorkDayBreakdown(draft).map((item, index) => (
                  <div key={`${item.category}-${index}`} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 lg:grid-cols-[1.2fr_100px_2fr]">
                    <TextInput value={item.category || ""} onChange={(event) => updateWorkDayBreakdown(index, { category: event.target.value })} />
                    <TextInput type="number" value={item.count || 0} onChange={(event) => updateWorkDayBreakdown(index, { count: Number(event.target.value || 0) })} />
                    <TextInput value={item.datesIncluded || ""} onChange={(event) => updateWorkDayBreakdown(index, { datesIncluded: event.target.value })} />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setDraft({ ...draft, workDayBreakdown: DEFAULT_WORK_DAY_BREAKDOWN })}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-200 hover:bg-slate-800"
                >
                  Reset to 2026-2027 breakdown
                </button>
              </div>
            </details>
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-sm font-bold text-white">Salary Preview</div>
              <div className="mt-3 space-y-2 text-sm">
                {[
                  ["Prorated base", compensation.proratedBase],
                  ["Loyalty", compensation.loyalty],
                  ["Master's degree", compensation.masters],
                  ["State certification", compensation.certification],
                  ["Custom adjustments", compensation.customTotal],
                  ["Total annual", compensation.annualSalary],
                  ["Monthly", compensation.monthlyPayment],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-800 py-1.5 last:border-b-0">
                    <span className="text-slate-400">{label}</span>
                    <span className="font-bold text-white">{currency(value)}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-sm font-bold text-white">Leave Preview</div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs text-slate-500">Sick</div>
                  <div className="text-lg font-bold text-white">{formatHours(compensation.sickHours)} hrs</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs text-slate-500">Personal</div>
                  <div className="text-lg font-bold text-white">{formatHours(compensation.personalHours)} hrs</div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="text-sm font-bold text-white">Signature Flow</div>
              <div className="mt-3 space-y-2">
                {["admin", "staff", "board"].map((role) => {
                  const signature = draft[`${role}Signature`];
                  const done = Boolean(signature?.name);
                  return (
                    <div key={role} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3">
                      <CheckCircle2 size={17} className={done ? "text-emerald-300" : "text-slate-600"} />
                      <div>
                        <div className="text-sm font-bold text-white">{signerLabels[role]}</div>
                        <div className="text-xs text-slate-500">{signedLine(signature, role === "staff" ? draft.staffEmail : "")}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}

export function StaffContractSigningPage({ token = "" }) {
  const [record, setRecord] = useState(null);
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [status, setStatus] = useState("Loading contract...");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    staffContractAction("get-token", { token })
      .then((result) => {
        setRecord(result.contract);
        setName(result.signer === "staff" ? result.contract.staffName || "" : "");
        setStatus("");
      })
      .catch((error) => setStatus(error.message));
  }, [token]);

  async function sign() {
    if (!name.trim()) {
      setStatus("Please type your full name.");
      return;
    }
    if (!accepted) {
      setStatus("Please confirm that you have reviewed and agree to sign the contract packet.");
      return;
    }
    setBusy(true);
    try {
      const result = await staffContractAction("sign-token", {
        token,
        signerName: name,
        agreementText: "I have reviewed both contract documents and agree that typing my name records my electronic signature.",
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
      });
      setRecord(result.contract);
      setStatus("Signature recorded. Thank you.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  if (!record) {
    return <main className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100"><div className="mx-auto max-w-2xl rounded-lg border border-slate-800 bg-slate-900 p-5">{status}</div></main>;
  }

  return (
    <main className="min-h-screen bg-slate-950 px-3 py-4 text-slate-100 sm:px-5 sm:py-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Willamette Valley Christian School</div>
          <h1 className="mt-1 text-2xl font-bold text-white">Staff Contract Signature</h1>
          <p className="mt-2 text-sm text-slate-400">Review the contract packet below, then sign electronically.</p>
        </div>
        {status && <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">{status}</div>}
        <MobileContractReview contract={record} />
        <div className="hidden rounded-lg border border-slate-800 bg-white p-3 text-slate-950 md:block">
          <iframe title="Contract preview" srcDoc={buildStaffContractHtml(record)} className="h-[720px] w-full rounded-md border border-slate-200" />
        </div>
        <div className="sticky bottom-0 z-10 rounded-lg border border-sky-500/30 bg-slate-900/95 p-4 shadow-2xl shadow-slate-950/60 backdrop-blur">
          <label className="text-sm font-bold text-white">Typed Signature</label>
          <TextInput value={name} onChange={(event) => setName(event.target.value)} placeholder="Type your full legal name" className="mt-2" />
          <label className="mt-3 flex items-start gap-2 text-sm text-slate-300">
            <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1 h-4 w-4 accent-sky-500" />
            I have reviewed both contract documents and agree that typing my name records my electronic signature.
          </label>
          <PrimaryButton disabled={busy} onClick={sign} className="mt-4"><FileSignature size={16} /> Sign Contract Packet</PrimaryButton>
        </div>
      </div>
    </main>
  );
}
