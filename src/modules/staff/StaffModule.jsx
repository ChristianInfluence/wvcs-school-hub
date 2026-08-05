import { useState } from "react";
import { BriefcaseBusiness, ChevronDown } from "lucide-react";
import StaffContractsModule from "../staffContracts/StaffContractsModule.jsx";
import CurriculumModule from "./CurriculumModule.jsx";
import StaffPayrollModule from "./StaffPayrollModule.jsx";
import { STAFF_CONTRACT_ADMIN_EMAIL } from "../../lib/staffContractsData.js";

export default function StaffModule({ currentUserEmail = "" }) {
  const isAllowed = currentUserEmail.toLowerCase() === STAFF_CONTRACT_ADMIN_EMAIL;
  const [view, setView] = useState("contracts");
  const [contractSeed, setContractSeed] = useState(null);

  function createContractFromPayroll(seed) {
    setContractSeed({ ...seed, nonce: Date.now() });
    setView("contracts");
  }

  if (!isAllowed) {
    return (
      <section className="mx-auto max-w-3xl px-5 py-8">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">This staff area is private.</div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-[1650px] px-5 py-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
        <div className="flex items-center gap-2 text-lg font-bold text-white">
          <BriefcaseBusiness size={20} className="text-sky-300" />
          Staff
        </div>
        <label className="relative">
          <span className="sr-only">Staff area</span>
          <select
            value={view}
            onChange={(event) => setView(event.target.value)}
            className="appearance-none rounded-lg border border-slate-700 bg-slate-950 py-2 pl-3 pr-9 text-sm font-bold text-white outline-none focus:border-sky-400"
          >
            <option value="contracts">Staff Contracts</option>
            <option value="payroll">Staff Payroll</option>
            <option value="curriculum">Curriculum</option>
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        </label>
      </div>

      {view === "contracts" && <StaffContractsModule currentUserEmail={currentUserEmail} payrollContractSeed={contractSeed} />}
      {view === "payroll" && <StaffPayrollModule currentUserEmail={currentUserEmail} onCreateContractFromPayroll={createContractFromPayroll} />}
      {view === "curriculum" && <CurriculumModule currentUserEmail={currentUserEmail} />}
    </section>
  );
}
