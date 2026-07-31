import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { DEFAULT_WORK_DAY_BREAKDOWN, STAFF_CONTRACT_ADMIN_EMAIL, currency, money } from "./staffContractsData.js";

export const DEFAULT_PAYROLL_CATEGORIES = ["Admin", "Teacher", "Teacher's Aide", "Facilities", "Preschool", "Classified", "Childcare", "Other"];

export const DEFAULT_PAYROLL_ROW = {
  staffName: "",
  staffEmail: "",
  category: "Teacher",
  position: "Teacher",
  payBasis: "salary",
  fte: 1,
  baseSalary: 32000,
  yearsAtWvcs: 0,
  certificationAmount: 0,
  responsibilityAmount: 0,
  hourlyRate: 0,
  annualHours: 0,
  salaryBaseIsProrated: false,
  payType: "DD",
  sortOrder: 0,
  notes: "",
};

export const DEFAULT_PAYROLL_WORKSHEET = {
  schoolYear: "2026-2027",
  title: "WVCS Payroll Worksheet",
  hourlyRate: 16.55,
  categories: DEFAULT_PAYROLL_CATEGORIES,
  rows: [],
  summaryAdjustments: [
    { label: "Subs", amount: 3000 },
    { label: "Athletic Director", amount: 2500 },
    { label: "Coaches", amount: 13000 },
  ],
};

export function normalizePayrollName(value = "") {
  return String(value || "").trim();
}

export function sortedPayrollRows(rows = []) {
  return [...rows].sort((a, b) => {
    const aOrder = Number.isFinite(Number(a.sortOrder)) ? Number(a.sortOrder) : null;
    const bOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : null;
    if (a.category !== b.category) {
      const aCategory = DEFAULT_PAYROLL_CATEGORIES.indexOf(a.category || "Other");
      const bCategory = DEFAULT_PAYROLL_CATEGORIES.indexOf(b.category || "Other");
      if (aCategory !== -1 || bCategory !== -1) return (aCategory === -1 ? 99 : aCategory) - (bCategory === -1 ? 99 : bCategory);
      return String(a.category || "").localeCompare(String(b.category || ""));
    }
    if (aOrder !== null || bOrder !== null) {
      const orderDifference = (aOrder ?? 9999) - (bOrder ?? 9999);
      if (orderDifference !== 0) return orderDifference;
    }
    return normalizePayrollName(a.staffName).localeCompare(normalizePayrollName(b.staffName));
  });
}

export function calculatePayrollRow(row = {}, worksheet = {}) {
  const category = row.category || "Teacher";
  const inferredPayBasis = row.payBasis || (((category === "Classified" || category === "Childcare") && money(row.hourlyRate) > 0 && Number(row.annualHours || 0) > 0 && !row.salaryBaseIsProrated) ? "hourly" : "salary");
  const isHourly = inferredPayBasis === "hourly";
  const usesTeacherAddons = category === "Teacher" || category === "Preschool";
  const usesResponsibility = usesTeacherAddons || category === "Admin";
  const fte = Math.min(Math.max(Number(row.fte ?? 1), 0), 1.5);
  const defaultHourlyRate = money(worksheet.hourlyRate || DEFAULT_PAYROLL_WORKSHEET.hourlyRate);
  const baseSalary = money(row.baseSalary);
  const hourlyRate = money(row.hourlyRate || defaultHourlyRate);
  const annualHours = Number(row.annualHours || 0);
  const yearsPay = usesTeacherAddons ? Math.max(Number.parseInt(row.yearsAtWvcs || 0, 10) || 0, 0) * 100 : 0;
  const certification = usesTeacherAddons ? money(row.certificationAmount) : 0;
  const responsibility = usesResponsibility ? money(row.responsibilityAmount) : 0;
  const salaryBase = isHourly ? hourlyRate * annualHours : row.salaryBaseIsProrated ? baseSalary : baseSalary * fte;
  const totalSalary = salaryBase + yearsPay + certification + responsibility;
  const monthlyPay = totalSalary / 12;
  const quarterlyHours = 2080 * fte / 4;
  const sickHours = 40 * fte;
  const personalHours = 16 * fte;
  return { payBasis: inferredPayBasis, isHourly, fte, baseSalary, hourlyRate, annualHours, yearsPay, certification, responsibility, salaryBase, totalSalary, monthlyPay, quarterlyHours, sickHours, personalHours };
}

