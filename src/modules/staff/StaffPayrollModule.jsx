import { Fragment, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, Plus, Printer, RefreshCw, Save, Trash2 } from "lucide-react";
import {
  calculatePayrollRow,
  calculatePayrollSummary,
  DEFAULT_PAYROLL_ROW,
  DEFAULT_PAYROLL_WORKSHEET,
  fetchStaffPayrollWorksheets,
  saveStaffPayrollWorksheet,
  payrollRowToContract,
  sortedPayrollRows,
} from "../../lib/staffPayrollData.js";
import { currency, STAFF_CONTRACT_ADMIN_EMAIL } from "../../lib/staffContractsData.js";

const categories = ["Teacher", "Admin", "Classified", "Childcare", "Preschool", "Other"];
const payTypes = ["DD", "Check"];
const categoryOrder = ["Admin", "Teacher", "Preschool", "Classified", "Childcare", "Other"];

function uid() {
  return crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hydrateWorksheet(worksheet = {}) {
  return {
    ...DEFAULT_PAYROLL_WORKSHEET,
    ...worksheet,
    rows: (worksheet.rows || []).map((row) => ({ ...DEFAULT_PAYROLL_ROW, ...row, id: row.id || uid() })),
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
  return <DecoratedInput {...props} suffix="%" value={value} onValueChange={onValueChange} />;
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

function groupPayrollRows(rows = [], worksheet = {}) {
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
    const aIndex = categoryOrder.indexOf(a.category);
    const bIndex = categoryOrder.indexOf(b.category);
    if (aIndex !== -1 || bIndex !== -1) return (aIndex === -1 ? 99 : aIndex) - (bIndex === -1 ? 99 : bIndex);
    return a.category.localeCompare(b.category);
  });
}

function buildPayrollExportHtml(worksheet = {}) {
  const rows = sortedPayrollRows(worksheet.rows || []);
  const summary = calculatePayrollSummary(worksheet);
  const title = `${worksheet.title || "WVCS Payroll Worksheet"} - ${worksheet.schoolYear || "2026-2027"}`;
  const rowHtml = groupPayrollRows(rows, worksheet).map((group) => {
    const items = group.rows.map((row) => {
      const calc = calculatePayrollRow(row, worksheet);
      return `<tr>
        <td>${row.staffName || ""}</td>
        <td>${row.position || ""}</td>
        <td>${row.category || ""}</td>
        <td class="num">${(calc.fte * 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}%</td>
        <td class="num">${currency(calc.salaryBase)}</td>
        <td class="num">${currency(calc.yearsPay)}</td>
        <td class="num">${currency(calc.certification)}</td>
        <td class="num">${currency(calc.responsibility)}</td>
        <td class="num strong">${currency(calc.totalSalary)}</td>
        <td class="num">${currency(calc.monthlyPay)}</td>
        <td class="num">${row.importedTotalSalary ? currency(row.importedTotalSalary) : ""}</td>
        <td class="num">${row.importedMonthlyPay ? currency(row.importedMonthlyPay) : ""}</td>
        <td>${row.payType || ""}</td>
        <td>${row.notes || ""}</td>
      </tr>`;
    }).join("");
    return `<tr class="section"><td colspan="14">${group.category} (${group.rows.length})</td></tr>${items}<tr class="subtotal"><td colspan="8">Subtotal - ${group.category}</td><td class="num">${currency(group.subtotal)}</td><td class="num">${currency(group.monthlySubtotal)}</td><td colspan="4"></td></tr>`;
  }).join("");
  const categoryHtml = Object.entries(summary.byCategory).sort(([a], [b]) => a.localeCompare(b)).map(([label, amount]) => `<tr><td>${label}</td><td class="num">${currency(amount)}</td></tr>`).join("");
  const adjustmentHtml = (worksheet.summaryAdjustments || []).map((item) => `<tr><td>${item.label || ""}</td><td class="num">${currency(item.amount)}</td></tr>`).join("");
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
      table { width: 100%; border-collapse: collapse; font-size: 9.5px; }
      th { background: #e2e8f0; color: #0f172a; text-align: left; }
      th, td { border: 1px solid #cbd5e1; padding: 5px 6px; vertical-align: top; }
      .section td { background: #0f172a; color: white; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; }
      .subtotal td { background: #f8fafc; font-weight: 800; }
      .num { text-align: right; white-space: nowrap; }
      .strong { font-weight: 800; }
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
        <thead><tr><th>Employee</th><th>Position</th><th>Category</th><th>FTE</th><th>Base / Hourly Pay</th><th>Years</th><th>Certification</th><th>Responsibility</th><th>Hub Total</th><th>Hub Monthly</th><th>Sheet Total</th><th>Sheet Monthly</th><th>Pay</th><th>Notes</th></tr></thead>
        <tbody>${rowHtml || `<tr><td colspan="14">No employees entered.</td></tr>`}</tbody>
      </table>
      <section class="summary">
        <table><thead><tr><th>Category</th><th>Total</th></tr></thead><tbody>${categoryHtml}<tr class="total"><td>Employee Rows</td><td class="num">${currency(summary.rowTotal)}</td></tr>${adjustmentHtml}<tr class="total"><td>Total Salaries</td><td class="num">${currency(summary.totalSalaries)}</td></tr></tbody></table>
        <table><thead><tr><th>Payroll Summary</th><th>Total</th></tr></thead><tbody><tr><td>Employer FICA</td><td class="num">${currency(summary.fica)}</td></tr><tr><td>SUI Estimate</td><td class="num">${currency(summary.sui)}</td></tr><tr><td>Benefits / Other</td><td class="num">${currency(summary.benefits)}</td></tr><tr class="total"><td>Total Annual Payroll</td><td class="num">${currency(summary.totalAnnual)}</td></tr><tr class="total"><td>Monthly Estimate</td><td class="num">${currency(summary.monthlyTotal)}</td></tr></tbody></table>
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

  const sortedRows = useMemo(() => sortedPayrollRows(draft.rows || []), [draft.rows]);
  const visibleRows = sortedRows.filter((row) => `${row.staffName} ${row.position} ${row.category}`.toLowerCase().includes(search.toLowerCase()));
  const groupedRows = useMemo(() => groupPayrollRows(visibleRows, draft), [visibleRows, draft]);
  const summary = useMemo(() => calculatePayrollSummary(draft), [draft]);
  const categoryTotals = useMemo(() => groupPayrollRows(sortedRows, draft), [sortedRows, draft]);

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
    setDraft((current) => ({ ...current, rows: [...(current.rows || []), { ...DEFAULT_PAYROLL_ROW, id: uid() }] }));
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
    setDraft({ ...DEFAULT_PAYROLL_WORKSHEET, rows: [], summaryAdjustments: DEFAULT_PAYROLL_WORKSHEET.summaryAdjustments.map((item) => ({ ...item })) });
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

  if (!isAllowed) {
    return <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">This staff payroll area is private.</div>;
  }

  return (
    <section className="space-y-3">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-3">
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
            <Field label="Hourly Rate"><MoneyInput value={draft.hourlyRate} onValueChange={(value) => setDraft({ ...draft, hourlyRate: value })} /></Field>
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
            <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
              <div className="mt-0.5 text-sm font-bold text-white">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
          {categoryTotals.map((group) => (
            <div key={group.category} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-xs font-bold text-white">{group.category}</div>
                <div className="rounded-full border border-slate-700 px-2 py-0.5 text-[10px] font-bold text-slate-400">{group.rows.length}</div>
              </div>
              <div className="mt-1 text-sm font-bold text-sky-100">{currency(group.subtotal)}</div>
              <div className="text-[10px] text-slate-500">{currency(group.monthlySubtotal)} monthly</div>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-2">
          <div className="mb-2 grid gap-2 md:grid-cols-[1fr_auto]">
            <TextInput placeholder="Search employees..." value={search} onChange={(event) => setSearch(event.target.value)} />
            <ActionButton tone="emerald" onClick={addEmployee}><Plus size={15} /> Add Employee</ActionButton>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full table-fixed border-collapse text-left text-[11px]">
              <colgroup>
                <col className="w-[150px]" />
                <col className="w-[94px]" />
                <col className="w-[108px]" />
                <col className="w-[58px]" />
                <col className="w-[84px]" />
                <col className="w-[48px]" />
                <col className="w-[72px]" />
                <col className="w-[84px]" />
                <col className="w-[74px]" />
                <col className="w-[88px]" />
                <col className="w-[82px]" />
                <col className="w-[68px]" />
                <col className="w-[56px]" />
                <col className="w-[180px]" />
                <col className="w-[88px]" />
              </colgroup>
              <thead className="bg-slate-950 text-slate-400">
                <tr>
                  {["Employee", "Category", "Position", "FTE", "Base/Rate", "Years", "Cert.", "Responsibility", "Annual Hrs", "Total", "Monthly", "Sheet", "Pay", "Notes", ""].map((heading) => (
                    <th key={heading} className="border-b border-slate-800 px-1.5 py-1.5 font-semibold">{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groupedRows.map((group) => (
                  <Fragment key={group.category}>
                    <tr key={`${group.category}-header`} className="border-y border-sky-500/30 bg-sky-500/15 text-sky-50">
                      <td colSpan="15" className="px-2 py-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-black uppercase tracking-[0.12em]">{group.category}</span>
                          <span className="text-[11px] font-bold text-sky-100">{group.rows.length} employees | {currency(group.subtotal)} annual | {currency(group.monthlySubtotal)} monthly</span>
                        </div>
                      </td>
                    </tr>
                    {group.rows.map((row) => {
                      const calc = calculatePayrollRow(row, draft);
                      return (
                        <tr key={row.id} className="border-b border-slate-800 align-top">
                          <td className="px-1 py-1"><TextInput value={row.staffName} onChange={(event) => updateRow(row.id, { staffName: event.target.value })} /></td>
                          <td className="px-1 py-1"><SelectInput value={row.category} onChange={(event) => updateRow(row.id, { category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</SelectInput></td>
                          <td className="px-1 py-1"><TextInput value={row.position} onChange={(event) => updateRow(row.id, { position: event.target.value })} /></td>
                          <td className="px-1 py-1"><PercentInput value={Number(row.fte || 0) * 100} onValueChange={(value) => updateRow(row.id, { fte: value / 100 })} /></td>
                          <td className="px-1 py-1"><MoneyInput value={row.category === "Classified" || row.category === "Childcare" ? row.hourlyRate || draft.hourlyRate : row.baseSalary} onValueChange={(value) => updateRow(row.id, row.category === "Classified" || row.category === "Childcare" ? { hourlyRate: value } : { baseSalary: value })} /></td>
                          <td className="px-1 py-1"><PlainNumberInput value={row.yearsAtWvcs || 0} onValueChange={(value) => updateRow(row.id, { yearsAtWvcs: value })} /></td>
                          <td className="px-1 py-1"><MoneyInput value={row.certificationAmount || 0} onValueChange={(value) => updateRow(row.id, { certificationAmount: value })} /></td>
                          <td className="px-1 py-1"><MoneyInput value={row.responsibilityAmount || 0} onValueChange={(value) => updateRow(row.id, { responsibilityAmount: value })} /></td>
                          <td className="px-1 py-1"><PlainNumberInput value={row.annualHours || 0} onValueChange={(value) => updateRow(row.id, { annualHours: value })} /></td>
                          <td className="whitespace-nowrap px-1.5 py-2 font-bold text-white">
                            <div>{currency(calc.totalSalary)}</div>
                            {row.importedTotalSalary ? <div className="text-[10px] font-semibold text-slate-500">Excel {currency(row.importedTotalSalary)}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2 text-slate-200">
                            <div>{currency(calc.monthlyPay)}</div>
                            {row.importedMonthlyPay ? <div className="text-[10px] font-semibold text-slate-500">Excel {currency(row.importedMonthlyPay)}</div> : null}
                          </td>
                          <td className="whitespace-nowrap px-1.5 py-2 text-slate-400">
                            {row.sourceSheetRow ? <div>Row {row.sourceSheetRow}</div> : null}
                            {row.importedQuarterlyHours ? <div className="text-[10px]">Qtr {Number(row.importedQuarterlyHours).toLocaleString("en-US", { maximumFractionDigits: 2 })} hrs</div> : null}
                          </td>
                          <td className="px-1 py-1"><SelectInput value={row.payType || "DD"} onChange={(event) => updateRow(row.id, { payType: event.target.value })}>{payTypes.map((item) => <option key={item}>{item}</option>)}</SelectInput></td>
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
                      <td colSpan="8" className="px-2 py-2 text-right text-[11px] font-black uppercase tracking-[0.08em] text-slate-400">Subtotal - {group.category}</td>
                      <td className="px-1.5 py-2 font-black text-white">{currency(group.subtotal)}</td>
                      <td className="px-1.5 py-2 font-bold text-slate-200">{currency(group.monthlySubtotal)}</td>
                      <td colSpan="5" />
                    </tr>
                  </Fragment>
                ))}
                {!visibleRows.length && <tr><td colSpan="15" className="px-3 py-8 text-center text-sm text-slate-500">No employees match this search.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <details className="rounded-lg border border-slate-800 bg-slate-900 p-3">
          <summary className="cursor-pointer text-sm font-bold text-white">Budget Summary Adjustments</summary>
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
