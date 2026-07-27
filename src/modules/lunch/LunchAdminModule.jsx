import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardList, DollarSign, Plus, RefreshCw, Save, Search, Trash2, Utensils } from "lucide-react";
import {
  createLunchOrder,
  deleteLunchOrder,
  fetchLunchAdminData,
  money,
  recordLunchBeginningBalance,
  recordLunchDeposit,
  saveLunchMenu,
  updateLunchOrderStatus,
} from "../../lib/lunchData.js";

const today = new Date().toISOString().slice(0, 10);
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const OFFICE_QUICK_LUNCH_ITEMS = [
  { id: "office-cup-of-noodle", name: "Cup of Noodle", price: 0.75, description: "Office quick-add lunch item" },
  { id: "office-corndog-leftovers", name: "Corndog/Leftovers", price: 1.5, description: "Office quick-add lunch item" },
];

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
  return { id: crypto.randomUUID(), date, name: "", description: "", price: "4.50", requiresMeal: false };
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function monthStart(value) {
  const date = value ? new Date(`${value}T00:00:00`) : new Date();
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function monthName(value) {
  return monthStart(value).toLocaleDateString([], { month: "long", year: "numeric" });
}

function buildSchoolMonthDays(value) {
  const start = monthStart(value);
  const days = [];
  const cursor = new Date(start);
  while (cursor.getMonth() === start.getMonth()) {
    const day = cursor.getDay();
    if (day >= 1 && day <= 5) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  const leading = days.length ? days[0].getDay() - 1 : 0;
  const cells = Array.from({ length: leading }, () => null).concat(days);
  while (cells.length % 5 !== 0) cells.push(null);
  return cells;
}

function templateItemsForDate(date, weekIndex) {
  const day = date.getDay();
  const dateIso = isoDate(date);
  if (day === 1) {
    const mondayMeals = [
      "Chicken alfredo, garlic bread, fruit, and veggie",
      "Spaghetti & meatballs, garlic bread, fruit, and salad",
      "Mac & cheese, garlic bread, fruit, and veggie",
      "Chicken alfredo, garlic bread, fruit, and veggie",
    ];
    return [{ id: crypto.randomUUID(), date: dateIso, name: mondayMeals[weekIndex % mondayMeals.length], description: "", price: "4.50" }];
  }
  if (day === 2) {
    return ["2 Soft tacos", "2 Crunchy tacos", "Taco salad and chips"].map((name) => ({ id: crypto.randomUUID(), date: dateIso, name, description: "", price: "4.50" }));
  }
  if (day === 3) {
    const wednesdayMeals = [
      "Sloppy Joes, fruit and veggies",
      "Corn dogs, fruit, and veggies",
      "Pancakes, hash browns, sausage links, and fruit",
      "Sloppy Joes, fruit and veggies",
    ];
    return [{ id: crypto.randomUUID(), date: dateIso, name: wednesdayMeals[weekIndex % wednesdayMeals.length], description: "", price: "4.50" }];
  }
  if (day === 4) {
    return [
      { name: "Loaded potato, fruit", price: "4.50" },
      { name: "Chili, chips, fruit", price: "4.50" },
      { name: "Hot dog, chips, fruit", price: "4.50" },
      { name: "Extra hot dog", price: "1.00", requiresMeal: true },
    ].map((item) => ({ id: crypto.randomUUID(), date: dateIso, name: item.name, description: "", price: item.price, requiresMeal: Boolean(item.requiresMeal) }));
  }
  if (day === 5) {
    return [
      { name: "Pizza, fresh fruit, and veggies", price: "4.50" },
      { name: "Gluten-free pizza", price: "4.50" },
      { name: "Extra slice of pizza", price: "1.50", requiresMeal: true },
    ].map((item) => ({ id: crypto.randomUUID(), date: dateIso, name: item.name, description: "", price: item.price, requiresMeal: Boolean(item.requiresMeal) }));
  }
  return [];
}

function createMonthlyTemplate(value) {
  const cells = buildSchoolMonthDays(value).filter(Boolean);
  return cells.flatMap((date) => templateItemsForDate(date, Math.floor((date.getDate() - 1) / 7)));
}

function officeQuickItemsForDate(value) {
  return OFFICE_QUICK_LUNCH_ITEMS.map((item) => ({
    ...item,
    id: `${item.id}-${value}`,
    date: value,
    menuId: "",
    menuTitle: "Office Quick Add",
    officeOnly: true,
  }));
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
  const [menuDraft, setMenuDraft] = useState({ title: "WVCS Lunch Menu", weekStart: today.slice(0, 8) + "01", status: "Draft", notes: "A portion of lunch proceeds supports WVCS student trips. Please contact the office with food allergy questions.", items: createMonthlyTemplate(today) });
  const [deposit, setDeposit] = useState({ familyKey: "", amount: "", method: "cash", checkNumber: "", note: "" });
  const [carryover, setCarryover] = useState({ familyKey: "", amount: "", schoolYear: "2025-2026", note: "" });
  const [savingMenu, setSavingMenu] = useState(false);

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
  const officeQuickItems = useMemo(() => officeQuickItemsForDate(date), [date]);
  const lunchItemsForDate = useMemo(() => [...menuItemsForDate, ...officeQuickItems], [menuItemsForDate, officeQuickItems]);
  const selectedItem = lunchItemsForDate.find((item) => item.id === selectedItemId) || null;
  const dailyOrders = data.orders.filter((order) => order.orderDate === date);
  const filteredFamilies = data.families.filter((family) =>
    `${family.familyName} ${family.parents.map((parent) => `${parent.name} ${parent.email}`).join(" ")} ${family.students.map((student) => `${student.name} ${student.grade}`).join(" ")}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );
  const accountFamilies = filteredFamilies.map((family) => ({ ...family, account: accountMap.get(family.familyKey) || { balance: 0 } }));
  const menuCalendarCells = buildSchoolMonthDays(menuDraft.weekStart);
  const menuItemsByDate = useMemo(() => {
    const map = new Map();
    (menuDraft.items || []).forEach((item) => {
      if (!item.date) return;
      map.set(item.date, [...(map.get(item.date) || []), item]);
    });
    return map;
  }, [menuDraft.items]);

  function updateMenuItem(itemId, patch) {
    setMenuDraft((current) => ({
      ...current,
      items: current.items.map((item) => item.id === itemId ? { ...item, ...patch } : item),
    }));
  }

  function addItemForDate(itemDate) {
    setMenuDraft((current) => ({ ...current, items: [...current.items, emptyItem(itemDate)] }));
  }

  function removeMenuItem(itemId) {
    setMenuDraft((current) => ({ ...current, items: current.items.filter((item) => item.id !== itemId) }));
  }

  function applyTemplate() {
    const items = createMonthlyTemplate(menuDraft.weekStart);
    setMenuDraft((current) => ({
      ...current,
      title: `${monthName(current.weekStart)} WVCS Lunch Menu`,
      notes: current.notes || "A portion of lunch proceeds supports WVCS student trips. Please contact the office with food allergy questions.",
      items,
    }));
    setStatus("WVCS monthly lunch template loaded. You can edit any day before saving.");
  }

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

  async function removeOrder(order) {
    const reversalNote = order.status === "Served" && order.chargedAt && Number(order.price || 0) > 0
      ? " This lunch was already charged, so deleting it will also reverse the lunch account charge."
      : "";
    if (!window.confirm(`Delete ${order.studentName}'s ${order.itemName} from the lunch list?${reversalNote}`)) return;
    try {
      await deleteLunchOrder(order, currentUserEmail);
      setStatus(`${order.studentName}'s lunch order was deleted.`);
      await loadData();
    } catch (error) {
      setStatus(`Unable to delete lunch order: ${error.message}`);
    }
  }

  async function saveMenuDraft(nextStatus = menuDraft.status) {
    setSavingMenu(true);
    setStatus(nextStatus === "Open" ? "Publishing menu to the family portal..." : "Saving lunch menu...");
    try {
      const saved = await saveLunchMenu({ ...menuDraft, status: nextStatus }, currentUserEmail);
      setMenuDraft(saved);
      setStatus(nextStatus === "Open" ? `${saved.title} is now published to the family portal with ${(saved.items || []).length} lunch choices.` : `${saved.title} saved as ${saved.status.toLowerCase()}.`);
      await loadData();
    } catch (error) {
      setStatus(`Unable to save menu: ${error.message}`);
    } finally {
      setSavingMenu(false);
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

  async function saveCarryover() {
    const family = data.families.find((item) => item.familyKey === carryover.familyKey);
    if (!family) {
      setStatus("Choose a family before recording the carryover balance.");
      return;
    }
    const amount = Number(carryover.amount || 0);
    if (!Number.isFinite(amount) || amount === 0) {
      setStatus("Enter the carryover as a positive credit or a negative amount owed.");
      return;
    }
    const confirmed = window.confirm(
      [
        "Record lunch carryover balance?",
        "",
        `Family: ${family.familyName}`,
        `Amount: ${money(amount)}`,
        amount < 0 ? "This will increase the amount owed by the family." : "This will add credit to the family lunch account.",
      ].join("\n")
    );
    if (!confirmed) return;
    try {
      await recordLunchBeginningBalance({ family, ...carryover }, currentUserEmail);
      setCarryover({ familyKey: "", amount: "", schoolYear: carryover.schoolYear || "2025-2026", note: "" });
      setStatus(`Lunch carryover recorded for ${family.familyName}.`);
      await loadData();
    } catch (error) {
      setStatus(`Unable to record carryover: ${error.message}`);
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
                  <option value="" disabled>Office quick add</option>
                  {officeQuickItems.map((item) => <option key={item.id} value={item.id}>{item.name} - {money(item.price)}</option>)}
                </Select>
              </Field>
              <button type="button" onClick={addOrder} className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700">
                <Plus size={16} />
                Add Lunch
              </button>
            </div>
            {!menuItemsForDate.length && <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No open menu items exist for this date yet. Office quick-add items are still available.</div>}
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
                <div key={order.id} className="grid gap-2 border-b border-slate-200 px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[1fr_1fr_95px_320px] lg:items-center">
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
                    <button type="button" onClick={() => removeOrder(order)} className="inline-flex items-center rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700" aria-label={`Delete ${order.studentName} lunch order`}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!dailyOrders.length && <div className="p-5 text-sm text-slate-500">No lunches are listed for this date yet.</div>}
            </div>
          </div>
        </div>
      )}

      {activeView === "menus" && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-950">
                <Utensils size={16} className="text-sky-600" />
                Monthly Digital Lunch Menu
              </div>
              <div className={`rounded-full px-3 py-1 text-xs font-bold ${menuDraft.status === "Open" ? "bg-emerald-100 text-emerald-800" : menuDraft.status === "Closed" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}`}>
                {menuDraft.status === "Open" ? "Published to Family Portal" : menuDraft.status}
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Field label="Menu title"><Input value={menuDraft.title} onChange={(event) => setMenuDraft({ ...menuDraft, title: event.target.value })} /></Field>
              <Field label="Month"><Input type="month" value={(menuDraft.weekStart || today).slice(0, 7)} onChange={(event) => setMenuDraft({ ...menuDraft, weekStart: `${event.target.value}-01` })} /></Field>
              <Field label="Availability"><Select value={menuDraft.status} onChange={(event) => setMenuDraft({ ...menuDraft, status: event.target.value })}><option value="Draft">Draft - office only</option><option value="Open">Published - visible to families</option><option value="Closed">Closed - no new orders</option></Select></Field>
              <div className="md:col-span-3"><Field label="Family note"><Input value={menuDraft.notes} onChange={(event) => setMenuDraft({ ...menuDraft, notes: event.target.value })} placeholder="Optional note about allergies, due dates, or proceeds" /></Field></div>
            </div>
            <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm leading-6 text-sky-900">
              Published means families can see this menu and submit lunch choices in the family portal. It does not open a preview window.
            </div>

            <div className="mt-4 rounded-lg border border-slate-300 bg-white">
              <div className="grid grid-cols-5 border-b border-slate-300 bg-slate-100 text-center text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                {weekDays.map((day) => <div key={day} className="border-r border-slate-300 px-2 py-2 last:border-r-0">{day}</div>)}
              </div>
              <div className="grid grid-cols-5">
                {menuCalendarCells.map((cellDate, index) => {
                  const cellIso = cellDate ? isoDate(cellDate) : "";
                  const dayItems = cellIso ? menuItemsByDate.get(cellIso) || [] : [];
                  return (
                    <div key={cellIso || `blank-${index}`} className="min-h-48 border-r border-b border-slate-200 bg-white p-2 last:border-r-0">
                      {cellDate ? (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-bold text-slate-900">{cellDate.getDate()}</div>
                            <button type="button" onClick={() => addItemForDate(cellIso)} className="rounded-md border border-slate-300 px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-slate-50">+</button>
                          </div>
                          <div className="mt-2 space-y-2">
                            {dayItems.map((item) => (
                              <div key={item.id} className="rounded-md border border-slate-200 bg-slate-50 p-2">
                                <Input value={item.name} onChange={(event) => updateMenuItem(item.id, { name: event.target.value })} placeholder="Lunch item" className="px-2 py-1 text-xs" />
                                <div className="mt-1 grid grid-cols-[1fr_54px_28px] gap-1">
                                  <Input value={item.description} onChange={(event) => updateMenuItem(item.id, { description: event.target.value })} placeholder="Note" className="px-2 py-1 text-xs" />
                                  <Input inputMode="decimal" value={item.price} onChange={(event) => updateMenuItem(item.id, { price: event.target.value })} placeholder="4.50" className="px-2 py-1 text-xs" />
                                  <button type="button" onClick={() => removeMenuItem(item.id)} className="rounded-md border border-slate-300 bg-white text-xs font-bold text-slate-600">x</button>
                                </div>
                                <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
                                  <input type="checkbox" checked={Boolean(item.requiresMeal)} onChange={(event) => updateMenuItem(item.id, { requiresMeal: event.target.checked })} />
                                  Requires meal
                                </label>
                              </div>
                            ))}
                            {!dayItems.length && <div className="rounded-md border border-dashed border-slate-200 p-2 text-center text-xs text-slate-400">No lunch</div>}
                          </div>
                        </>
                      ) : (
                        <div className="h-full rounded-md bg-slate-50" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={applyTemplate} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={16} />Use WVCS Template</button>
              <button type="button" onClick={() => setMenuDraft({ ...menuDraft, items: [...menuDraft.items, emptyItem(menuDraft.weekStart || today)] })} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Plus size={16} />Add Item by Date</button>
              <button type="button" onClick={() => saveMenuDraft(menuDraft.status)} disabled={savingMenu} aria-busy={savingMenu} className="inline-flex items-center gap-2 rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"><Save size={16} />{savingMenu ? "Saving..." : "Save Draft / Changes"}</button>
              <button type="button" onClick={() => saveMenuDraft("Open")} disabled={savingMenu} aria-busy={savingMenu} className="inline-flex items-center gap-2 rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"><CheckCircle2 size={16} />{savingMenu ? "Publishing..." : "Publish to Family Portal"}</button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="text-sm font-bold text-slate-950">Saved Menus</div>
            <div className="mt-3 space-y-2">
              {data.menus.map((menu) => (
                <button key={menu.id} type="button" onClick={() => setMenuDraft(menu)} className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:bg-slate-100">
                  <div className="font-bold text-slate-950">{menu.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1 text-xs">
                    <span className={`rounded-full px-2 py-0.5 font-bold ${menu.status === "Open" ? "bg-emerald-100 text-emerald-800" : menu.status === "Closed" ? "bg-slate-200 text-slate-700" : "bg-amber-100 text-amber-800"}`}>
                      {menu.status === "Open" ? "Published" : menu.status}
                    </span>
                    <span className="text-slate-500">{shortDate(menu.weekStart)}</span>
                    <span className="text-slate-500">{(menu.items || []).length} items</span>
                  </div>
                </button>
              ))}
              {!data.menus.length && <div className="text-sm text-slate-500">No menus have been saved yet.</div>}
            </div>
          </div>
        </div>
      )}

      {activeView === "accounts" && (
        <div className="mt-5 grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="grid gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-sm font-bold text-slate-950">Record Lunch Payment</div>
              <div className="mt-4 grid gap-3">
                <Field label="Family"><Select value={deposit.familyKey} onChange={(event) => setDeposit({ ...deposit, familyKey: event.target.value })}><option value="">Select family</option>{data.families.map((family) => <option key={family.familyKey} value={family.familyKey}>{family.familyName}</option>)}</Select></Field>
                <Field label="Amount"><Input inputMode="decimal" value={deposit.amount} onChange={(event) => setDeposit({ ...deposit, amount: event.target.value })} placeholder="25.00" /></Field>
                <Field label="Method"><Select value={deposit.method} onChange={(event) => setDeposit({ ...deposit, method: event.target.value })}><option value="cash">Cash</option><option value="check">Check</option><option value="card">Card</option><option value="adjustment">Adjustment</option></Select></Field>
                {deposit.method === "check" && <Field label="Check number"><Input value={deposit.checkNumber} onChange={(event) => setDeposit({ ...deposit, checkNumber: event.target.value })} /></Field>}
                <Field label="Note"><Input value={deposit.note} onChange={(event) => setDeposit({ ...deposit, note: event.target.value })} placeholder="Optional" /></Field>
                <button type="button" onClick={saveDeposit} className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-700">Record Payment</button>
              </div>
            </div>
            <details className="rounded-lg border border-slate-200 bg-white p-4">
              <summary className="cursor-pointer list-none text-sm font-bold text-slate-950 marker:hidden">
                Beginning Balance / Carryover
                <span className="ml-2 text-xs font-semibold text-slate-500">Open only for yearly setup or corrections</span>
              </summary>
              <div className="mt-2 text-xs leading-5 text-slate-500">
                Enter a positive amount for credit. Enter a negative amount for money owed from last year.
              </div>
              <div className="mt-4 grid gap-3">
                <Field label="Family"><Select value={carryover.familyKey} onChange={(event) => setCarryover({ ...carryover, familyKey: event.target.value })}><option value="">Select family</option>{data.families.map((family) => <option key={family.familyKey} value={family.familyKey}>{family.familyName}</option>)}</Select></Field>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <Field label="Carryover amount"><Input inputMode="decimal" value={carryover.amount} onChange={(event) => setCarryover({ ...carryover, amount: event.target.value })} placeholder="-18.75 or 32.50" /></Field>
                  <Field label="From school year"><Input value={carryover.schoolYear} onChange={(event) => setCarryover({ ...carryover, schoolYear: event.target.value })} placeholder="2025-2026" /></Field>
                </div>
                <Field label="Note"><Input value={carryover.note} onChange={(event) => setCarryover({ ...carryover, note: event.target.value })} placeholder="Balance carried over from 2025-2026" /></Field>
                <button type="button" onClick={saveCarryover} className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-bold text-white hover:bg-sky-700">
                  Record Carryover Balance
                </button>
              </div>
            </details>
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
