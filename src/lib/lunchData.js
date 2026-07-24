import { fetchOfficeFamilyDirectory } from "./tuitionBillingData.js";
import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const LUNCH_ORDER_STATUSES = ["Anticipated", "Served", "Absent", "Cancelled"];

export function money(value) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(value || 0));
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function mapMenu(row) {
  return {
    id: row.id,
    title: row.title || "",
    weekStart: row.week_start || "",
    status: row.status || "Draft",
    notes: row.notes || "",
    items: Array.isArray(row.items) ? row.items : [],
    updatedAt: row.updated_at || "",
  };
}

function mapOrder(row) {
  return {
    id: row.id,
    menuId: row.menu_id || "",
    familyKey: row.family_key || "",
    familyName: row.family_name || "",
    studentId: row.student_id || "",
    studentName: row.student_name || "",
    studentGrade: row.student_grade || "",
    orderDate: row.order_date || "",
    itemName: row.item_name || "",
    itemDescription: row.item_description || "",
    price: Number(row.price || 0),
    source: row.source || "Office",
    status: row.status || "Anticipated",
    servedAt: row.served_at || "",
    chargedAt: row.charged_at || "",
    createdAt: row.created_at || "",
  };
}

function mapAccount(row) {
  return {
    familyKey: row.family_key || "",
    familyName: row.family_name || "",
    balance: Number(row.balance || 0),
    updatedAt: row.updated_at || "",
  };
}

function mapTransaction(row) {
  return {
    id: row.id,
    familyKey: row.family_key || "",
    familyName: row.family_name || "",
    studentName: row.student_name || "",
    orderId: row.order_id || "",
    type: row.type || "",
    amount: Number(row.amount || 0),
    description: row.description || "",
    paymentMethod: row.payment_method || "",
    checkNumber: row.check_number || "",
    processingFee: Number(row.stripe_processing_fee || 0),
    netAmount: Number(row.stripe_net_amount || 0),
    createdAt: row.created_at || "",
  };
}

function normalizeMenu(menu, currentUserEmail = "") {
  const id = menu.id || crypto.randomUUID();
  return {
    id,
    title: menu.title || "Lunch Menu",
    week_start: menu.weekStart || todayIso(),
    status: menu.status || "Draft",
    notes: menu.notes || "",
    items: (menu.items || []).filter((item) => item.date && item.name).map((item) => ({
      id: item.id || crypto.randomUUID(),
      date: item.date,
      name: item.name,
      description: item.description || "",
      price: Number(item.price || 0),
      requiresMeal: Boolean(item.requiresMeal),
    })),
    updated_by_email: currentUserEmail || null,
    updated_at: new Date().toISOString(),
  };
}

export async function fetchLunchAdminData() {
  const directory = await fetchOfficeFamilyDirectory();
  if (!isSupabaseConfigured) {
    return { loaded: false, families: directory.families || [], menus: [], orders: [], accounts: [], transactions: [], reason: "Supabase is not configured." };
  }

  const [{ data: menus, error: menuError }, { data: orders, error: orderError }, { data: accounts, error: accountError }, { data: transactions, error: transactionError }] =
    await Promise.all([
      supabase.from("lunch_menus").select("*").order("week_start", { ascending: false }).order("updated_at", { ascending: false }),
      supabase.from("lunch_orders").select("*").order("order_date", { ascending: false }).order("created_at", { ascending: false }).limit(500),
      supabase.from("lunch_accounts").select("*").order("family_name", { ascending: true }),
      supabase.from("lunch_transactions").select("*").order("created_at", { ascending: false }).limit(250),
    ]);

  if (menuError) throw menuError;
  if (orderError) throw orderError;
  if (accountError) throw accountError;
  if (transactionError) throw transactionError;

  return {
    loaded: true,
    families: directory.families || [],
    menus: (menus || []).map(mapMenu),
    orders: (orders || []).map(mapOrder),
    accounts: (accounts || []).map(mapAccount),
    transactions: (transactions || []).map(mapTransaction),
  };
}

export async function saveLunchMenu(menu, currentUserEmail = "") {
  const row = normalizeMenu(menu, currentUserEmail);
  if (!row.items.length) throw new Error("Add at least one lunch item before saving the menu.");

  const { data, error } = await supabase
    .from("lunch_menus")
    .upsert({ ...row, created_by_email: currentUserEmail || null }, { onConflict: "id" })
    .select("*")
    .single();
  if (error) throw error;
  return mapMenu(data);
}