export function calculatePayrollSummary(worksheet = {}) {
  const rows = worksheet.rows || [];
  const byCategory = rows.reduce((acc, row) => {
    const category = row.category || "Other";
    acc[category] = (acc[category] || 0) + calculatePayrollRow(row, worksheet).totalSalary;
    return acc;
  }, {});
  const rowTotal = Object.values(byCategory).reduce((sum, value) => sum + value, 0);
  const adjustments = Array.isArray(worksheet.summaryAdjustments) ? worksheet.summaryAdjustments : [];
  const adjustmentTotal = adjustments.reduce((sum, item) => sum + money(item.amount), 0);
  const totalSalaries = rowTotal + adjustmentTotal;
  const fica = totalSalaries * 0.0765;
  const sui = totalSalaries * 0.035;
  const taxTotal = fica + sui;
  const benefits = money(worksheet.benefitsTotal || 0);
  const totalAnnual = totalSalaries + taxTotal + benefits;
  return { byCategory, rowTotal, adjustmentTotal, totalSalaries, fica, sui, taxTotal, benefits, totalAnnual, monthlyTotal: totalAnnual / 12 };
}

export function payrollRowToContract(row = {}, worksheet = {}) {
  const calculated = calculatePayrollRow(row, worksheet);
  return {
    staffName: row.staffName || "",
    staffEmail: row.staffEmail || "",
    schoolYear: worksheet.schoolYear || "2026-2027",
    positionTitle: row.position || row.category || "Teacher",
    fte: calculated.fte,
    baseSalary: row.category === "Teacher" ? 32000 : calculated.totalSalary,
    yearsAtWvcs: Number(row.yearsAtWvcs || 0),
    hasMasters: false,
    hasStateCertification: calculated.certification >= 600,
    customAdjustments: [
      calculated.certification > 600 ? { label: "Additional certification / degree adjustment", amount: calculated.certification - 600 } : null,
      calculated.responsibility ? { label: "Responsibility / stipend", amount: calculated.responsibility } : null,
    ].filter(Boolean),
    compensation: { workDayBreakdown: DEFAULT_WORK_DAY_BREAKDOWN },
    workDayBreakdown: DEFAULT_WORK_DAY_BREAKDOWN,
  };
}

function mapWorksheet(row) {
  return {
    id: row.id,
    schoolYear: row.school_year || "2026-2027",
    title: row.title || "WVCS Payroll Worksheet",
    hourlyRate: Number(row.hourly_rate ?? 16.55),
    categories: row.settings?.categories || row.categories || DEFAULT_PAYROLL_CATEGORIES,
    rows: row.rows || [],
    summaryAdjustments: row.summary_adjustments || DEFAULT_PAYROLL_WORKSHEET.summaryAdjustments,
    benefitsTotal: Number(row.benefits_total || 0),
    createdByEmail: row.created_by_email || "",
    updatedByEmail: row.updated_by_email || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function toWorksheetRow(worksheet, currentUserEmail = "") {
  return {
    ...(worksheet.id ? { id: worksheet.id } : {}),
    school_year: worksheet.schoolYear || "2026-2027",
    title: worksheet.title || "WVCS Payroll Worksheet",
    hourly_rate: money(worksheet.hourlyRate || 16.55),
    rows: sortedPayrollRows(worksheet.rows || []),
    summary_adjustments: worksheet.summaryAdjustments || [],
    benefits_total: money(worksheet.benefitsTotal || 0),
    settings: { ...(worksheet.settings || {}), categories: worksheet.categories || DEFAULT_PAYROLL_CATEGORIES },
    created_by_email: worksheet.createdByEmail || currentUserEmail || null,
    updated_by_email: currentUserEmail || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchStaffPayrollWorksheets() {
  if (!isSupabaseConfigured) return { loaded: false, worksheets: [], reason: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("staff_payroll_worksheets")
    .select("*")
    .order("school_year", { ascending: false })
    .order("title", { ascending: true });
  if (error) return { loaded: false, worksheets: [], reason: "Staff payroll table is not installed yet." };
  return { loaded: true, worksheets: (data || []).map(mapWorksheet) };
}

export async function saveStaffPayrollWorksheet(worksheet, currentUserEmail = "") {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  if (String(currentUserEmail || "").toLowerCase() !== STAFF_CONTRACT_ADMIN_EMAIL) throw new Error("This staff payroll area is private.");
  const { data, error } = await supabase
    .from("staff_payroll_worksheets")
    .upsert(toWorksheetRow(worksheet, currentUserEmail), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return mapWorksheet(data);
}
