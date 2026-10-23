import { dollars, dateSchema, monthSchema, documentSchema, dateInMonth, type ForecastDocument, type Account } from "./model.ts";
export type ReportType="pnl"|"balance"|"cashflow"|"tuition";
export type Cell=string|number|null;
export interface ImportPreview {
  type:ReportType; accounts:Account[]; history:ForecastDocument["history"]; cashHistory:ForecastDocument["cashHistory"];
  events:ForecastDocument["events"]; balances:{id:string;name:string;amountCents:number}[];
  months:string[]; warnings:string[]; count:number;
}
const clean=(v:unknown)=>String(v??"").trim();
const key=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,140);
export function parseCsv(text:string):Cell[][] {
  if(text.length>8_000_000) throw new Error("CSV must be smaller than 8 MB");
  const rows:Cell[][]=[]; let row:Cell[]=[],field="",quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') {if(quoted&&text[i+1]==='"'){field+='"';i++;}else if(quoted||!field)quoted=!quoted;else field+=c;}
    else if(!quoted&&(c===","||c==="\n"||c==="\r")) {
      row.push(field);field="";
      if(c!==","){if(c==="\r"&&text[i+1]==="\n")i++;if(row.some(v=>clean(v)))rows.push(row);row=[];}
    } else field+=c;
  }
  if(quoted)throw new Error("Unclosed quote in CSV");
  row.push(field);if(row.some(v=>clean(v)))rows.push(row);
  if(rows.length>20000)throw new Error("Limit imports to 20,000 rows");
  if(rows[0]?.[0])rows[0][0]=clean(rows[0][0]).replace(/^\uFEFF/,"");
  return rows;
}
export function headerMonth(value:unknown):string|null {
  const s=clean(value);
  if(/^\d{4}-\d{2}$/.test(s))return monthSchema.safeParse(s).success?s:null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s.slice(0,7);
  const names=["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const match=s.match(/^([a-zA-Z]+)\.?\s+(\d{4})$/)??s.match(/^([a-zA-Z]+)\.?\s+\d{1,2}\s*[-–]\s*(?:[a-zA-Z]+\s*)?\d{1,2},?\s+(\d{4})$/);
  if(match) {const m=names.indexOf(match[1].slice(0,3).toLowerCase()); if(m>=0)return `${match[2]}-${String(m+1).padStart(2,"0")}`;}
  const numeric=s.match(/^(0?[1-9]|1[0-2])\/(\d{4})$/);
  return numeric?`${numeric[2]}-${numeric[1].padStart(2,"0")}`:null;
}
const newAccount=(name:string,kind:"income"|"expense",id?:string):Account=>({id:id??`import-${kind}-${key(name)}`,name,kind,mode:"seasonal",percentBps:0,deltaCents:0,fixedCents:0,paymentDay:15,fund:"operating",note:""});
function accountFor(doc:ForecastDocument,found:Account[],name:string,kind:"income"|"expense",sourceId?:string) {
  const same=doc.accounts.find(a=>(sourceId&&a.id===sourceId)||(key(a.name)===key(name)&&a.kind===kind))??found.find(a=>key(a.name)===key(name)&&a.kind===kind);
  if(same)return same;
  const a=newAccount(name,kind,sourceId);found.push(a);return a;
}
function empty(type:ReportType):ImportPreview{return{type,accounts:[],history:[],cashHistory:[],events:[],balances:[],months:[],warnings:[],count:0};}
function monthlyColumns(rows:Cell[][]) {
  for(let i=0;i<Math.min(rows.length,35);i++) {
    const cols=rows[i].map((c,index)=>({month:headerMonth(c),index})).filter(c=>c.month) as {month:string,index:number}[];
    if(cols.length) {
      if(new Set(cols.map(c=>c.month)).size!==cols.length)throw new Error("Duplicate monthly columns. Export a monthly report without comparison or percentage columns.");
      return {header:i,cols};
    }
  }
  throw new Error("Monthly columns were not found. Export the report with columns by Month, including the year (for example, July 2026).");
}
export function previewTable(type:ReportType, rows:Cell[][], doc:ForecastDocument):ImportPreview {
  if(rows.length>20000||rows.some(r=>r.length>150))throw new Error("Report is too large. Use up to 20,000 rows and 150 columns.");
  const p=empty(type);
  if(type==="pnl") {
    const {header,cols}=monthlyColumns(rows);let kind:"income"|"expense"|null=null;
    for(const row of rows.slice(header+1)) {
      const name=row.slice(0,cols[0].index).map(clean).filter(Boolean).join(" / ");
      if(!name)continue;
      const n=key(name.replace(/^\d+[\s-]+/,""));
      if(/^(income|revenue|revenues|other-income)$/.test(n)){kind="income";continue;}
      if(/^(expenses|expense|cost-of-goods-sold|cost-of-sales|other-expenses|other-expense)$/.test(n)){kind="expense";continue;}
      if(/^(total|net|gross-profit|operating-income|profit)/.test(n))continue;
      if(!kind||!cols.some(c=>clean(row[c.index])!==""))continue;
      const a=accountFor(doc,p.accounts,name,kind);
      for(const c of cols)p.history.push({accountId:a.id,month:c.month,amountCents:dollars(row[c.index]),sourceId:"pending"});
    }
    p.months=cols.map(c=>c.month);
    if(!p.history.length)throw new Error("No expense or income accounts were found. Include Income and Expenses section headings in the P&L export.");
    if(new Set(p.history.map(h=>h.accountId+":"+h.month)).size!==p.history.length)throw new Error("Repeated account names were found. Use unique account names or import QuickBooks report JSON with account IDs.");
    p.warnings.push("Review account mappings and subtotals. Imported monthly P&L values replace existing P&L history for these months.");
    p.count=p.history.length;
  }
  if(type==="cashflow") {
    const {header,cols}=monthlyColumns(rows);
    const net=rows.slice(header+1).find(r=>/^(net-cash-increase|net-increase|change-in-cash|increase.*cash|cash-increase)/.test(key(r.map(clean).find(Boolean)??"")));
    const end=rows.slice(header+1).find(r=>/^(cash-at-end|cash-and-cash-equivalents-at-end|ending-cash|cash-end)/.test(key(r.map(clean).find(Boolean)??"")));
    if(!net)throw new Error("Could not find Net cash increase (decrease). Include the full Statement of Cash Flows with monthly columns.");
    p.cashHistory=cols.map(c=>({month:c.month,netCents:dollars(net[c.index]),...(end?{endingCents:dollars(end[c.index])}:{}),sourceId:"pending"}));
    p.months=cols.map(c=>c.month);p.count=p.cashHistory.length;
    p.warnings.push("Cash flow history is a reconciliation reference; it is not added to P&L amounts.");
  }
  if(type==="balance") {
    let bank=false;
    for(const row of rows) {
      const name=clean(row.find(v=>clean(v))), n=key(name);
      if(/^(bank-accounts|bank|cash-and-cash-equivalents|cash-and-bank|cash-accounts)$/.test(n)){bank=true;continue;}
      if(bank&&/^(total.*bank|total.*cash-and-cash|accounts-receivable|other-current-assets|fixed-assets|liabilities)/.test(n)){bank=false;continue;}
      if(!bank||/^total/.test(n)||!name)continue;
      const values=row.slice(row.findIndex(v=>clean(v))+1).filter(v=>clean(v)&&/^[$(\-+\d]/.test(clean(v)));
      if(values.length)p.balances.push({id:`bank-${key(name)}`,name,amountCents:dollars(values.at(-1))});
    }
    if(!p.balances.length)throw new Error("Bank account detail was not found. Export the full Balance Sheet with the Bank Accounts section expanded.");
    p.count=p.balances.length;p.warnings.push("Select only the bank accounts included in your cash forecast. Confirm the report date matches the reviewed month in Settings.");
  }
  if(type==="tuition") {
    const hi=rows.findIndex(r=>r.some(c=>key(clean(c))==="date")&&r.some(c=>key(clean(c))==="amount"));
    if(hi<0)throw new Error("Use the tuition template with date, description, amount, and reference columns.");
    const headers=rows[hi].map(c=>key(clean(c)));
    const read=(r:Cell[],k:string)=>clean(r[headers.indexOf(k)]);
    const a=doc.accounts.find(a=>a.kind==="income"&&/tuition/i.test(a.name))??newAccount("Tuition collections","income","tuition");
    if(!doc.accounts.some(x=>x.id===a.id))p.accounts.push({...a,mode:"schedule"});
    if(a.mode!=="schedule")p.warnings.push("Tuition will use scheduled collections after this import, replacing the historical tuition baseline.");
    for(let i=hi+1;i<rows.length;i++) {
      const row=rows[i];if(!row.some(c=>clean(c)))continue;
      const date=read(row,"date"),name=read(row,"description")||"Net tuition collection",reference=read(row,"reference");
      if(!dateSchema.safeParse(date).success)throw new Error(`Row ${i+1}: use YYYY-MM-DD for the collection date.`);
      const amountCents=dollars(read(row,"amount"));if(amountCents<0)throw new Error(`Row ${i+1}: tuition receipts cannot be negative.`);
      const eventId=`tuition-import-${reference?key(reference):key(`${date}-${name}`)}`;
      p.events.push({id:eventId,name,accountId:a.id,date,expectedCents:amountCents,cautiousCents:amountCents,optimisticCents:amountCents,confidence:"confirmed",frequency:"once",treatment:"replace",fund:"operating",reference,note:"Imported net tuition collection schedule. Amounts represent future receipts after discounts and payments received."});
    }
    if(new Set(p.events.map(e=>e.id)).size!==p.events.length)throw new Error("Give every tuition row a unique reference so updates can be matched safely.");
    p.months=[...new Set(p.events.map(e=>e.date.slice(0,7)))];p.count=p.events.length;
    p.warnings.push("Import only remaining expected receipts. Each reference updates its matching collection; existing rows with other references remain.");
  }
  return p;
}

export function previewQbo(type:ReportType, report:any, doc:ForecastDocument):ImportPreview {
  if(!report?.Columns?.Column||!report?.Rows?.Row)throw new Error("This is not a QuickBooks Reports API JSON document.");
  const columns=report.Columns.Column;
  const monthColumns=columns.map((c:any,index:number)=>({index,month:c.MetaData?.find((m:any)=>m.Name==="StartDate")?.Value?.slice(0,7)??headerMonth(c.ColTitle)})).filter((c:any)=>monthSchema.safeParse(c.month).success);
  const p=empty(type);
  const walk=(rows:any[],inherited:"income"|"expense"|null=null,bank=false)=>{
    for(const row of rows) {
      const group=String(row.group??"").toLowerCase();
      let kind=inherited;
      if(["income","otherincome"].includes(group))kind="income";
      if(["expenses","otherexpenses","cogs"].includes(group))kind="expense";
      const isBank=bank||group==="bankaccounts";
      if(row.type==="Data"&&row.ColData?.[0]) {
        const name=clean(row.ColData[0].value);
        if(type==="pnl"&&kind) {
          const a=accountFor(doc,p.accounts,name,kind,row.ColData[0].id?`qbo-${row.ColData[0].id}`:undefined);
          for(const c of monthColumns)p.history.push({accountId:a.id,month:c.month,amountCents:dollars(row.ColData[c.index]?.value),sourceId:"pending"});
        }
        if(type==="balance"&&isBank)p.balances.push({id:row.ColData[0].id??key(name),name,amountCents:dollars(row.ColData.at(-1)?.value)});
      }
      if(row.Rows?.Row)walk(row.Rows.Row,kind,isBank);
    }
  };
  if(type==="cashflow") {
    // Use the same reviewed monthly-summary parser for JSON and file imports.
    const flattened:Cell[][]=[columns.map((c:any,i:number)=>monthColumns.find((m:any)=>m.index===i)?.month??c.ColTitle??"")];
    const flatten=(rows:any[])=>{for(const row of rows){if(row.ColData)flattened.push(row.ColData.map((c:any)=>c.value));if(row.Summary?.ColData)flattened.push(row.Summary.ColData.map((c:any)=>c.value));if(row.Rows?.Row)flatten(row.Rows.Row);}};
    flatten(report.Rows.Row);return previewTable("cashflow",flattened,doc);
  }
  walk(report.Rows.Row);
  p.months=monthColumns.map((c:any)=>c.month);p.count=type==="balance"?p.balances.length:p.history.length;
  if(!p.count)throw new Error("No usable accounts found in this report. Check the report grouping and monthly columns.");
  p.warnings.push(type==="balance"?"Confirm included bank accounts and the report cutoff date before applying balances.":"Review imported accounts. Seasonal rules for new accounts can be adjusted in Expense plan.");
  return p;
}

export function applyImport(doc:ForecastDocument,p:ImportPreview,id:string,filename:string,basis:"Cash"|"Accrual",selectedBanks:string[]=[],actualsThrough?:string):ForecastDocument {
  if(doc.imports.some(i=>i.id===id))throw new Error("This report has already been imported. No data was changed.");
  if(p.type==="pnl"&&doc.history.length&&basis!==doc.settings.basis)throw new Error("Accounting basis differs from existing history. Keep the same basis for comparable monthly history.");
  const next=structuredClone(doc);next.initialized=true;
  next.accounts.push(...p.accounts.filter(a=>!next.accounts.some(x=>x.id===a.id)));
  if(p.type==="pnl") {
    const latest=[...p.months].sort().at(-1)!;
    const through=actualsThrough??dateInMonth(latest,31);
    if(!dateSchema.safeParse(through).success||through.slice(0,7)!==latest)throw new Error("Actuals-through date must fall in the latest imported P&L month.");
    next.settings.basis=basis;
    next.history=next.history.filter(h=>!p.months.includes(h.month));
    next.history.push(...p.history.map(h=>({...h,sourceId:id})));
    next.actualCoverage=next.actualCoverage.filter(c=>!p.months.includes(c.month));
    next.actualCoverage.push(...p.months.map(month=>({month,throughDate:month===latest?through:dateInMonth(month,31),sourceId:id})));
  }
  if(p.type==="cashflow") {
    next.cashHistory=next.cashHistory.filter(h=>!p.months.includes(h.month));
    next.cashHistory.push(...p.cashHistory.map(h=>({...h,sourceId:id})));
  }
  if(p.type==="balance") {
    const banks=p.balances.filter(b=>selectedBanks.includes(b.id));
    if(!banks.length)throw new Error("Select at least one bank account.");
    next.settings.openingCents=banks.reduce((n,b)=>n+b.amountCents,0);
    next.settings.balanceVerified=false;
    next.settings.balanceNote=`${filename}: ${banks.map(b=>b.name).join(", ")}. Confirm date and allocated funds.`;
  }
  if(p.type==="tuition") {
    const eventIds=new Set(p.events.map(e=>e.id));
    next.events=next.events.filter(e=>!eventIds.has(e.id));next.events.push(...p.events);
    const tuitionIds=new Set(p.events.map(e=>e.accountId));
    next.accounts=next.accounts.map(a=>tuitionIds.has(a.id)?{...a,mode:"schedule"}:a);
  }
  next.imports.unshift({id,filename,type:p.type,at:new Date().toISOString(),count:p.count,months:p.months,basis});
  return documentSchema.parse(next);
}
