import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Printer, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  calculatePayrollRow,
  calculatePayrollSummary,
  DEFAULT_PAYROLL_CATEGORIES,
  DEFAULT_PAYROLL_ROW,
  DEFAULT_PAYROLL_WORKSHEET,
  fetchStaffPayrollWorksheets,
  saveStaffPayrollWorksheet,
  payrollRowToContract,
  sortedPayrollRows,
} from "../../lib/staffPayrollData.js";
import { currency, STAFF_CONTRACT_ADMIN_EMAIL } from "../../lib/staffContractsData.js";

const payBases = ["salary", "hourly"];
const summaryTones = {
  Employees: "border-sky-500/40 bg-sky-500/10 text-sky-100",
  "Total salaries": "border-emerald-500/40 bg-emerald-500/10 text-emerald-100",
  "Taxes est.": "border-amber-500/40 bg-amber-500/10 text-amber-100",
  "Annual total": "border-violet-500/40 bg-violet-500/10 text-violet-100",
  "Monthly est.": "border-cyan-500/40 bg-cyan-500/10 text-cyan-100",
};
const categoryTones = [
  "border-sky-500/30 bg-sky-500/10 text-sky-100",
  "border-emerald-500/30 bg-emerald-500/10 text-emerald-100",
  "border-violet-500/30 bg-violet-500/10 text-violet-100",
  "border-amber-500/30 bg-amber-500/10 text-amber-100",
  "border-cyan-500/30 bg-cyan-500/10 text-cyan-100",
  "border-rose-500/30 bg-rose-500/10 text-rose-100",
];

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hydrateWorksheet(worksheet = {}) {
  const rowCategories = (worksheet.rows || []).map((row) => row.category).filter(Boolean);
  const categories = [...new Set([...(worksheet.categories || []), ...DEFAULT_PAYROLL_CATEGORIES, ...rowCategories])];
  return {
    ...DEFAULT_PAYROLL_WORKSHEET,
    ...worksheet,
    categories,
    ficaRate: Number.isFinite(Number(worksheet.ficaRate)) ? Number(worksheet.ficaRate) : DEFAULT_PAYROLL_WORKSHEET.ficaRate,
    suiRate: Number.isFinite(Number(worksheet.suiRate)) ? Number(worksheet.suiRate) : DEFAULT_PAYROLL_WORKSHEET.suiRate,
    benefitItems: Array.isArray(worksheet.benefitItems) ? worksheet.benefitItems : [],
    rows: (worksheet.rows || []).map((row) => {
      const merged = { ...DEFAULT_PAYROLL_ROW, ...row, id: row.id || uid() };
      const inferredPayBasis = row.payBasis || (((merged.category === "Classified" || merged.category === "Childcare") && Number(merged.hourlyRate || 0) > 0 && Number(merged.annualHours || 0) > 0 && !merged.salaryBaseIsProrated) ? "hourly" : "salary");
      return { ...merged, payBasis: inferredPayBasis };
    }),
    summaryAdjustments: worksheet.summaryAdjustments || DEFAULT_PAYROLL_WORKSHEET.summaryAdjustments.map((item) => ({ ...item })),
  };
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function TextInput(props) {
  return <input {...props} className={`w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-400 ${props.className || ""}`} />;
}

function SelectInput(props) {
  return <select {...props} className={`w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-400 ${props.className || ""}`} />;
}

function numericValue(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function compactNumber(value, maximumFractionDigits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return parsed.toLocaleString("en-US", { maximumFractionDigits, useGrouping: false });
}

function DecoratedInput({ value, onValueChange, prefix = "", suffix = "", className = "", ...props }) {
  return (
    <div className={`flex w-full items-center rounded-md border border-slate-700 bg-slate-950 text-xs text-white focus-within:border-sky-400 ${className}`}>
      {prefix && <span className="pl-2 text-[11px] font-bold text-slate-500">{prefix}</span>}
      <input
        {...props}
        type="text"
        inputMode="decimal"
        value={value ?? ""}
        onChange={(event) => onValueChange?.(numericValue(event.target.value))}
        className="min-w-0 flex-1 bg-transparent px-1.5 py-1.5 text-xs text-white outline-none"
      />
      {suffix && <span className="pr-2 text-[11px] font-bold text-slate-500">{suffix}</span>}
    </div>
  );
}

function MoneyInput({ value, onValueChange, ...props }) {
  return <DecoratedInput {...props} prefix="$" value={value} onValueChange={onValueChange} />;
}

function PercentInput({ value, onValueChange, ...props }) {
  return <DecoratedInput {...props} suffix="%" value={compactNumber(value, 2)} onValueChange={onValueChange} />;
}

function PlainNumberInput({ value, onValueChange, ...props }) {
  return <DecoratedInput {...props} value={value} onValueChange={onValueChange} />;
}

function ActionButton({ children, tone = "slate", className = "", ...props }) {
  const tones = {
    sky: "border-sky-400 bg-sky-500 text-white hover:bg-sky-400",
    emerald: "border-emerald-500/60 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/25",
    rose: "border-rose-500/50 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20",
    slate: "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800",
  };
  return (
    <button {...props} className={`inline-flex items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}>
      {children}
    </button>
  );
}

function groupPayrollRows(rows = [], worksheet = {}, categories = DEFAULT_PAYROLL_CATEGORIES) {
  const groups = rows.reduce((acc, row) => {
    const category = row.category || "Other";
    if (!acc[category]) acc[category] = { category, rows: [], subtotal: 0, monthlySubtotal: 0 };
    const calc = calculatePayrollRow(row, worksheet);
    acc[category].rows.push(row);
    acc[category].subtotal += calc.totalSalary;
    acc[category].monthlySubtotal += calc.monthlyPay;
    return acc;
  }, {});
  return Object.values(groups).sort((a, b) => {
    const aIndex = categories.indexOf(a.category);
    const bIndex = categories.indexOf(b.category);
    if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    return a.category.localeCompare(b.category);
  });
}

function categoryAddonAccess(category = "") {
  const normalized = String(category || "").toLowerCase();
  const teacherLike = normalized === "teacher" || normalized === "preschool";
  return {
    years: teacherLike,
    certification: teacherLike,
    responsibility: teacherLike || normalized === "admin",
  };
}

function DisabledPayrollCell() {
  return <div className="rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1.5 text-center text-xs font-bold text-slate-600">-</div>;
}

function buildPayrollExportHtml(worksheet = {}) {
  const rows = sortedPayrollRows(worksheet.rows || []);
  const summary = calculatePayrollSummary(worksheet);
  const categories = worksheet.categories || DEFAULT_PAYROLL_CATEGORIES;
  const title = `${worksheet.title || "WVCS Payroll Worksheet"} - ${worksheet.schoolYear || "2026-2027"}`;
  const rowHtml = groupPayrollRows(rows, worksheet, categories).map((group) => {
    const items = group.rows.map((row) => {
      const calc = calculatePayrollRow(row, worksheet);
      const addons = categoryAddonAccess(row.category);
      return `<tr>
        <td class="employee-name">${row.staffName || ""}</td>
        <td>${row.position || ""}</td>
        <td class="category-name">${row.category || ""}</td>
        <td>${calc.isHourly ? "Hourly" : "Salary"}</td>
        <td class="num">${(calc.fte * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%</td>
        <td class="num">${calc.isHourly ? currency(calc.hourlyRate) : currency(calc.baseSalary)}</td>
        <td class="num">${calc.isHourly ? calc.annualHours.toLocaleString("en-US", { maximumFractionDigits: 2 }) : ""}</td>
        <td class="num">${addons.years ? currency(calc.yearsPay) : ""}</td>
        <td class="num">${addons.certification ? currency(calc.certification) : ""}</td>
        <td class="num">${addons.responsibility ? currency(calc.responsibility) : ""}</td>
        <td class="num salary-total">${currency(calc.totalSalary)}</td>
        <td class="num">${currency(calc.monthlyPay)}</td>
        <td>${row.notes || ""}</td>
      </tr>`;
    }).join("");
    return `<tr class="section"><td colspan="13">${group.category} (${group.rows.length})</td></tr>${items}<tr class="subtotal"><td colspan="10">Subtotal - ${group.category}</td><td class="num">${currency(group.subtotal)}</td><td class="num">${currency(group.monthlySubtotal)}</td><td></td></tr>`;
  }).join("");
  const categoryHtml = Object.entries(summary.byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([label, amount]) => `<tr><td>${label}</td><td class="num">${currency(amount)}</td></tr>`).join("");
  const adjustmentHtml = (worksheet.summaryAdjustments || []).map((item) => `<tr><td>${item.label || ""}</td><td class="num">${currency(item.amount)}</td></tr>`).join("");
  const benefitHtml = (worksheet.benefitItems || []).map((item) => `<tr><td>${item.label || "Benefit / Other"}</td><td class="num">${currency(item.amount)}</td></tr>`).join("");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #e5e7eb; color: #111827; font-family: Arial, Helvetica, sans-serif; }
      .page { width: 11in; min-height: 8.5in; margin: 18px auto; background: #fff; padding: .35in; box-shadow: 0 18px 45px rgba(15,23,42,.14); }
      .top { display: flex; justify-content: space-between; gap: 16px; border-bottom: 3px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
      h1 { margin: 0; font-size: 20px; }
      .muted { color: #64748b; font-size: 11px; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 8.8px; }
      th { background: #e2e8f0; color: #0f172a; text-align: left; }
      th, td { border: 1px solid #cbd5e1; padding: 3px 4px; vertical-align: top; overflow-wrap: normal; }
      .employee-name, .category-name { white-space: nowrap; }
      .section td { background: #0f172a; color: white; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
      .subtotal td { background: #f8fafc; font-weight: 800; }
      .num { text-align: right; white-space: nowrap; }
      .strong { font-weight: 800; }
      .salary-total { background: #ecfdf5; color: #065f46; font-weight: 800; }
      .summary { margin-top: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .total { background: #eff6ff; font-weight: 800; }
      @media print {
        @page { size: landscape; margin: .25in; }
        body { background: white; }
        .page { width: auto; min-height: auto; margin: 0; padding: 0; box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="top">
        <div>
          <h1>${title}</h1>
          <div class="muted">Willamette Valley Christian School</div>
        </div>
        <div class="muted">Generated ${new Date().toLocaleDateString()}</div>
      </div>
      <table>
        <colgroup>
          <col style="width: 15.5%;" />
          <col style="width: 11%;" />
          <col style="width: 9.5%;" />
          <col style="width: 5.5%;" />
          <col style="width: 4.5%;" />
          <col style="width: 7.5%;" />
          <col style="width: 5%;" />
          <col style="width: 5.5%;" />
          <col style="width: 6.5%;" />
          <col style="width: 7.5%;" />
          <col style="width: 7.5%;" />
          <col style="width: 7%;" />
          <col style="width: 7%;" />
        </colgroup>
        <thead><tr><th>Employee</th><th>Position</th><th>Category</th><th>Basis</th><th>FTE</th><th>Salary / Rate</th><th>Annual Hrs</th><th>Years</th><th>Cert.</th><th>Responsibility</th><th>Total</th><th>Monthly</th><th>Notes</th></tr></thead>
        <tbody>${rowHtml || `<tr><td colspan="13">No employees entered.</td></tr>`}</tbody>
      </table>
      <section class="summary">
        <table><thead><tr><th>Category</th><th>Total</th></tr></thead><tbody>${categoryHtml}<tr class="total"><td>Employee Rows</td><td class="num">${currency(summary.rowTotal)}</td></tr>${adjustmentHtml}<tr class="total"><td>Total Salaries</td><td class="num">${currency(summary.totalSalaries)}</td></tr></tbody></table>
        <table><thead><tr><th>Payroll Summary</th><th>Total</th></tr></thead><tbody><tr><td>Employer FICA (${(summary.ficaRate * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%)</td><td class="num">${currency(summary.fica)}</td></tr><tr><td>SUI Estimate (${(summary.suiRate * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%)</td><td class="num">${currency(summary.sui)}</td></tr>${benefitHtml}<tr><td>Benefits / Other Total</td><td class="num">${currency(summary.benefits)}</td></tr><tr class="total"><td>Total Annual Payroll</td><td class="num">${currency(summary.totalAnnual)}</td></tr><tr class="total"><td>Monthly Estimate</td><td class="num">${currency(summary.monthlyTotal)}</td></tr></tbody></table>
      </section>
    </main>
  </body>
</html>`;
}

export default function StaffPayrollModule({ currentUserEmail = "", onCreateContractFromPayroll }) {
  const isAllowed = currentUserEmail.toLowerCase() === STAFF_CONTRACT_ADMIN_EMAIL;
  const [worksheets, setWorksheets] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState({ ...DEFAULT_PAYROLL_WORKSHEET, rows: [] });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  const sortedRows = useMemo(() => sortedPayrollRows(draft.rows || []), [draft.rows]);
  const visibleRows = sortedRows.filter((row) => `${row.staffName} ${row.position} ${row.category}`.toLowerCase().includes(search.toLowerCase()));
  const payrollCategories = useMemo(() => [...new Set([...(draft.categories || DEFAULT_PAYROLL_CATEGORIES), ...sortedRows.map((row) => row.category).filter(Boolean)])], [draft.categories, sortedRows]);
  const groupedRows = useMemo(() => groupPayrollRows(visibleRows, draft, payrollCategories), [visibleRows, draft, payrollCategories]);
  const summary = useMemo(() => calculatePayrollSummary(draft), [draft]);
  const categoryTotals = useMemo(() => groupPayrollRows(sortedRows, draft, payrollCategories), [sortedRows, draft, payrollCategories]);

  async function load() {
    if (!isAllowed) return;
    const result = await fetchStaffPayrollWorksheets();
    setWorksheets(result.worksheets || []);
    if (!selectedId && result.worksheets?.[0]) {
      setSelectedId(result.worksheets[0].id);
      setDraft(hydrateWorksheet(result.worksheets[0]));
    }
    if (!result.loaded) setStatus(result.reason || "Staff payroll records are not available yet.");
  }

  useEffect(() => {
    load().catch((error) => setStatus(error.message));
  }, [isAllowed]);

  function updateRow(rowId, patch) {
    setDraft((current) => ({ ...current, rows: (current.rows || []).map((row) => (row.id === rowId ? { ...row, ...patch } : row)) }));
  }

  function addEmployee() {
    setDraft((current) => {
      const category = current.categories?.[0] || "Teacher";
      const categoryRows = (current.rows || []).filter((row) => row.category === category);
      return { ...current, rows: [...(current.rows || []), { ...DEFAULT_PAYROLL_ROW, id: uid(), category, sortOrder: categoryRows.length }] };
    });
    setStatus("Employee row added. Fill in the details, then save.");
  }

  function removeEmployee(row) {
    if (!window.confirm(`Remove ${row.staffName || "this employee"} from this payroll worksheet?`)) return;
    setDraft((current) => ({ ...current, rows: (current.rows || []).filter((item) => item.id !== row.id) }));
    setStatus(`${row.staffName || "Employee"} removed. Save the worksheet to keep the change.`);
  }

  async function saveWorksheet() {
    setBusy(true);
    try {
      const saved = await saveStaffPayrollWorksheet(draft, currentUserEmail);
      setDraft(hydrateWorksheet(saved));
      setSelectedId(saved.id);
      const result = await fetchStaffPayrollWorksheets();
      setWorksheets(result.worksheets || []);
      setStatus("Payroll worksheet saved.");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  function newWorksheet() {
    setSelectedId("");
    setDraft({
      ...DEFAULT_PAYROLL_WORKSHEET,
      rows: [],
      benefitItems: [],
      summaryAdjustments: DEFAULT_PAYROLL_WORKSHEET.summaryAdjustments.map((item) => ({ ...item })),
    });
    setStatus("Started a new payroll worksheet.");
  }

  function openWorksheet(id) {
    const worksheet = worksheets.find((item) => item.id === id);
    if (!worksheet) return;
    setSelectedId(id);
    setDraft(hydrateWorksheet(worksheet));
    setStatus(`${worksheet.title} opened.`);
  }

  function printPdf() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setStatus("Unable to open print window. Check popup settings.");
      return;
    }
    printWindow.document.open();
    printWindow.document.write(buildPayrollExportHtml(draft));
    printWindow.document.close();
    printWindow.focus();
  }

  function exportXls() {
    const html = buildPayrollExportHtml(draft);
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${(draft.title || "WVCS Payroll Worksheet").replace(/[^a-z0-9]+/gi, "-")}-${draft.schoolYear || "2026-2027"}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
    setStatus("Excel export downloaded.");
  }

  function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (payrollCategories.some((category) => category.toLowerCase() === name.toLowerCase())) {
      setStatus("That category already exists.");
      return;
    }
    setDraft((current) => ({ ...current, categories: [...(current.categories || DEFAULT_PAYROLL_CATEGORIES), name] }));
    setNewCategory("");
    setStatus(`${name} category added.`);
  }

  function renameCategory(oldName, nextName) {
    const name = nextName.trim();
    if (!name || name === oldName) return;
    setDraft((current) => ({
      ...current,
      categories: (current.categories || DEFAULT_PAYROLL_CATEGORIES).map((category) => (category === oldName ? name : category)),
      rows: (current.rows || []).map((row) => (row.category === oldName ? { ...row, category: name } : row)),
    }));
  }

  function deleteCategory(categoryName) {
    const rowsInCategory = (draft.rows || []).filter((row) => row.category === categoryName).length;
    const message = rowsInCategory
      ? `Delete ${categoryName} and move ${rowsInCategory} employees to Other?`
      : `Delete ${categoryName}?`;
    if (!window.confirm(message)) return;
    setDraft((current) => ({
      ...current,
      categories: (current.categories || DEFAULT_PAYROLL_CATEGORIES).filter((category) => category !== categoryName),
      rows: (current.rows || []).map((row) => (row.category === categoryName ? { ...row, category: "Other" } : row)),
    }));
    setStatus(`${categoryName} category removed.`);
  }

  function updateBenefit(index, patch) {
    const benefitItems = [...(draft.benefitItems || [])];
    benefitItems[index] = { ...benefitItems[index], ...patch };
    setDraft({ ...draft, benefitItems });
  }

  function addBenefit() {
    setDraft({ ...draft, benefitItems: [...(draft.benefitItems || []), { label: "Benefit / Other", amount: 0 }] });
  }

  function removeBenefit(index) {
    setDraft({ ...draft, benefitItems: (draft.benefitItems || []).filter((_, itemIndex) => itemIndex !== index) });
  }

  if (!isAllowed) {
    return <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">This staff payroll area is private.</div>;
  }

  return (
    <section className="space-y-3">
        <div className="rounded-lg border border-sky-500/20 bg-gradient-to-r from-slate-900 via-slate-900 to-sky-950/40 p-3 shadow-sm shadow-sky-950/20">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-lg font-bold text-white"><FileSpreadsheet size={20} className="text-sky-300" /> Staff Payroll</div>
            <div className="flex flex-wrap gap-2">
              <ActionButton tone="sky" disabled={busy} onClick={saveWorksheet}><Save size={15} /> Save</ActionButton>
              <ActionButton onClick={printPdf}><Printer size={15} /> PDF</ActionButton>
              <ActionButton onClick={exportXls}><Download size={15} /> XLS</ActionButton>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(220px,1.1fr)_minmax(250px,1.4fr)_110px_110px_auto]">
            <Field label="Saved Worksheet">
              <SelectInput value={selectedId} onChange={(event) => openWorksheet(event.target.value)}>
                <option value="">New unsaved worksheet</option>
                {worksheets.map((worksheet) => (
                  <option key={worksheet.id} value={worksheet.id}>{worksheet.title} ({worksheet.schoolYear})</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Title"><TextInput value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></Field>
            <Field label="School Year"><TextInput value={draft.schoolYear} onChange={(event) => setDraft({ ...draft, schoolYear: event.target.value })} /></Field>
            <Field label="Default Hourly"><MoneyInput value={draft.hourlyRate} onValueChange={(value) => setDraft({ ...draft, hourlyRate: value })} /></Field>
            <div className="flex items-end gap-2">
              <ActionButton onClick={load} className="px-2" title="Refresh saved worksheets"><RefreshCw size={14} /></ActionButton>
              <ActionButton onClick={newWorksheet} className="px-2"><Plus size={14} /> New</ActionButton>
            </div>
          </div>
        </div>

        {status && <div className="rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">{status}</div>}

        <div className="grid gap-2 md:grid-cols-5">
          {[
            ["Employees", sortedRows.length],
            ["Total salaries", currency(summary.totalSalaries)],
            ["Taxes est.", currency(summary.taxTotal)],
            ["Annual total", currency(summary.totalAnnual)],
            ["Monthly est.", currency(summary.monthlyTotal)],
          ].map(([label, value]) => (
            <div key={label} className={`rounded-lg border px-3 py-2 ${summaryTones[label] || "border-slate-800 bg-slate-900 text-white"}`}>
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">{label}</div>
              <div className="mt-0.5 text-sm font-black text-white">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {categoryTotals.map((group, index) => (
            <div key={group.category} className={`rounded-lg border px-3 py-2 ${categoryTones[index % categoryTones.length]}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs font-bold text-white">{group.category}</div>
                <div className="rounded-full border border-white/15 bg-black/10 px-2 py-0.5 text-[10px] font-bold text-white/75">{group.rows.length}</div>
              </div>
              <div className="mt-1 text-sm font-black text-white">{currency(group.subtotal)}</div>
              <div className="text-[10px] text-white/60">{currency(group.monthlySubtotal)} monthly</div>
            </div>
          ))}
        </div>

        <details className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <summary className="cursor-pointer text-sm font-bold text-white">Payroll Categories</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {payrollCategories.map((category) => (
              <div key={category} className="grid grid-cols-[1fr_34px] gap-2 rounded-lg border border-slate-800 bg-slate-950 p-2">
                <TextInput value={category} onChange={(event) => renameCategory(category, event.target.value)} />
                <button
                  type="button"
                  onClick={() => deleteCategory(category)}
                  className="rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20"
                  title={`Delete ${category}`}
                >
                  <Trash2 size={13} className="mx-auto" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
            <TextInput placeholder="Add category..." value={newCategory} onChange={(event) => setNewCategory(event.target.value)} />
            <ActionButton onClick={addCategory}><Plus size={14} /> Add Category</ActionButton>
          </div>
        </details>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
          <div className="mb-2 grid gap-2 md:grid-cols-[1fr_auto]">
            <TextInput placeholder="Search employees..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <ActionButton tone="emerald" onClick={addEmployee}><Plus size={15} /> Add Employee</ActionButton>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1110px] w-full table-fixed border-collapse text-left text-[11px]">
              <colgroup>
                <col className="w-[165px]" />
                <col className="w-[100px]" />
                <col className="w-[118px]" />
                <col className="w-[70px]" />
                <col className="w-[74px]" />
                <col className="w-[92px]" />
                <col className="w-[74px]" />
                <col className="w-[48px]" />
                <col className="w-[72px]" />
                <col className="w-[88px]" />
                <col className="w-[92px]" />
                <col className="w-[86px]" />
                <col className="w-[220px]" />
                <col className="w-[88px]" />
              </colgroup>
              <thead className="bg-slate-950 text-slate-300">
                <tr>
                  {["Employee", "Category", "Position", "Basis", "FTE", "Salary/Rate", "Annual Hrs", "Years", "Cert.", "Responsibility", "Total", "Monthly", "Notes", ""].map((heading) => (
                    <th key={heading} className="border-b border-sky-500/20 px-1.5 py-1.5 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((group) => (
                  <Fragment key={group.category}>
                    <tr key={`${group.category}-header`} className="border-y border-sky-500/30 bg-gradient-to-r from-sky-500/20 via-slate-900 to-slate-900 text-sky-50">
                      <td colSpan="14" className="px-2 py-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-black uppercase tracking-[0.12em]">{group.category}</span>
                          <span className="text-[11px] font-bold text-sky-100">{group.rows.length} employees | {currency(group.subtotal)} annual | {currency(group.monthlySubtotal)} monthly</span>
                        </div>
                      </td>
                    </tr>
                    {group.rows.map((row) => {
                      const calc = calculatePayrollRow(row, draft);
                      const addons = categoryAddonAccess(row.category);
                      return (
                        <tr key={row.id} className="border-b border-slate-800 align-top">
                          <td className="px-1 py-0.5"><TextInput value={row.staffName} onChange={(event) => updateRow(row.id, { staffName: event.target.value })} /></td>
                          <td className="px-1 py-0.5"><SelectInput value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value })}>{payrollCategories.map((item) => <option key={item}>{item}</option>)}</SelectInput></td>
                          <td className="px-1 py-1"><TextInput value={row.position} onChange={(event) => updateRow(row.id, { position: event.target.value })} /></td>
                          <td className="px-1 py-1">
                            <SelectInput
                              value={calc.payBasis}
                              onChange={(event) => updateRow(row.id, { payBasis: event.target.value, salaryBaseIsProrated: event.target.value === "hourly" ? false : row.salaryBaseIsProrated })}
                            >
                              {payBases.map((item) => <option key={item} value={item}>{item === "hourly" ? "Hourly" : "Salary"}</option>)}
                            </SelectInput>
                          </td>
                          <td className="px-1 py-1"><PercentInput value={Number(row.fte || 0) * 100} onValueChange={(value) => updateRow(row.id, { fte: value / 100 })} /></td>
                          <td className="px-1 py-1">
                            <MoneyInput
                              value={calc.isHourly ? row.hourlyRate || draft.hourlyRate : row.baseSalary}
                              onValueChange={(value) => updateRow(row.id, calc.isHourly ? { hourlyRate: value } : { baseSalary: value })}
                            />
                          </td>
                          <td className="px-1 py-1">{calc.isHourly ? <PlainNumberInput value={row.annualHours || 0} onValueChange={(value) => updateRow(row.id, { annualHours: value })} /> : <DisabledPayrollCell />}</td>
                          <td className="px-1 py-1">{addons.years ? <PlainNumberInput value={row.yearsAtWvcs || 0} onValueChange={(value) => updateRow(row.id, { yearsAtWvcs: value })} /> : <DisabledPayrollCell />}</td>
                          <td className="px-1 py-1">{addons.certification ? <MoneyInput value={row.certificationAmount || 0} onValueChange={(value) => updateRow(row.id, { certificationAmount: value })} /> : <DisabledPayrollCell />}</td>
                          <td className="px-1 py-1">{addons.responsibility ? <MoneyInput value={row.responsibilityAmount || 0} onValueChange={(value) => updateRow(row.id, { responsibilityAmount: value })} /> : <DisabledPayrollCell />}</td>
                          <td className="whitespace-nowrap bg-emerald-500/10 px-1.5 py-1.5 font-black text-emerald-50">
                            <div>{currency(calc.totalSalary)}</div>
                            {row.importedTotalSalary ? <div className="text-[10px] font-semibold text-slate-500">Excel {currency(row.importedTotalSalary)}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2 text-slate-200">
                            <div>{currency(calc.monthlyPay)}</div>
                            {row.importedMonthlyPay ? <div className="text-[10px] font-semibold text-slate-500">Excel {currency(row.importedMonthlyPay)}</div> : null}
                          </td>
                          <td className="px-1 py-1"><TextInput value={row.notes || ""} onChange={(event) => updateRow(row.id, { notes: event.target.value })} /></td>
                          <td className="px-1 py-1">
                            <div className="flex gap-1">
                              <button type="button" title="Use in contract" onClick={() => onCreateContractFromPayroll?.(payrollRowToContract(row, draft))} className="rounded-md border border-sky-500/50 bg-sky-500/10 px-1.5 py-1 text-[10px] font-bold text-sky-100 hover:bg-sky-500/20">Contract</button>
                              <button type="button" title="Remove employee" onClick={() => removeEmployee(row)} className="rounded-md border border-rose-500/50 bg-rose-500/10 px-1.5 py-1 text-rose-100 hover:bg-rose-500/20"><Trash2 size={12} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr key={`${group.category}-subtotal`} className="border-b border-slate-700 bg-slate-950/80 text-slate-100">
                      <td colSpan="10" className="px-2 py-2 text-right text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">Subtotal - {group.category}</td>
                      <td className="bg-emerald-500/10 px-1.5 py-2 font-black text-emerald-50">{currency(group.subtotal)}</td>
                      <td className="px-1.5 py-2 font-bold text-slate-200">{currency(group.monthlySubtotal)}</td>
                      <td colSpan="2" />
                    </tr>
                  </Fragment>
                ))}
                {!visibleRows.length && <tr><td colSpan="14" className="px-3 py-8 text-center text-sm text-slate-500">No employees match this search.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <details className="rounded-lg border border-violet-500/25 bg-gradient-to-br from-slate-900 via-slate-900 to-violet-950/30 p-3">
          <summary className="cursor-pointer text-sm font-bold text-white">Payroll Options & Summary Adjustments</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
            <Field label="Default Hourly Rate">
              <MoneyInput value={draft.hourlyRate} onValueChange={(value) => setDraft({ ...draft, hourlyRate: value })} />
            </Field>
            <Field label="FICA Rate">
              <PercentInput value={Number(draft.ficaRate ?? DEFAULT_PAYROLL_WORKSHEET.ficaRate) * 100} onValueChange={(value) => setDraft({ ...draft, ficaRate: value / 100 })} />
            </Field>
            <Field label="SUI Rate">
              <PercentInput value={Number(draft.suiRate ?? DEFAULT_PAYROLL_WORKSHEET.suiRate) * 100} onValueChange={(value) => setDraft({ ...draft, suiRate: value / 100 })} />
            </Field>
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-200/70">Benefits / Other</div>
              <div className="mt-1 text-sm font-black text-white">{currency(summary.benefits)}</div>
            </div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-200/70">Tax Total</div>
              <div className="mt-1 text-sm font-black text-white">{currency(summary.taxTotal)}</div>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-bold text-white">Benefit / Other Costs</div>
                <div className="text-xs text-slate-500">Add categories that should be included below taxes in total annual payroll.</div>
              </div>
              <ActionButton onClick={addBenefit} className="px-2 py-1"><Plus size={13} /> Add Benefit</ActionButton>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {(draft.benefitItems || []).map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_110px_34px] gap-2">
                  <TextInput value={item.label || ""} onChange={(event) => updateBenefit(index, { label: event.target.value })} placeholder="Benefit category" />
                  <MoneyInput value={item.amount || 0} onValueChange={(value) => updateBenefit(index, { amount: value })} />
                  <button type="button" onClick={() => removeBenefit(index)} className="rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/20" title="Remove benefit"><Trash2 size={13} className="mx-auto" /></button>
                </div>
              ))}
              {!(draft.benefitItems || []).length && (
                <div className="rounded-lg border border-dashed border-slate-800 px-3 py-2 text-xs text-slate-500">No benefit costs added yet.</div>
              )}
            </div>
          </div>

          <div className="mt-4 text-sm font-bold text-white">Budget Summary Adjustments</div>
          <div className="mt-3 grid gap-2 md:grid-cols-3">
            {(draft.summaryAdjustments || []).map((item, index) => (
              <div key={index} className="grid grid-cols-[1fr_110px] gap-2">
                <TextInput value={item.label || ""} onChange={(event) => {
                  const next = [...(draft.summaryAdjustments || [])];
                  next[index] = { ...item, label: event.target.value };
                  setDraft({ ...draft, summaryAdjustments: next });
                }} />
                <MoneyInput value={item.amount || 0} onValueChange={(value) => {
                  const next = [...(draft.summaryAdjustments || [])];
                  next[index] = { ...item, amount: value };
                  setDraft({ ...draft, summaryAdjustments: next });
                }} />
              </div>
            ))}
          </div>
        </details>
    </section>
  );
}