async function upsertAccountBalance({ familyKey, familyName, delta, currentUserEmail }) {
  const { data: existing, error: selectError } = await supabase
    .from("lunch_accounts")
    .select("*")
    .eq("family_key", familyKey)
    .maybeSingle();
  if (selectError) throw selectError;
  const nextBalance = Number(existing?.balance || 0) + Number(delta || 0);
  const { data, error } = await supabase
    .from("lunch_accounts")
    .upsert({
      family_key: familyKey,
      family_name: familyName,
      balance: nextBalance,
      updated_by_email: currentUserEmail || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "family_key" })
    .select("*")
    .single();
  if (error) throw error;
  return mapAccount(data);
}

export async function createLunchOrder({ family, student, item, menuId = "", source = "Office" }, currentUserEmail = "") {
  const { data, error } = await supabase
    .from("lunch_orders")
    .insert({
      menu_id: menuId || null,
      family_key: family.familyKey,
      family_name: family.familyName,
      student_id: student.studentId || student.id || null,
      student_name: student.name,
      student_grade: student.grade || "",
      order_date: item.date,
      item_name: item.name,
      item_description: item.description || "",
      price: Number(item.price || 0),
      source,
      status: "Anticipated",
      created_by_email: currentUserEmail || null,
      updated_by_email: currentUserEmail || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapOrder(data);
}

export async function updateLunchOrderStatus(order, status, currentUserEmail = "") {
  const updates = { status, updated_by_email: currentUserEmail || null, updated_at: new Date().toISOString() };
  if (status === "Served") updates.served_at = new Date().toISOString();

  if (status === "Served" && !order.chargedAt) {
    updates.charged_at = new Date().toISOString();
    const { error: transactionError } = await supabase.from("lunch_transactions").insert({
      family_key: order.familyKey,
      family_name: order.familyName,
      student_id: order.studentId || null,
      student_name: order.studentName,
      order_id: order.id,
      type: "charge",
      amount: -Math.abs(Number(order.price || 0)),
      description: `${order.studentName} lunch: ${order.itemName}`,
      created_by_email: currentUserEmail || null,
    });
    if (transactionError) throw transactionError;
    await upsertAccountBalance({ familyKey: order.familyKey, familyName: order.familyName, delta: -Math.abs(Number(order.price || 0)), currentUserEmail });
  }

  const { data, error } = await supabase
    .from("lunch_orders")
    .update(updates)
    .eq("id", order.id)
    .select("*")
    .single();
  if (error) throw error;
  return mapOrder(data);
}

export async function deleteLunchOrder(order, currentUserEmail = "") {
  if (order.status === "Served" && order.chargedAt && Number(order.price || 0) > 0) {
    const { error: reversalError } = await supabase.from("lunch_transactions").insert({
      family_key: order.familyKey,
      family_name: order.familyName,
      student_id: order.studentId || null,
      student_name: order.studentName,
      order_id: order.id,
      type: "adjustment",
      amount: Math.abs(Number(order.price || 0)),
      description: `Reversal for deleted lunch order: ${order.studentName} ${order.itemName}`,
      created_by_email: currentUserEmail || null,
    });
    if (reversalError) throw reversalError;
    await upsertAccountBalance({ familyKey: order.familyKey, familyName: order.familyName, delta: Math.abs(Number(order.price || 0)), currentUserEmail });
  }

  const { error } = await supabase.from("lunch_orders").delete().eq("id", order.id);
  if (error) throw error;
  return { deleted: true };
}

export async function fetchPublishedLunchMenus() {
  if (!isSupabaseConfigured) return { loaded: false, menus: [], reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("get-staff-lunch-menus", { body: {} });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || { loaded: false, menus: [] };
}

export async function submitStaffLunchOrders(orders, currentUserEmail = "") {
  if (!isSupabaseConfigured) return { submitted: false, reason: "Supabase is not configured." };
  const { data, error } = await supabase.functions.invoke("submit-staff-lunch-order", {
    body: { orders, currentUserEmail },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data || { submitted: false };
}

export async function recordLunchDeposit({ family, amount, method = "cash", checkNumber = "", note = "" }, currentUserEmail = "") {
  const cleanAmount = Math.abs(Number(amount || 0));
  if (!cleanAmount) throw new Error("Enter a deposit amount.");
  if (method === "check" && !checkNumber.trim()) throw new Error("Enter the check number.");
  const { error } = await supabase.from("lunch_transactions").insert({
    family_key: family.familyKey,
    family_name: family.familyName,
    type: "deposit",
    amount: cleanAmount,
    description: note || `Lunch account deposit (${method})`,
    payment_method: method,
    check_number: method === "check" ? checkNumber.trim() : null,
    created_by_email: currentUserEmail || null,
  });
  if (error) throw error;
  return upsertAccountBalance({ familyKey: family.familyKey, familyName: family.familyName, delta: cleanAmount, currentUserEmail });
}
