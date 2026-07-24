import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Send, Utensils } from "lucide-react";
import { fetchPublishedLunchMenus, money, submitStaffLunchOrders } from "../../lib/lunchData.js";

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
  const [data, setData] = useState({ loading: true, menus: [], error: "" });
  const [draft, setDraft] = useState({ menuId: "", selectedItems: {} });
  const [status, setStatus] = useState("");

  async function loadMenus() {
    setData((current) => ({ ...current, loading: true, error: "" }));
    try {
      const result = await fetchPublishedLunchMenus();
      setData({ loading: false, menus: result.menus || [], error: "" });
    } catch (error) {
      setData({ loading: false, menus: [], error: error.message });
    }
  }

  useEffect(() => {
    loadMenus();
  }, []);

  useEffect(() => {
    if (!data.menus.length) return;
    if (draft.menuId && data.menus.some((menu) => menu.id === draft.menuId)) return;
    setDraft((current) => ({ ...current, menuId: data.menus[0].id, selectedItems: {} }));
  }, [data.menus.length, draft.menuId]);

  const activeMenu = data.menus.find((menu) => menu.id === draft.menuId) || data.menus[0] || null;
  const items = (activeMenu?.items || []).map((item) => ({ ...item, menuId: activeMenu.id, itemKey: `${activeMenu.id}:${item.id}` }));
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

  function hasMealForDate(item) {
    return items.some((candidate) =>
      candidate.date === item.date &&
      !candidate.requiresMeal &&
      candidate.itemKey !== item.itemKey &&
      draft.selectedItems[candidate.itemKey]
    );
  }

  function toggleItem(item) {
    if (item.requiresMeal && !hasMealForDate(item)) {
      setStatus("Choose a regular meal for that date before adding this restricted item.");
      return;
    }
    setDraft((current) => ({ ...current, selectedItems: { ...current.selectedItems, [item.itemKey]: !current.selectedItems[item.itemKey] } }));
    setStatus("");
  }

  async function submitOrder() {
    if (!selectedItems.length) {
      setStatus("Choose at least one lunch item first.");
      return;
    }
    setStatus("Submitting staff lunch order...");
    try {
      const result = await submitStaffLunchOrders(selectedItems.map((item) => ({ menuId: item.menuId, itemId: item.id })), currentUserEmail);
      setDraft((current) => ({ ...current, selectedItems: {} }));
      setStatus(result.skippedDuplicates ? "Those lunch choices were already submitted." : `Staff lunch order submitted for ${result.count || selectedItems.length} item(s).`);
    } catch (error) {
      setStatus(`Unable to submit staff lunch order: ${error.message}`);
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
            <select value={activeMenu?.id || ""} onChange={(event) => setDraft({ menuId: event.target.value, selectedItems: {} })} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
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
          {activeMenu && (
            <div className="overflow-x-auto rounded-lg border border-slate-800">
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
                                const checked = Boolean(draft.selectedItems[item.itemKey]);
                                return (
                                  <button key={item.itemKey} type="button" onClick={() => toggleItem(item)} className={`flex w-full items-start gap-2 rounded-md border p-2 text-left text-xs ${checked ? "border-emerald-400 bg-emerald-500/15 text-emerald-50" : "border-slate-800 bg-slate-900 text-slate-300 hover:border-sky-500/50"}`}>
                                    <span className={`mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border ${checked ? "border-emerald-300 bg-emerald-400 text-slate-950" : "border-slate-600"}`}>{checked ? "✓" : ""}</span>
                                    <span><span className="block font-semibold">{item.name}</span>{item.requiresMeal && <span className="block text-amber-200">Requires meal</span>}</span>
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
            Submit Staff Lunch Order
          </button>
          {status && <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 p-3 text-sm text-sky-100">{status}</div>}
          {selectedItems.length > 0 && <div className="flex items-center gap-2 text-xs font-semibold text-emerald-200"><CheckCircle2 size={14} />Expected cost: {money(0)}</div>}
        </div>
      )}
    </div>
  );
}
