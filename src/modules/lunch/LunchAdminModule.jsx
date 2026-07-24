import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, DollarSign, Plus, RefreshCw, Save, Search, Utensils } from "lucide-react";
import {
  createLunchOrder,
  fetchLunchAdminData,
  money,
  recordLunchDeposit,
  saveLunchMenu,
  updateLunchOrderStatus,
} from "../../lib/lunchData.js";

const today = new Date().toISOString().slice(0, 10);

function Field({ label, children }) {
  return (
    <label className="grid gap-1 text-sm font-semibold text-slate-700">
      {label}
      {children}
    </label>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 ${props.className || ""}`}
    />
  );
}

function Select(props) {
  return (
    <select
      {...props}
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 ${props.className || ""}`}
    />
  );
}

function shortDate(value) {
  if (!value) return "";
  return new Date(`${value}T00:00:00`).toLocaleDateString([], { month: "short", day: "numeric" });
}

function emptyItem(date = today) {
  return { id: crypto.randomUUID(), date, name: "", description: "", price: "4.50" };
}

export default function LunchAdminModule({ currentUserEmail = "" }) {
  const [activeView, setActiveView] = useState("daily");
  const [data, setData] = useState({ loading: true, families: [], menus: [], orders: [], accounts: [], transactions: [] });
  const [status, setStatus] = useState("");
  const [date, setDate] = useState(today);
  const [search, setSearch] = useState("");
  const [selectedFamilyKey, setSelectedFamilyKey] = useState("");
  const [selectedStudentId, setSelectedStudentId] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [menuDraft, setMenuDraft] = useState({ title: "WVCS Lunch Menu", weekStart: today, status: "Draft", notes: "", items: [emptyItem(today)] });
  const [deposit, setDeposit] = useState({ familyKey: "", amount: "", method: "cash", checkNumber: "", note: "" });

  async function loadData(message = "") {
    setData((current) => ({ ...current, loading: true }));
    try {
      const result = await fetchLunchAdminData();
      setData({ loading: false, ...result });
      if (message) setStatus(message);
    } catch (error) {
      setData((current) => ({ ...current, loading: false, error: error.message }));
      setStatus(`Unable to load lunch area: ${error.message}`);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const selectedFamily = data.families.find((family) => family.familyKey === selectedFamilyKey) || null;
  const selectedStudent = selectedFamily?.students.find((student) => student.studentId === selectedStudentId) || null;
  const accountMap = useMemo(() => new Map(data.accounts.map((account) => [account.familyKey, account])), [data.accounts]);
  const menuItemsForDate = data.menus
    .filter((menu) => menu.status !== "Closed")
    .flatMap((menu) => (menu.items || []).map((item) => ({ ...item, menuId: menu.id, menuTitle: menu.title })))
    .filter((item) => item.date === date);
  const selectedItem = menuItemsForDate.find((item) => item.id === selectedItemId) || null;
  const dailyOrders = data.orders.filter((order) => order.orderDate === date);
  const filteredFamilies = data.families.filter((family) =>
    `${family.familyName} ${family.parents.map((parent) => `${parent.name} ${parent.email}`).join(" ")} ${family.students.map((student) => `${student.name} ${student.grade}`).join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const accountFamilies = filteredFamilies.map((family) => ({ ...family, account: accountMap.get(family.familyKey) || { balance: 0 } }));

  async function addOrder() {
    if (!selectedFamily || !selectedStudent || !selectedItem) {
      setStatus("Choose a family, student, and lunch item first.");
      return;
    }
    try {
      await createLunchOrder({ family: selectedFamily, student: selectedStudent, item: selectedItem, menuId: selectedItem.menuId }, currentUserEmail);
      setStatus(`Added ${selectedStudent.name} for ${selectedItem.name}.`);
      await loadData();
    } catch (error) {
      setStatus(`Unable to add lunch order: ${error.message}`);
    }
  }

  async function changeOrder(order, nextStatus) {
    try {
      await updateLunchOrderStatus(order, nextStatus, currentUserEmail);
      setStatus(nextStatus === "Served" ? `${order.studentName} was marked served and charged.` : `${order.studentName} was marked ${nextStatus.toLowerCase()}.`);
      await loadData();
    } catch (error) {
      setStatus(`Unable to update lunch order: ${error.message}`);
    }
  }

  async function saveMenuDraft(nextStatus = menuDraft.status) {
    try {
      const saved = await saveLunchMenu({ ...menuDraft, status: nextStatus }, currentUserEmail);
      setMenuDraft(saved);
      setStatus(nextStatus === "Open" ? "Lunch menu saved and opened for family ordering." : "Lunch menu saved.");
      await loadData();
    } catch (error) {
      setStatus(`Unable to save menu: ${error.message}`);
    }
  }

  async function saveDeposit() {
    const family = data.families.find((item) => item.familyKey === deposit.familyKey);
    if (!family) {
      setStatus("Choose a family before recording the deposit.");
      return;
    }
    try {
      await recordLunchDeposit({ family, ...deposit }, currentUserEmail);
      setDeposit({ familyKey: "", amount: "", method: "cash", checkNumber: "", note: "" });
      setStatus("Lunch payment recorded.");
      await loadData();
    } catch (error) {
      setStatus(`Unable to record payment: ${error.message}`);
    }
  }

  return (
    <section className="mx-auto max-w-[1500px] px-5 py-5">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-sky-700">Office & Finance</div>
          <h2 className="mt-1 text-2xl font-bold text-slate-950">Lunch Accounts</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Create digital lunch menus, track anticipated lunches, charge only served lunches, and manage family lunch balances.
          </p>
        </div>
        <button type="button" onClick={() => loadData("Lunch area refreshed.")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-white p-2">
        {[
          ["daily", "Daily Lunch", ClipboardList],
          ["menus", "Menus", Utensils],
          ["accounts", "Accounts", DollarSign],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveView(id)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${activeView === id ? "border-sky-600 bg-sky-600 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"}`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {status && <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900">{status}</div>}
      {data.loading && <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading lunch records...</div>}

      {activeView === "daily" && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Plus size={16} className="text-sky-600" />
              Add Anticipated Lunch
            </div>
            <div className="mt-4 grid gap-3">
              <Field label="Lunch date">
                <Input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
              </Field>
              <Field label="Search family or student">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-2.5 text-slate-400" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Start typing a name..." />
                </div>
              </Field>
              <Field label="Family">
                <Select value={selectedFamilyKey} onChange={(event) => { setSelectedFamilyKey(event.target.value); setSelectedStudentId(""); }}>
                  <option value="">Select family</option>
                  {filteredFamilies.slice(0, 80).map((family) => <option key={family.familyKey} value={family.familyKey}>{family.familyName}</option>)}
                </Select>
              </Field>
              <Field label="Student">
                <Select value={selectedStudentId} onChange={(event) => setSelectedStudentId(event.target.value)} disabled={!selectedFamily}>
                  <option value="">Select student</option>
                  {(selectedFamily?.students || []).map((student) => <option key={student.studentId} value={student.studentId}>{student.name} {student.grade ? `(Grade ${student.grade})` : ""}</option>)}
                </Select>
              </Field>
              <Field label="Lunch item">
                <Select value={selectedItemId} onChange={(event) => setSelectedItemId(event.target.value)}>
                  <option value="">Select item</option>
                  {menuItemsForDate.map((item) => <option key={`${item.menuId}-${item.id}`} value={item.id}>{item.name} - {money(item.price)}</option>)}
                </Select>
              </Field>
              <button type="button" onClick={addOrder} className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700">
                <Plus size={16} />
                Add Lunch
              </button>
            </div>
            {!menuItemsForDate.length && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No open menu items exist for this date yet.</div>}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-slate-950">Lunch Log for {shortDate(date)}</div>
                <div className="text-xs text-slate-500">{dailyOrders.filter((order) => order.status === "Served").length} served | {dailyOrders.filter((order) => order.status === "Anticipated").length} anticipated</div>
              </div>
              <div className="text-sm font-bold text-slate-900">Served total: {money(dailyOrders.filter((order) => order.status === "Served").reduce((sum, order) => sum + order.price, 0))}</div>
            </div>
            <div className="mt-3 overflow-hidden rounded-lg border border-slate-200">
              {dailyOrders.map((order) => (
                <div key={order.id} className="grid gap-2 border-b border-slate-200 px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[1fr_1fr_95px_260px] lg:items-center">
                  <div>
                    <div className="font-bold text-slate-950">{order.studentName}</div>
                    <div className="text-xs text-slate-500">{order.familyName} {order.studentGrade ? `| Grade ${order.studentGrade}` : ""}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800">{order.itemName}</div>
                    <div className="text-xs text-slate-500">{order.source} | {money(order.price)}</div>
                  </div>
                  <div className={`font-bold ${order.status === "Served" ? "text-emerald-700" : order.status === "Absent" ? "text-amber-700" : "text-slate-700"}`}>{order.status}</div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    <button type="button" onClick={() => changeOrder(order, "Served")} disabled={order.status === "Served"} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-800 disabled:opacity-50">Served</button>
                    <button type="button" onClick={() => changeOrder(order, "Absent")} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">Absent</button>
                    <button type="button" onClick={() => changeOrder(order, "Cancelled")} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">Cancel</button>
                  </div>
                </div>
              ))}
              {!dailyOrders.length && <div className="p-5 text-sm text-slate-500">No lunches are listed for this date yet.</div>}
            </div>
          </div>
        </div>
      )}

      {activeView === "menus" && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_380px]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
              <Utensils size={16} className="text-sky-600" />
              Digital Lunch Menu
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field label="Menu title"><Input value={menuDraft.title} onChange={(event) => setMenuDraft({ ...menuDraft, title: event.target.value })} /></Field>
              <Field label="Week / menu start"><Input type="date" value={menuDraft.weekStart} onChange={(event) => setMenuDraft({ ...menuDraft, weekStart: event.target.value })} /></Field>
              <Field label="Status"><Select value={menuDraft.status} onChange={(event) => setMenuDraft({ ...menuDraft, status: event.target.value })}><option>Draft</option><option>Open</option><option>Closed</option></Select></Field>
              <div className="md:col-span-3"><Field label="Family note"><Input value={menuDraft.notes} onChange={(event) => setMenuDraft({ ...menuDraft, notes: event.target.value })} placeholder="Optional note about allergies, due dates, or proceeds" /></Field></div>
            </div>
            <div className="mt-4 space-y-2">
              {menuDraft.items.map((item, index) => (
                <div key={item.id} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 md:grid-cols-[145px_1fr_1fr_95px_44px]">
                  <Input type="date" value={item.date} onChange={(event) => setMenuDraft({ ...menuDraft, items: menuDraft.items.map((row) => row.id === item.id ? { ...row, date: event.target.value } : row) })} />
                  <Input value={item.name} onChange={(event) => setMenuDraft({ ...menuDraft, items: menuDraft.items.map((row) => row.id === item.id ? { ...row, name: event.target.value } : row) })} placeholder="Lunch choice" />
                  <Input value={item.description} onChange={(event) => setMenuDraft({ ...menuDraft, items: menuDraft.items.map((row) => row.id === item.id ? { ...row, description: event.target.value } : row) })} placeholder="Description" />
                  <Input inputMode="decimal" value={item.price} onChange={(event) => setMenuDraft({ ...menuDraft, items: menuDraft.items.map((row) => row.id === item.id ? { ...row, price: event.target.value } : row) })} placeholder="4.50" />
                  <button type="button" onClick={() => setMenuDraft({ ...menuDraft, items: menuDraft.items.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-lg border border-slate-300 bg-white text-sm font-bold text-slate-600">x</button>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => setMenuDraft({ ...menuDraft, items: [...menuDraft.items, emptyItem(menuDraft.weekStart || today)] })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={16} />Add Item</button>
              <button type="button" onClick={() => saveMenuDraft(menuDraft.status)} className="inline-flex items-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white"><Save size={16} />Save Menu</button>
              <button type="button" onClick={() => saveMenuDraft("Open")} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-bold text-white"><CheckCircle2 size={16} />Save & Open</button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-bold text-slate-950">Saved Menus</div>
            <div className="mt-3 space-y-2">
              {data.menus.map((menu) => (
                <button key={menu.id} type="button" onClick={() => setMenuDraft(menu)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <div className="font-bold text-slate-950">{menu.title}</div>
                  <div className="text-xs text-slate-500">{menu.status} | {shortDate(menu.weekStart)} | {(menu.items || []).length} items</div>
                </button>
              ))}
              {!data.menus.length && <div className="text-sm text-slate-500">No menus have been saved yet.</div>}
            </div>
          </div>
        </div>
      )}

      {activeView === "accounts" && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-bold text-slate-950">Record Lunch Payment</div>
            <div className="mt-4 grid gap-3">
              <Field label="Family"><Select value={deposit.familyKey} onChange={(event) => setDeposit({ ...deposit, familyKey: event.target.value })}><option value="">Select family</option>{data.families.map((family) => <option key={family.familyKey} value={family.familyKey}>{family.familyName}</option>)}</Select></Field>
              <Field label="Amount"><Input inputMode="decimal" value={deposit.amount} onChange={(event) => setDeposit({ ...deposit, amount: event.target.value })} placeholder="25.00" /></Field>
              <Field label="Method"><Select value={deposit.method} onChange={(event) => setDeposit({ ...deposit, method: event.target.value })}><option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="adjustment">Adjustment</option></Select></Field>
              {deposit.method === "check" && <Field label="Check number"><Input value={deposit.checkNumber} onChange={(event) => setDeposit({ ...deposit, checkNumber: event.target.value })} /></Field>}
              <Field label="Note"><Input value={deposit.note} onChange={(event) => setDeposit({ ...deposit, note: event.target.value })} placeholder="Optional" /></Field>
              <button type="button" onClick={saveDeposit} className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-bold text-white">Record Payment</button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <Field label="Search accounts"><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Family, parent, or student" /></Field>
            <div className="mt-3 max-h-[540px] overflow-auto rounded-lg border border-slate-200">
              {accountFamilies.map((family) => (
                <div key={family.familyKey} className="grid gap-2 border-b border-slate-200 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[1fr_130px]">
                  <div>
                    <div className="font-bold text-slate-950">{family.familyName}</div>
                    <div className="text-xs text-slate-500">{family.students.map((student) => `${student.name}${student.grade ? ` (${student.grade})` : ""}`).join(", ")}</div>
                  </div>
                  <div className={`font-bold ${Number(family.account.balance || 0) < 0 ? "text-rose-700" : "text-emerald-700"}`}>{money(family.account.balance || 0)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 text-sm font-bold text-slate-950">Recent Lunch Transactions</div>
            <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200">
              {data.transactions.slice(0, 80).map((transaction) => (
                <div key={transaction.id} className="grid gap-2 border-b border-slate-200 px-3 py-2 text-sm last:border-b-0 md:grid-cols-[1fr_100px]">
                  <div><div className="font-semibold text-slate-900">{transaction.familyName}</div><div className="text-xs text-slate-500">{transaction.description}</div></div>
                  <div className={transaction.amount < 0 ? "font-bold text-rose-700" : "font-bold text-emerald-700"}>{money(transaction.amount)}</div>
                </div>
              ))}
              {!data.transactions.length && <div className="p-3 text-sm text-slate-500">No lunch transactions yet.</div>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
