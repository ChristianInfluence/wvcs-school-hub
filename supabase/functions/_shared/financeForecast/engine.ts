import { addMonth, dateInMonth, type ForecastDocument, type Scenario } from "./model.ts";

export interface ForecastLine { id:string; date:string; accountId:string; account:string; kind:"income"|"expense"; amountCents:number; fund:"operating"|"restricted"|"designated"; source:string; estimated:boolean; }
export interface ForecastMonth { month:string; inflowCents:number; outflowCents:number; closingCents:number; restrictedCents:number; designatedCents:number; availableCents:number; minimumAvailableCents:number; lines:ForecastLine[]; }
export interface ForecastDay { date:string; totalCents:number; availableCents:number; }
export function project(doc: ForecastDocument, scenario: Scenario = "expected") {
  const {settings:s} = doc;
  const months = Array.from({length:s.horizon},(_,i) => addMonth(s.cutoffMonth,i+1));
  const history = new Map(doc.history.map(h => [`${h.accountId}:${h.month}`,h]));
  const overrides = new Map(doc.overrides.map(h => [`${h.accountId}:${h.month}`,h]));
  const lines: ForecastLine[] = [];
  const warnings = new Set<string>();
  if (!s.balanceVerified) warnings.add("Starting cash has not been marked reviewed.");
  const cashReference=doc.cashHistory.find(h=>h.month===s.cutoffMonth);
  if(cashReference?.endingCents!==undefined&&cashReference.endingCents!==s.openingCents)
    warnings.add("Starting cash differs from the imported cash-flow ending balance. Review the selected bank accounts and cutoff date.");
  if (s.basis === "Accrual" && doc.history.length) warnings.add("Accrual expense history is a planning baseline. Review payment days and outstanding bills for cash timing.");
  for (const month of months) for (const a of doc.accounts) {
    if (a.mode === "off") continue;
    const active = (!a.fromMonth || month >= a.fromMonth) && (!a.toMonth || month <= a.toMonth);
    const events = doc.events.filter(e => e.accountId === a.id && (
      e.frequency === "once" ? e.date.slice(0,7) === month : e.date.slice(0,7) <= month && (!e.endDate || e.endDate.slice(0,7) >= month)
    ));
    const replacement = events.filter(e => e.treatment === "replace");
    const override = overrides.get(`${a.id}:${month}`);
    let base = 0; let source = "";
    if (active) {
      if (override) { base=override.amountCents; source=`Month override: ${override.reason}`; }
      else if (replacement.length) { source="Replaced by scheduled items"; }
      else if (a.mode === "fixed") {base=a.fixedCents;source="Fixed monthly amount";}
      else if (a.mode === "seasonal" || a.mode === "average") {
        const candidates=doc.history.filter(h=>h.accountId===a.id&&h.month<=s.cutoffMonth&&h.month.slice(5)===month.slice(5)).sort((x,y)=>y.month.localeCompare(x.month));
        const prev = candidates.slice(0,2);
        const available = a.mode === "average" ? prev.filter(Boolean) : prev.slice(0,1).filter(Boolean);
        if (!available.length) warnings.add(`Missing seasonal history for ${a.name}; review zero forecast months.`);
        base = available.length ? Math.round(available.reduce((sum,h)=>sum+h!.amountCents,0)/available.length) : 0;
        source = a.mode === "average" ? "Average of the two most recent matching historical months" : `Matching historical month (${available[0]?.month??"missing"})`;
        base = Math.round(base*(1+a.percentBps/10000))+a.deltaCents;
        if (a.percentBps || a.deltaCents) source+=`; adjustment ${a.percentBps/100}% and ${a.deltaCents/100} dollars`;
      }
    }
    if(scenario==="secured"&&a.kind==="income")base=0;
    if (base) lines.push({id:`baseline:${a.id}:${month}`,date:dateInMonth(month,a.paymentDay),accountId:a.id,account:a.name,kind:a.kind,amountCents:base,fund:a.fund,source,estimated:true});
    for (const e of events) {
      // A month override is the complete replacement total; explicitly additional items remain separate.
      if (override && e.treatment === "replace") continue;
      const amount = scenario === "secured" ? (a.kind === "income" && e.confidence === "estimated" ? 0 : e.expectedCents) : e[`${scenario}Cents`];
      if (!amount) continue;
      lines.push({id:`${e.id}:${month}`,date:e.frequency==="once"?e.date:dateInMonth(month,Number(e.date.slice(8))),accountId:a.id,account:a.name,kind:a.kind,amountCents:amount,fund:e.fund,source:`${e.name}${e.reference ? ` · ${e.reference}` : ""}${e.note ? ` · ${e.note}` : ""}`,estimated:e.confidence==="estimated"});
    }
  }
  lines.sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
  let total = s.openingCents, restricted=s.restrictedCents, designated=s.designatedCents;
  const available = () => total - Math.max(0,restricted)-Math.max(0,designated);
  const openingAvailable = available();
  const daily:ForecastDay[]=[];
  const rows:ForecastMonth[]=[];
  let lowest={date:dateInMonth(s.cutoffMonth,31),amountCents:openingAvailable};
  for (const month of months) {
    const monthLines=lines.filter(l=>l.date.startsWith(month));
    let min=available();
    for(let day=1;day<=Number(dateInMonth(month,31).slice(8));day++) {
      const date=dateInMonth(month,day);
      for(const l of monthLines.filter(l=>l.date===date)) {
        const signed=l.amountCents*(l.kind==="income"?1:-1);
        total+=signed;
        if(l.fund==="restricted") restricted+=signed;
        if(l.fund==="designated") designated+=signed;
      }
      if(restricted<0 || designated<0) warnings.add("A funded payment exceeds its allocated fund balance. Review funding assignments.");
      const av=available(); min=Math.min(min,av);
      if(av<lowest.amountCents) lowest={date,amountCents:av};
      daily.push({date,totalCents:total,availableCents:av});
    }
    rows.push({month,inflowCents:monthLines.filter(l=>l.kind==="income").reduce((n,l)=>n+l.amountCents,0),outflowCents:monthLines.filter(l=>l.kind==="expense").reduce((n,l)=>n+l.amountCents,0),closingCents:total,restrictedCents:Math.max(0,restricted),designatedCents:Math.max(0,designated),availableCents:available(),minimumAvailableCents:min,lines:monthLines});
  }
  const summer=rows.filter(r=>["06","07","08"].includes(r.month.slice(5)));
  const firstSummerYear=summer[0]?.month.slice(0,4);
  const summerDays=daily.filter(d=>d.date.startsWith(firstSummerYear??"none")&&["06","07","08"].includes(d.date.slice(5,7)));
  const summerLow=summerDays.length ? summerDays.reduce((a,d)=>d.availableCents<a.amountCents?{date:d.date,amountCents:d.availableCents}:a,{date:summerDays[0].date,amountCents:summerDays[0].availableCents}) : null;
  const uncertainIncome=lines.filter(l=>l.kind==="income"&&l.estimated&&!l.id.startsWith("baseline:")).reduce((n,l)=>n+l.amountCents,0);
  return {months:rows,lines,daily,lowest,summerLow,openingAvailable,uncertainIncome,warnings:[...warnings]};
}

export function weeklyView(result: ReturnType<typeof project>) {
  const weeks=[];
  for(let i=0;i<Math.min(result.daily.length,91);i+=7) {
    const days=result.daily.slice(i,i+7);
    weeks.push({from:days[0].date,to:days.at(-1)!.date,availableCents:days.at(-1)!.availableCents,minimumCents:Math.min(...days.map(d=>d.availableCents))});
  }
  return weeks;
}
