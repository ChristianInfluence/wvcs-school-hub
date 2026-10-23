import {addMonth,dateInMonth,type ForecastDocument,type BudgetPlan,type BoardReport,type Scenario} from "./model.ts";
import {project} from "./engine.ts";

export function julyEnd(month:string){const year=Number(month.slice(0,4))+(Number(month.slice(5))>7?1:0);return `${year}-07-31`;}
export function monthDistance(from:string,to:string){return (Number(to.slice(0,4))-Number(from.slice(0,4)))*12+Number(to.slice(5))-Number(from.slice(5));}
export function latestPlan(doc:ForecastDocument,month:string){return doc.budgetPlans.filter(p=>p.month===month&&p.basis===doc.settings.basis).at(-1)??null;}
export function draftPlan(doc:ForecastDocument,month:string):BudgetPlan["lines"]{
  const needed=monthDistance(doc.settings.cutoffMonth,month);
  const projection=needed>0&&needed<=24?project({...doc,settings:{...doc.settings,horizon:Math.max(6,needed)}}):null;
  const lines=projection?.months.find(m=>m.month===month)?.lines??[];
  return doc.accounts.filter(a=>!a.cashOnly).map(a=>({accountId:a.id,name:a.name,kind:a.kind,amountCents:lines.filter(l=>l.accountId===a.id).reduce((n,l)=>n+l.amountCents,0)}));
}
export function actualsStatus(doc:ForecastDocument,month:string):{status:BoardReport["actualStatus"];through:string|null}{
  const coverage=doc.actualCoverage.find(c=>c.month===month);
  if(coverage)return{status:coverage.throughDate===dateInMonth(month,31)?"complete":"partial",through:coverage.throughDate};
  return{status:doc.history.some(h=>h.month===month)?"unconfirmed":"missing",through:null};
}
export function buildBoardReport(doc:ForecastDocument,input:{id:string;month:string;preparedAt:string;scenario:Scenario;notes?:string;sample?:boolean}):BoardReport{
  const plan=latestPlan(doc,input.month),coverage=actualsStatus(doc,input.month),actuals=doc.history.filter(h=>h.month===input.month);
  const actualMap=new Map(actuals.map(h=>[h.accountId,h.amountCents]));
  const planMap=new Map(plan?.lines.map(l=>[l.accountId,l])??[]);
  const ids=new Set([...planMap.keys(),...actualMap.keys()]);
  const lines=[...ids].map(accountId=>{
    const a=doc.accounts.find(a=>a.id===accountId),planned=planMap.get(accountId);
    return{accountId,name:planned?.name??a?.name??accountId,kind:planned?.kind??a?.kind??"expense",plannedCents:planned?.amountCents??(plan?0:null),actualCents:coverage.status==="missing"?null:actualMap.get(accountId)??0};
  }).filter(l=>!doc.accounts.find(a=>a.id===l.accountId)?.cashOnly).sort((a,b)=>a.kind.localeCompare(b.kind)||a.name.localeCompare(b.name));
  const end=julyEnd(input.month),needed=monthDistance(doc.settings.cutoffMonth,end.slice(0,7));
  const cash=needed>0&&needed<=24?project({...doc,settings:{...doc.settings,horizon:Math.max(6,needed)}},input.scenario):null;
  const warnings:string[]=[];
  if(!plan)warnings.push("No approved monthly plan is recorded. Planned amounts and variances remain blank.");
  if(coverage.status==="missing")warnings.push("Actual income and expenses have not been imported for this month. Blank actuals do not mean zero activity.");
  if(coverage.status==="partial")warnings.push("Month-to-date actuals are compared with a full-month plan. Variances are provisional until the month is complete.");
  if(coverage.status==="unconfirmed")warnings.push("Actuals are imported, but their reporting-through date is unconfirmed. Confirm the period before treating the month as complete.");
  if(plan&&plan.approvedAt.slice(0,10)>`${input.month}-01`)warnings.push("The comparison plan was recorded after this month began; its recorded date is shown.");
  if(!doc.settings.balanceVerified)warnings.push("The cash forecast starting balance has not been reviewed.");
  if(needed<0)warnings.push("The selected July end is before the latest cash cutoff. Use an archived report for a historical outlook.");
  if(needed>24)warnings.push("The July end is more than 24 months after the cash cutoff. Update the reviewed cash balance.");
  if(doc.settings.basis==="Accrual")warnings.push("The monthly comparison uses accrual income and expenses. The forward outlook uses cash receipts and payments; those totals can differ.");
  const cashRows=cash?.months.filter(m=>m.month<=end.slice(0,7)).map(m=>({month:m.month,incomeCents:m.inflowCents,expenseCents:m.outflowCents,totalCents:m.closingCents,restrictedCents:m.restrictedCents,designatedCents:m.designatedCents,availableCents:m.availableCents}))??[];
  const assumptions=doc.events.filter(e=>e.confidence==="estimated"&&e.date.slice(0,7)>doc.settings.cutoffMonth&&e.date<=end).slice(0,100).map(e=>({name:e.name,date:e.date,kind:doc.accounts.find(a=>a.id===e.accountId)?.kind??"income" as const,amountCents:input.scenario==="secured"?(doc.accounts.find(a=>a.id===e.accountId)?.kind==="income"?0:e.expectedCents):e[`${input.scenario}Cents`]}));
  return{id:input.id,month:input.month,preparedAt:input.preparedAt,schoolName:doc.settings.name,basis:doc.settings.basis,planId:plan?.id??null,planApprovedAt:plan?.approvedAt??null,actualStatus:coverage.status,actualThrough:coverage.through,lines,cutoffMonth:doc.settings.cutoffMonth,throughJuly:end,scenario:input.scenario,minimumCents:doc.settings.minimumCents,startingCashCents:doc.settings.openingCents,startingRestrictedCents:doc.settings.restrictedCents,startingDesignatedCents:doc.settings.designatedCents,cashRows,assumptions,notes:input.notes??"",warnings,sample:input.sample??false};
}
export function julyClosing(report:BoardReport){const last=report.cashRows.at(-1);if(last?.month===report.throughJuly.slice(0,7))return{...last,status:"forecast" as const};if(report.cutoffMonth===report.throughJuly.slice(0,7))return{totalCents:report.startingCashCents,restrictedCents:report.startingRestrictedCents,designatedCents:report.startingDesignatedCents,availableCents:report.startingCashCents-report.startingRestrictedCents-report.startingDesignatedCents,status:"actual" as const};return null;}
export function reportTotals(report:BoardReport){
  const sum=(kind:"income"|"expense",field:"plannedCents"|"actualCents")=>{
    if(field==="plannedCents"&&!report.planId)return null;
    if(field==="actualCents"&&report.actualStatus==="missing")return null;
    return report.lines.filter(l=>l.kind===kind).reduce((n,l)=>n+(l[field]??0),0);
  };
  const plannedIncome=sum("income","plannedCents"),plannedExpenses=sum("expense","plannedCents"),actualIncome=sum("income","actualCents"),actualExpenses=sum("expense","actualCents");
  return{plannedIncome,plannedExpenses,actualIncome,actualExpenses,plannedNet:plannedIncome===null||plannedExpenses===null?null:plannedIncome-plannedExpenses,actualNet:actualIncome===null||actualExpenses===null?null:actualIncome-actualExpenses};
}
/** Favorable income is above plan; favorable expense is below plan. Missing data stays null. */
export function favorableVariance(kind:"income"|"expense",planned:number|null,actual:number|null){return planned===null||actual===null?null:(actual-planned)*(kind==="income"?1:-1);}
/** Older backups preserve archived board records. Existing records cannot be silently rewritten. */
export function preserveBoardHistory(previous:ForecastDocument,next:ForecastDocument):ForecastDocument{
  const copy=structuredClone(next);
  for(const field of ["budgetPlans","boardReports"] as const){
    const old=previous[field] as Array<{id:string}>,incoming=copy[field] as Array<{id:string}>;
    for(const row of old){const found=incoming.find(r=>r.id===row.id);if(found&&JSON.stringify(found)!==JSON.stringify(row))throw new Error("An approved plan or saved board report cannot be overwritten. Save a new version instead.");}
    (copy[field] as Array<{id:string}>)=[...old,...incoming.filter(r=>!old.some(o=>o.id===r.id))];
  }
  return copy;
}
