import { blankDocument, addMonth, dateInMonth, type ForecastDocument, type Account, type CashEvent } from "./model.ts";
import {draftPlan} from "./board-reports.ts";
export function sampleDocument(): ForecastDocument {
  const doc=blankDocument();
  doc.initialized=true;
  doc.settings={...doc.settings,cutoffMonth:"2026-09",openingCents:29500000,restrictedCents:3500000,designatedCents:2500000,balanceVerified:true,balanceNote:"Illustrative figures only. These are not WVCS financial records."};
  const account=(id:string,name:string,kind:"income"|"expense",mode:Account["mode"]="seasonal"):Account=>({id,name,kind,mode,percentBps:0,deltaCents:0,fixedCents:0,paymentDay:15,fund:"operating",note:""});
  doc.accounts=[account("tuition","Tuition collections","income","schedule"),account("auction","Annual auction","income","schedule"),account("fees","Registration & FOS","income","schedule"),account("other","Preschool, lunch & other income","income"),account("payroll","Payroll, taxes & benefits","expense"),account("facilities","Facilities & utilities","expense"),account("instruction","Instruction & supplies","expense"),account("admin","Insurance & administration","expense"),account("maintenance","Summer maintenance","expense"),account("eventcost","Fundraising expenses","expense","schedule"),account("debt","Debt service","expense","fixed")];
  doc.accounts.find(a=>a.id==="debt")!.fixedCents=420000;
  doc.accounts.find(a=>a.id==="debt")!.cashOnly=true;
  doc.accounts.find(a=>a.id==="facilities")!.percentBps=400;
  doc.accounts.find(a=>a.id==="payroll")!.paymentDay=28;
  for(let i=0;i<24;i++) {
    const month=addMonth("2024-10",i), m=Number(month.slice(5));
    const amounts:Record<string,number>={other:[6,7,8].includes(m)?8500:14000,payroll:m===7?83000:100000,facilities:12500,instruction:m===8?19000:m===6?1500:4800,admin:m===9?18500:6500,maintenance:m===6?16000:m===7?10000:1600};
    for(const [accountId,dollars] of Object.entries(amounts)) doc.history.push({accountId,month,amountCents:Math.round(dollars*100*(i<12?.97:1)),sourceId:"sample-history"});
  }
  const ev=(id:string,name:string,accountId:string,date:string,dollars:number,estimated=false):CashEvent=>({id,name,accountId,date,frequency:"once",expectedCents:dollars*100,cautiousCents:Math.round(dollars*100*(estimated?(accountId==="eventcost"?1.1:.75):1)),optimisticCents:Math.round(dollars*100*(estimated?(accountId==="eventcost"?.95:1.15):1)),confidence:estimated?"estimated":"confirmed",treatment:"replace",fund:"operating",reference:"",note:"Illustrative assumption"});
  for(let i=0;i<18;i++) {
    const month=addMonth("2026-10",i), m=Number(month.slice(5));
    const amount=m===6?45000:m===7?18000:m===8?79000:m===9?155000:125000;
    doc.events.push(ev(`tuition-${month}`,"Scheduled net tuition", "tuition",`${month}-05`,amount));
  }
  doc.events.push(ev("auction-27","Annual auction proceeds","auction","2027-04-20",140000,true),ev("auction-cost","Auction venue & event costs","eventcost","2027-03-20",22000,true),ev("registration","Next-year registration & FOS","fees","2027-05-10",38000,true));
  doc.imports=[{id:"sample-history",filename:"Illustrative monthly financial history",type:"pnl",at:"2026-10-15T12:00:00Z",count:144,months:[...new Set(doc.history.map(h=>h.month))],basis:"Accrual"}];
  doc.actualCoverage=doc.imports[0].months.map(month=>({month,throughDate:dateInMonth(month,31),sourceId:"sample-history"}));
  doc.budgetPlans=Array.from({length:10},(_,i)=>{const month=addMonth("2026-10",i);return{id:`sample-plan-${month}`,month,basis:"Accrual" as const,approvedAt:"2026-09-25T18:00:00Z",reason:"Illustrative approved monthly comparison plan",lines:draftPlan(doc,month)};});
  const actual:Record<string,number>={tuition:83000,other:8000,payroll:62000,facilities:7500,instruction:2000,admin:4200,maintenance:800};
  for(const a of doc.accounts.filter(a=>!a.cashOnly))doc.history.push({accountId:a.id,month:"2026-10",amountCents:(actual[a.id]??0)*100,sourceId:"sample-mtd"});
  doc.actualCoverage.push({month:"2026-10",throughDate:"2026-10-20",sourceId:"sample-mtd"});
  doc.imports.unshift({id:"sample-mtd",filename:"Illustrative October month-to-date P&L",type:"pnl",at:"2026-10-21T18:00:00Z",count:doc.accounts.filter(a=>!a.cashOnly).length,months:["2026-10"],basis:"Accrual"});
  return doc;
}
