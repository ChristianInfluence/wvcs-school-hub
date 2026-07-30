import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const STAFF_CONTRACT_ADMIN_EMAIL = "mconniry@wvcs.org";

export const DEFAULT_STAFF_CONTRACT = {
  staffName: "",
  staffEmail: "",
  schoolYear: "2026-2027",
  positionTitle: "Teacher",
  contractStart: "August 25, 2026",
  contractEnd: "August 25, 2027",
  boardMeetingDate: "",
  fte: 1,
  baseSalary: 32000,
  yearsAtWvcs: 0,
  hasMasters: false,
  hasStateCertification: false,
  customAdjustments: [],
  status: "Draft",
  adminSignature: {},
  staffSignature: {},
  boardSignature: {},
};

export function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

export function money(value) {
  const amount = Number.parseFloat(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(amount) ? amount : 0;
}

export function currency(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(money(value));
}

export function calculateStaffCompensation(contract = {}) {
  const fte = Math.min(Math.max(Number(contract.fte ?? 1), 0), 1);
  const baseSalary = money(contract.baseSalary || 32000);
  const proratedBase = baseSalary * fte;
  const loyalty = Math.max(Number.parseInt(contract.yearsAtWvcs || 0, 10) || 0, 0) * 100;
  const masters = contract.hasMasters ? 600 : 0;
  const certification = contract.hasStateCertification ? 600 : 0;
  const custom = Array.isArray(contract.customAdjustments) ? contract.customAdjustments : [];
  const customTotal = custom.reduce((sum, item) => sum + money(item.amount), 0);
  const additionalTotal = loyalty + masters + certification + customTotal;
  const annualSalary = proratedBase + additionalTotal;
  return {
    fte,
    baseSalary,
    proratedBase,
    loyalty,
    masters,
    certification,
    customTotal,
    additionalTotal,
    annualSalary,
    monthlyPayment: annualSalary / 12,
  };
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    staffName: row.staff_name || "",
    staffEmail: row.staff_email || "",
    schoolYear: row.school_year || "2026-2027",
    positionTitle: row.position_title || "Teacher",
    contractStart: row.contract_start || "",
    contractEnd: row.contract_end || "",
    boardMeetingDate: row.board_meeting_date || "",
    fte: Number(row.fte ?? 1),
    baseSalary: Number(row.base_salary ?? 32000),
    yearsAtWvcs: Number(row.years_at_wvcs || 0),
    hasMasters: Boolean(row.has_masters),
    hasStateCertification: Boolean(row.has_state_certification),
    customAdjustments: row.custom_adjustments || [],
    compensation: row.compensation || {},
    adminSignature: row.admin_signature || {},
    staffSignature: row.staff_signature || {},
    boardSignature: row.board_signature || {},
    staffToken: row.staff_token || "",
    boardToken: row.board_token || "",
    status: row.status || "Draft",
    pdfBackupQueuedAt: row.pdf_backup_queued_at || "",
    createdByEmail: row.created_by_email || "",
    updatedByEmail: row.updated_by_email || "",
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || "",
  };
}

function toRow(contract, currentUserEmail = "") {
  const compensation = calculateStaffCompensation(contract);
  return {
    ...(contract.id ? { id: contract.id } : {}),
    staff_name: contract.staffName || "",
    staff_email: normalizeEmail(contract.staffEmail),
    school_year: contract.schoolYear || "2026-2027",
    position_title: contract.positionTitle || "Teacher",
    contract_start: contract.contractStart || "",
    contract_end: contract.contractEnd || "",
    board_meeting_date: contract.boardMeetingDate || "",
    fte: Number(contract.fte ?? 1),
    base_salary: money(contract.baseSalary || 32000),
    years_at_wvcs: Number.parseInt(contract.yearsAtWvcs || 0, 10) || 0,
    has_masters: Boolean(contract.hasMasters),
    has_state_certification: Boolean(contract.hasStateCertification),
    custom_adjustments: Array.isArray(contract.customAdjustments) ? contract.customAdjustments : [],
    compensation,
    admin_signature: contract.adminSignature || {},
    staff_signature: contract.staffSignature || {},
    board_signature: contract.boardSignature || {},
    status: contract.status || "Draft",
    created_by_email: contract.createdByEmail || currentUserEmail || null,
    updated_by_email: currentUserEmail || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchStaffContracts() {
  if (!isSupabaseConfigured) return { loaded: false, contracts: [], reason: "Supabase is not configured." };
  const { data, error } = await supabase
    .from("staff_contracts")
    .select("*")
    .order("school_year", { ascending: false })
    .order("staff_name", { ascending: true });
  if (error) return { loaded: false, contracts: [], reason: "Staff contracts table is not installed yet." };
  return { loaded: true, contracts: (data || []).map(mapRow) };
}

export async function saveStaffContract(contract, currentUserEmail = "") {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  if (!contract.staffName?.trim()) throw new Error("Enter the staff member's name.");
  if (!normalizeEmail(contract.staffEmail)) throw new Error("Enter the staff member's email.");
  const { data, error } = await supabase
    .from("staff_contracts")
    .upsert(toRow(contract, currentUserEmail), { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

export async function staffContractAction(action, body = {}) {
  if (!isSupabaseConfigured) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.functions.invoke("staff-contract-action", { body: { action, ...body } });
  if (error) {
    const message = error.context ? await error.context.json().catch(() => null) : null;
    throw new Error(message?.error || error.message || "Staff contract action failed.");
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
