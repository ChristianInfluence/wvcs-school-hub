import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function moneyNumber(value: unknown) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return 0;
  return Math.round(amount * 100) / 100;
}

function normalizeStatus(value: unknown) {
  const status = String(value || "").trim().toLowerCase();
  if (status === "served") return "Served";
  if (status === "absent") return "Absent";
  if (status === "cancelled" || status === "canceled") return "Cancelled";
  if (status === "anticipated") return "Anticipated";
  throw new Error("Unsupported lunch status.");
}

function mapFamilies(rows: Record<string, any>[]) {
  const families = new Map<string, Record<string, any>>();
  rows.forEach((row) => {
    const familyKey = String(row.family_key || row.student_last_name || "Family");
    const family = families.get(familyKey) || {
      familyKey,
      familyName: row.family_name || `${row.student_last_name || "Family"} Family`,
      parents: [],
      students: [],
    };
    family.students.push({
      studentId: row.student_id,
      name: [row.student_first_name, row.student_last_name].filter(Boolean).join(" "),
      grade: row.grade || "",
    });
    families.set(familyKey, family);
  });
  return [...families.values()].sort((a, b) => a.familyName.localeCompare(b.familyName, undefined, { sensitivity: "base" }));
}

async function requireHubUser(request: Request, supabase: ReturnType<typeof createClient>) {
  const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!jwt) throw new Error("Please sign in before opening the lunch log.");

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError) throw userError;
  const email = String(userData?.user?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Please sign in before opening the lunch log.");

  const { data: staff, error: staffError } = await supabase
    .from("staff_access")
    .select("email, can_use_hub")
    .eq("email", email)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff?.can_use_hub) throw new Error("This email is not approved for Hub access.");
  return email;
}

