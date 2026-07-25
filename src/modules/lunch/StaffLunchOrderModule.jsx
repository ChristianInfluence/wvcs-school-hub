import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Pencil, Send, Utensils } from "lucide-react";
import { fetchPublishedLunchMenus, money, submitStaffLunchOrders, updateStaffLunchOrders } from "../../lib/lunchData.js";

const today = new Date().toISOString().slice(0, 10);
const weekDays = ["Mon", "Tue", "Wed", "Thu", "Fri"];

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

export default function StaffLunchOrderModule({ currentUserEmail = "", onClose }) {
  const [data, setData] = useState({ loading: true, menus: [], orders: [], error: "" });
  const [draft, setDraft] = useState({ menuId: "", selectedItems: {}, editing: false });
  const [status, setStatus] = useState("");

  async function loadMenus() {
    setData((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await fetchPublishedLunchMenus();
      setData({ loading: false, menus: result.menus || [], orders: result.orders || [], error: "" });
    } catch (error) {
      setData({ loading: false, menus: [], orders: [], error: error.message });
    }
  }

  useEffect(() => {
    loadMenus();
  }, []);

  useEffect(() => {
    if (!data.menus.length) return;
    if (draft.menuId && data.menus.some((menu) => menu.id === draft.menuId)) return;
    setDraft((current) => ({ ...current, menuId: data.menus[0].id, selectedItems: {}, editing: false }));
  }, [data.menus.length, draft.menuId]);

  const activeMenu = data.menus.find((menu) => menu.id === draft.menuId) || data.menus[0] || null;
  const items = (activeMenu?.items || []).map((item) => ({ ...item, menuId: activeMenu.id, itemKey: `${activeMenu.id}:${item.id}` }));
  const activeOrders = (data.orders || []).filter((order) =>
    (order.menu_id || order.menuId) === activeMenu?.id &&
    (order.status || "Anticipated") !== "Cancelled"
  );
  const activeOrderKeys = new Set(activeOrders.map((order) => `${order.order_date || order.orderDate}:${order.item_name || order.itemName}`));
  const futureEditableOrders = activeOrders.filter((order) =>
    String(order.order_date || order.orderDate || "") >= today &&
    (order.status || "Anticipated") === "Anticipated" &&
    !(order.charged_at || order.chargedAt)
  );
  const itemsByDate = useMemo(() => {
    const map = new Map();
    items.forEach((item) => {
      if (!item.date) return;
      map.set(item.date, [...(map.get(item.date) || []), item]);
    });
    return map;
  }, [items]);
  const selectedItems = items.filter((item) => draft.selectedItems[item.itemKey]);
  const monthCells = buildSchoolMonthDays(activeMenu?.week_start || activeMenu?.weekStart || today);
  const submittedMonthLabel = activeMenu ? monthName(activeMenu.week_start || activeMenu.weekStart) : "";

  function hasMealForDate(item) {
    return items.some((candidate) =>
      candidate.date === item.date &&
      !candidate.requiresMeal &&
      candidate.itemKey !== item.itemKey &&
      draft.selectedItems[candidate.itemKey]
    );
  }

  function toggleItem(item) {
    if (String(item.date || "") < today) {
      setStatus("Past lunch dates can no longer be edited.");
      return;
    }
    if (item.requiresMeal && !hasMealForDate(item)) {
      setStatus("Choose a regular meal for that date before adding this restricted item.");
      return;
    }
    setDraft((current) => ({ ...current, selectedItems: { ...current.selectedItems, [item.itemKey]: !current.selectedItems[item.itemKey] } }));
    setStatus("");
  }

  function startEdit() {
    const selectedItemsByKey = {};
    items.forEach((item) => {
      if (String(item.date || "") >= today && activeOrderKeys.has(`${item.date}:${item.name}`)) {
        selectedItemsByKey[item.itemKey] = true;
      }
    });
    setDraft((current) => ({ ...current, selectedItems: selectedItemsByKey, editing: true }));
    setStatus("Editing your staff lunch order. Past dates are locked.");
  }

  async function submitOrder() {
    if (!draft.editing && !selectedItems.length) {
      setStatus("Choose at least one lunch item first.");
      return;
    }
    setStatus(draft.editing ? "Saving staff lunch changes..." : "Submitting staff lunch order...");
    try {
      if (draft.editing) {
        const result = await updateStaffLunchOrders({
          menuId: activeMenu.id,
          orders: selectedItems.map((item) => ({ itemId: item.id })),
        }, currentUserEmail);
        await loadMenus();
        setDraft((current) => ({ ...current, selectedItems: {}, editing: false }));
        setStatus(`Staff lunch order updated. Added ${result.added || 0} and removed ${result.removed || 0} future item(s).`);
      } else {
        const result = await submitStaffLunchOrders(selectedItems.map((item) => ({ menuId: item.menuId, itemId: item.id })), currentUserEmail);
        await loadMenus();
        setDraft((current) => ({ ...current, selectedItems: {}, editing: false }));
        setStatus(result.skippedDuplicates ? "Those lunch choices were already submitted." : `Staff lunch order submitted for ${result.count || selectedItems.length} item(s).`);
      }
    } catch (error) {
      setStatus(`Unable to ${draft.editing ? "update" : "submit"} staff lunch order: ${error.message}`);
    }
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <Utensils size={16} className="text-sky-300" />
            Staff Lunch Order
          </div>
          <div className="mt-1 text-xs text-slate-500">Staff lunches are recorded at no charge.</div>
        </div>
        {onClose && (
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">
            Close
          </button>
        )}
      </div>
      {data.loading && <div className="mt-4 text-sm text-slate-400">Loading published lunch menus...</div>}
      {data.error && <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-100">{data.error}</div>}
      {!data.loading && !data.error && (
        <div className="mt-4 grid gap-3">
          {data.menus.length > 1 && (
            <select value={activeMenu?.id || ""} onChange={(event) => setDraft({ menuId: event.target.value, selectedItems: {}, editing: false })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              {data.menus.map((menu) => <option key={menu.id} value={menu.id}>{menu.title}</option>)}
            </select>
          )}
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-white">{activeMenu?.title || "No published menu"}</div>
                <div className="text-xs text-slate-500">{activeMenu ? monthName(activeMenu.week_start || activeMenu.weekStart) : "Ask the office to publish a menu."}</div>
              </div>
              <div className="text-right text-xs font-bold text-emerald-200">{selectedItems.length} selected</div>
            </div>
          </div>
          {activeMenu && activeOrders.length > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-bold text-emerald-50">{submittedMonthLabel} Lunch Menu submitted</div>
                  <div className="mt-1 text-xs text-emerald-100/80">
                    {activeOrders.length} item(s) submitted for {currentUserEmail || "your staff account"}.
                    {futureEditableOrders.length ? ` ${futureEditableOrders.length} future item(s) can still be edited.` : " No future editable items remain."}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={startEdit}
                  disabled={!futureEditableOrders.length}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil size={14} />
                  Edit Order
                </button>
              </div>
            </div>
          )}
          {activeMenu && items.length > 0 && (
            <div className="grid gap-2 md:hidden">
              {monthCells.filter(Boolean).map((cellDate) => {
                const cellIso = isoDate(cellDate);
                const dayItems = itemsByDate.get(cellIso) || [];
                const hasSelected = dayItems.some((item) => {
                  const lockedPast = draft.editing && String(item.date || "") < today && activeOrderKeys.has(`${item.date}:${item.name}`);
                  return lockedPast || Boolean(draft.selectedItems[item.itemKey]);
                });
                return (
                  <div key={`mobile-${cellIso}`} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-bold text-white">
                          {cellDate.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-500">{dayItems.length ? `${dayItems.length} option${dayItems.length === 1 ? "" : "s"}` : "No lunch offered"}</div>
                      </div>
                      {hasSelected && (
                        <span className="rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-1 text-[11px] font-bold text-emerald-100">
                          Selected
                        </span>
                      )}
                    </div>
                    <div className="mt-3 grid gap-2">
                      {dayItems.map((item) => {
                        const lockedPast = draft.editing && String(item.date || "") < today && activeOrderKeys.has(`${item.date}:${item.name}`);
                        const checked = lockedPast || Boolean(draft.selectedItems[item.itemKey]);
                        return (
                          <button
                            key={item.itemKey}
                            type="button"
                            onClick={() => toggleItem(item)}
                            disabled={lockedPast}
                            className={`flex min-h-14 w-full items-center gap-3 rounded-lg border p-3 text-left text-sm disabled:cursor-not-allowed ${
                              checked ? "border-emerald-400 bg-emerald-500/15 text-emerald-50" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/50"
                            } ${lockedPast ? "opacity-75" : ""}`}
                          >
                            <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? "border-emerald-300 bg-emerald-400 text-slate-950" : "border-slate-600"}`}>
                              {checked ? "✓" : ""}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-bold">{item.name}</span>
                              <span className="block text-xs text-slate-500">{item.requiresMeal ? "Requires meal" : "Staff lunch"}{lockedPast ? " | Locked" : ""}</span>
                            </span>
                          </button>
                        );
                      })}
                      {!dayItems.length && <div className="rounded-lg border border-dashed border-slate-800 p-3 text-center text-sm text-slate-600">No lunch</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {activeMenu && (
            <div className="hidden overflow-x-auto rounded-lg border border-slate-800 md:block">
              <div className="min-w-[900px]">
                <div className="grid grid-cols-5 border-b border-slate-800 bg-slate-950 text-center text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  {weekDays.map((day) => <div key={day} className="border-r border-slate-800 px-2 py-2 last:border-r-0">{day}</div>)}
                </div>
                <div className="grid grid-cols-5">
                  {monthCells.map((cellDate, index) => {
                    const cellIso = cellDate ? isoDate(cellDate) : "";
                    const dayItems = cellIso ? itemsByDate.get(cellIso) || [] : [];
                    return (
                      <div key={cellIso || `blank-${index}`} className="min-h-36 border-r border-b border-slate-800 bg-slate-950 p-2 last:border-r-0">
                        {cellDate ? (
                          <>
                            <div className="text-sm font-bold text-slate-200">{cellDate.getDate()}</div>
                            <div className="mt-2 space-y-2">
                              {dayItems.map((item) => {
                                const lockedPast = draft.editing && String(item.date || "") < today && activeOrderKeys.has(`${item.date}:${item.name}`);
                                const checked = lockedPast || Boolean(draft.selectedItems[item.itemKey]);
                                return (
                                  <button
                                    key={item.itemKey}
                                    type="button"
                                    onClick={() => toggleItem(item)}
                                    disabled={lockedPast}
                                    className={`flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs disabled:cursor-not-allowed ${checked ? "border-emerald-400 bg-emerald-500/15 text-emerald-50" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/50"} ${lockedPast ? "opacity-75" : ""}`}
                                  >
                                    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-emerald-300 bg-emerald-400 text-slate-950" : "border-slate-600"}`}>{checked ? "✓" : ""}</span>
                                    <span><span className="block font-semibold">{item.name}</span>{item.requiresMeal && <span className="block text-amber-200">Requires meal</span>}{lockedPast && <span className="block text-slate-400">Locked</span>}</span>
                                  </button>
                                );
                              })}
                              {!dayItems.length && <div className="rounded-md border border-dashed border-slate-800 p-2 text-center text-xs text-slate-600">No lunch</div>}
                            </div>
                          </>
                        ) : <div className="h-full rounded-md bg-slate-900/60" />}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          <button type="button" onClick={submitOrder} className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-500/20">
            <Send size={16} />
            {draft.editing ? "Save Staff Lunch Edits" : "Submit Staff Lunch Order"}
          </button>
          {status && <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{status}</div>}
          {selectedItems.length > 0 && <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><CheckCircle2 size={14} />Expected cost: {money(0)}</div>}
        </div>
      )}
    </div>
  );
}
