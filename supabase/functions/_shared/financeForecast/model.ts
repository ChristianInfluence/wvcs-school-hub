import { z } from "zod";

export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const dateSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/).refine(v => {
  const d = new Date(v + "T12:00:00Z"); return !isNaN(+d) && d.toISOString().slice(0, 10) === v;
}, "Enter a valid calendar date");
const cents = z.number().int().min(-100_000_000_000).max(100_000_000_000);
const positiveCents = cents.refine(v => v >= 0, "Amount cannot be negative");
const id = z.string().min(1).max(180);
const label = z.string().trim().min(1).max(240);
export const fundSchema = z.enum(["operating", "restricted", "designated"]);
export const scenarioSchema = z.enum(["expected", "cautious", "optimistic", "secured"]);
export type Scenario = z.infer<typeof scenarioSchema>;
export const accountSchema = z.object({
  id, name: label, kind: z.enum(["income", "expense"]),
  mode: z.enum(["seasonal", "average", "fixed", "schedule", "off"]).default("seasonal"),
  percentBps: z.number().int().min(-10000).max(100000).default(0),
  deltaCents: cents.default(0), fixedCents: positiveCents.default(0),
  paymentDay: z.number().int().min(1).max(31).default(15),
  fromMonth: monthSchema.optional(), toMonth: monthSchema.optional(),
  fund: fundSchema.default("operating"), note: z.string().max(1500).default(""),
  cashOnly: z.boolean().optional(),
});
export const eventSchema = z.object({
  id, name: label, accountId: id, date: dateSchema,
  endDate: dateSchema.optional(), frequency: z.enum(["once", "monthly"]).default("once"),
  expectedCents: positiveCents, cautiousCents: positiveCents, optimisticCents: positiveCents,
  confidence: z.enum(["confirmed", "estimated"]).default("estimated"),
  treatment: z.enum(["replace", "additional"]).default("replace"),
  fund: fundSchema.default("operating"), reference: z.string().max(240).default(""),
  note: z.string().max(1500).default(""),
}).refine(v => !v.endDate || v.endDate >= v.date, {message:"End date must follow the start date", path:["endDate"]});
export const budgetLineSchema=z.object({accountId:id,name:label,kind:z.enum(["income","expense"]),amountCents:cents});
export const budgetPlanSchema=z.object({id,month:monthSchema,basis:z.enum(["Cash","Accrual"]),approvedAt:z.string().datetime(),reason:z.string().max(1500),lines:z.array(budgetLineSchema).max(600)});
export const boardReportSchema=z.object({
  id,month:monthSchema,preparedAt:z.string().datetime(),schoolName:label,basis:z.enum(["Cash","Accrual"]),
  planId:id.nullable(),planApprovedAt:z.string().nullable(),actualStatus:z.enum(["complete","partial","unconfirmed","missing"]),actualThrough:dateSchema.nullable(),
  lines:z.array(z.object({accountId:id,name:label,kind:z.enum(["income","expense"]),plannedCents:cents.nullable(),actualCents:cents.nullable()})).max(600),
  cutoffMonth:monthSchema,throughJuly:dateSchema,scenario:scenarioSchema,minimumCents:positiveCents,startingCashCents:cents,startingRestrictedCents:positiveCents,startingDesignatedCents:positiveCents,
  cashRows:z.array(z.object({month:monthSchema,incomeCents:cents,expenseCents:cents,totalCents:cents,restrictedCents:positiveCents,designatedCents:positiveCents,availableCents:cents})).max(24),
  assumptions:z.array(z.object({name:label,date:dateSchema,kind:z.enum(["income","expense"]),amountCents:cents})).max(100),
  notes:z.string().max(3000),warnings:z.array(z.string().max(1500)).max(100),sample:z.boolean(),
});
export const documentSchema = z.object({
  schemaVersion: z.literal(1), initialized: z.boolean(),
  settings: z.object({
    name: label, cutoffMonth: monthSchema, horizon: z.number().int().min(6).max(24),
    openingCents: cents, restrictedCents: positiveCents, designatedCents: positiveCents,
    minimumCents: positiveCents, basis: z.enum(["Cash", "Accrual"]),
    fiscalStartMonth: z.number().int().min(1).max(12),
    balanceVerified: z.boolean(), balanceNote: z.string().max(1500),
  }),
  accounts: z.array(accountSchema).max(600),
  history: z.array(z.object({accountId:id, month:monthSchema, amountCents:cents, sourceId:id})).max(25000),
  cashHistory: z.array(z.object({month:monthSchema, netCents:cents, endingCents:cents.optional(), sourceId:id})).max(120),
  events: z.array(eventSchema).max(3000),
  overrides: z.array(z.object({id, accountId:id, month:monthSchema, amountCents:positiveCents, reason:label})).max(3000),
  imports: z.array(z.object({
    id, filename:label, type:z.enum(["pnl", "cashflow", "balance", "tuition"]),
    at:z.string(), count:z.number().int().nonnegative(), months:z.array(monthSchema).max(120), basis:z.enum(["Cash", "Accrual"]),
  })).max(300),
  lastReviewedAt: z.string().nullable(),
  actualCoverage:z.array(z.object({month:monthSchema,throughDate:dateSchema,sourceId:id})).max(120).default([]),
  budgetPlans:z.array(budgetPlanSchema).max(240).default([]),
  boardReports:z.array(boardReportSchema).max(120).default([]),
}).superRefine((v, ctx) => {
  const ids = new Set(v.accounts.map(a => a.id));
  if (ids.size !== v.accounts.length) ctx.addIssue({code:"custom", message:"Duplicate account IDs"});
  for (const collection of [v.history, v.events, v.overrides]) for (const row of collection)
    if (!ids.has(row.accountId)) ctx.addIssue({code:"custom", message:`Unknown account ${row.accountId}`});
  for (const [name, rows, key] of [
    ["history", v.history, (r:any) => `${r.accountId}:${r.month}`],
    ["events", v.events, (r:any) => r.id],
    ["overrides", v.overrides, (r:any) => `${r.accountId}:${r.month}`],
    ["cash history", v.cashHistory, (r:any) => r.month],
    ["actual coverage",v.actualCoverage,(r:any)=>r.month],
    ["monthly plans",v.budgetPlans,(r:any)=>r.id],
    ["board reports",v.boardReports,(r:any)=>r.id],
  ] as const) {
    if (new Set(rows.map(key as any)).size !== rows.length) ctx.addIssue({code:"custom",message:`Duplicate ${name} entries`});
  }
  if (v.settings.restrictedCents + v.settings.designatedCents > Math.max(0,v.settings.openingCents))
    ctx.addIssue({code:"custom",message:"Allocated funds exceed starting cash. Review the balances before saving."});
  for(const coverage of v.actualCoverage)if(coverage.throughDate.slice(0,7)!==coverage.month)
    ctx.addIssue({code:"custom",message:"Actuals coverage date must belong to its month."});
  for(const plan of v.budgetPlans)if(new Set(plan.lines.map(l=>l.accountId)).size!==plan.lines.length)
    ctx.addIssue({code:"custom",message:"A monthly plan contains duplicate account lines."});
});
export type ForecastDocument = z.infer<typeof documentSchema>;
export type Account = ForecastDocument["accounts"][number];
export type CashEvent = ForecastDocument["events"][number];
export type ImportRecord = ForecastDocument["imports"][number];
export type BudgetPlan=z.infer<typeof budgetPlanSchema>;
export type BoardReport=z.infer<typeof boardReportSchema>;
export function addMonth(month: string, offset: number) {
  const [y,m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + offset, 1)).toISOString().slice(0,7);
}
export function dateInMonth(month: string, day: number) {
  const [y,m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y,m,0)).getUTCDate();
  return `${month}-${String(Math.min(day,last)).padStart(2,"0")}`;
}
export function blankDocument(): ForecastDocument {
  const current = new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit"}).format(new Date());
  const [m,y] = current.includes("/") ? current.split("/") : [current.slice(5,7),current.slice(0,4)];
  const month = /^\d{4}-\d{2}$/.test(current) ? current : `${y}-${m}`;
  return {schemaVersion:1, initialized:false, settings:{name:"Willamette Valley Christian School",cutoffMonth:addMonth(month,-1),horizon:18,openingCents:0,restrictedCents:0,designatedCents:0,minimumCents:10000000,basis:"Accrual",fiscalStartMonth:7,balanceVerified:false,balanceNote:""},accounts:[],history:[],cashHistory:[],events:[],overrides:[],imports:[],lastReviewedAt:null,actualCoverage:[],budgetPlans:[],boardReports:[]};
}
export function todayLocal(){const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());return `${parts.find(p=>p.type==="year")!.value}-${parts.find(p=>p.type==="month")!.value}-${parts.find(p=>p.type==="day")!.value}`;}
export const money = (c: number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(c/100);
export const monthLabel = (m: string, short = false) => new Date(m+"-15T12:00:00Z").toLocaleDateString("en-US",{month:short?"short":"long",year:"numeric",timeZone:"UTC"});
export function dollars(value: unknown): number {
  if (typeof value === "number") { if (!Number.isFinite(value)) throw new Error("Invalid amount"); return Math.round(value * 100); }
  const s = String(value ?? "").trim();
  if (!s || s === "-" || s === "—") return 0;
  const negative = s.startsWith("(") && s.endsWith(")");
  const clean = s.replace(/[$,\s()]/g,"");
  if (!/^[+-]?\d+(\.\d{1,4})?$/.test(clean)) throw new Error(`Invalid amount: ${s.slice(0,40)}`);
  const amount = Math.round(Number(clean) * 100) * (negative?-1:1);
  if (!Number.isSafeInteger(amount) || Math.abs(amount)>100_000_000_000) throw new Error("Amount exceeds supported range");
  return amount;
}