async function loadDailyLunchData(supabase: ReturnType<typeof createClient>) {
  const [{ data: directory, error: directoryError }, { data: menus, error: menuError }, { data: orders, error: orderError }] = await Promise.all([
    supabase
      .from("student_directory")
      .select("student_id,grade,student_first_name,student_last_name,email1,email2")
      .eq("active", true)
      .order("student_last_name", { ascending: true })
      .order("student_first_name", { ascending: true }),
    supabase
      .from("lunch_menus")
      .select("*")
      .in("status", ["Open", "Published"])
      .order("week_start", { ascending: false })
      .order("updated_at", { ascending: false }),
    supabase
      .from("lunch_orders")
      .select("*")
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  if (directoryError) throw directoryError;
  if (menuError) throw menuError;
  if (orderError) throw orderError;

  const rows = (directory || []).map((row: Record<string, any>) => ({
    ...row,
    family_key: String([row.email1 || "", row.email2 || "", row.student_last_name || ""].filter(Boolean).join("|")).replace(/\s+/g, "").toLowerCase() || row.student_last_name || "Family",
    family_name: `${row.student_last_name || "Family"} Family`,
  }));

  return { loaded: true, families: mapFamilies(rows), menus: menus || [], orders: orders || [] };
}

async function upsertAccountBalance(supabase: ReturnType<typeof createClient>, order: Record<string, any>, delta: number, actorEmail: string) {
  const { data: existing, error: selectError } = await supabase
    .from("lunch_accounts")
    .select("family_key,balance")
    .eq("family_key", order.family_key)
    .maybeSingle();
  if (selectError) throw selectError;
  const nextBalance = moneyNumber(existing?.balance) + moneyNumber(delta);
  const { error } = await supabase.from("lunch_accounts").upsert(
    {
      family_key: order.family_key,
      family_name: order.family_name,
      balance: nextBalance,
      updated_by_email: actorEmail,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "family_key" }
  );
  if (error) throw error;
}

async function createOrder(supabase: ReturnType<typeof createClient>, body: Record<string, any>, actorEmail: string) {
  const family = body.family || {};
  const student = body.student || {};
  const item = body.item || {};
  const price = moneyNumber(item.price);
  if (!family.familyKey || !student.name || !item.date || !item.name) throw new Error("Choose a family, student, and lunch item first.");
  if (price < 0 || price > 25) throw new Error("Lunch item price is outside the allowed range.");

  const { data, error } = await supabase
    .from("lunch_orders")
    .insert({
      menu_id: body.menuId || item.menuId || null,
      family_key: family.familyKey,
      family_name: family.familyName || "Family",
      student_id: student.studentId || student.id || null,
      student_name: student.name,
      student_grade: student.grade || "",
      order_date: item.date,
      item_name: item.name,
      item_description: item.description || "",
      price,
      source: body.source || "Office",
      status: "Anticipated",
      created_by_email: actorEmail,
      updated_by_email: actorEmail,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { created: true, order: data };
}

async function updateStatus(supabase: ReturnType<typeof createClient>, body: Record<string, any>, actorEmail: string) {
  const status = normalizeStatus(body.status);
  const orderId = String(body.orderId || body.order?.id || "");
  if (!orderId) throw new Error("Lunch order is missing.");

  const { data: order, error: orderError } = await supabase.from("lunch_orders").select("*").eq("id", orderId).maybeSingle();
  if (orderError) throw orderError;
  if (!order) throw new Error("Lunch order not found.");

  if (status === "Served" && !order.charged_at) {
    const amount = Math.abs(moneyNumber(order.price));
    const { error: transactionError } = await supabase.from("lunch_transactions").insert({
      family_key: order.family_key,
      family_name: order.family_name,
      student_id: order.student_id || null,
      student_name: order.student_name,
      order_id: order.id,
      type: "charge",
      amount: -amount,
      description: `${order.student_name} lunch: ${order.item_name}`,
      created_by_email: actorEmail,
    });
    if (transactionError) throw transactionError;
    await upsertAccountBalance(supabase, order, -amount, actorEmail);
  }

  if (status !== "Served" && order.charged_at && moneyNumber(order.price) > 0) {
    const amount = Math.abs(moneyNumber(order.price));
    const { error: reversalError } = await supabase.from("lunch_transactions").insert({
      family_key: order.family_key,
      family_name: order.family_name,
      student_id: order.student_id || null,
      student_name: order.student_name,
      order_id: order.id,
      type: "adjustment",
      amount,
      description: `Reversal for lunch status changed to ${status}: ${order.student_name} ${order.item_name}`,
      created_by_email: actorEmail,
    });
    if (reversalError) throw reversalError;
    await upsertAccountBalance(supabase, order, amount, actorEmail);
  }

  const { data, error } = await supabase
    .from("lunch_orders")
    .update({
      status,
      served_at: status === "Served" ? order.served_at || new Date().toISOString() : null,
      charged_at: status === "Served" ? order.charged_at || new Date().toISOString() : null,
      updated_by_email: actorEmail,
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .select("*")
    .single();
  if (error) throw error;
  return { updated: true, order: data };
}

async function deleteOrder(supabase: ReturnType<typeof createClient>, body: Record<string, any>, actorEmail: string) {
  const orderId = String(body.orderId || body.order?.id || "");
  if (!orderId) throw new Error("Lunch order is missing.");
  const { data: order, error: orderError } = await supabase.from("lunch_orders").select("*").eq("id", orderId).maybeSingle();
  if (orderError) throw orderError;
  if (!order) return { deleted: false };

  if (order.status === "Served" && order.charged_at && moneyNumber(order.price) > 0) {
    const amount = Math.abs(moneyNumber(order.price));
    const { error: reversalError } = await supabase.from("lunch_transactions").insert({
      family_key: order.family_key,
      family_name: order.family_name,
      student_id: order.student_id || null,
      student_name: order.student_name,
      order_id: order.id,
      type: "adjustment",
      amount,
      description: `Reversal for deleted lunch order: ${order.student_name} ${order.item_name}`,
      created_by_email: actorEmail,
    });
    if (reversalError) throw reversalError;
    await upsertAccountBalance(supabase, order, amount, actorEmail);
  }

  const { error } = await supabase.from("lunch_orders").delete().eq("id", order.id);
  if (error) throw error;
  return { deleted: true };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const actorEmail = await requireHubUser(request, supabase);
    const body = request.method === "POST" ? await request.json() : {};
    const action = String(body.action || "load");

    const result = action === "load"
      ? await loadDailyLunchData(supabase)
      : action === "create"
      ? await createOrder(supabase, body, actorEmail)
      : action === "updateStatus"
      ? await updateStatus(supabase, body, actorEmail)
      : action === "delete"
      ? await deleteOrder(supabase, body, actorEmail)
      : (() => {
          throw new Error("Unsupported lunch log action.");
        })();

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ loaded: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
