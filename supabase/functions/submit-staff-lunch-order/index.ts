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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) throw new Error("Please sign in before ordering lunch.");
    const { orders } = await request.json();
    if (!Array.isArray(orders) || !orders.length) throw new Error("Choose at least one lunch item.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError) throw userError;
    const email = String(userData?.user?.email || "").trim().toLowerCase();
    if (!email) throw new Error("Please sign in before ordering lunch.");
    const { data: staff, error: staffError } = await supabase
      .from("staff_access")
      .select("email, can_use_hub")
      .eq("email", email)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff?.can_use_hub) throw new Error("This email is not approved for Hub access.");

    const cleanOrders = [];
    const selectedByMenu = new Map<string, Set<string>>();
    orders.forEach((order: Record<string, any>) => {
      const menuId = String(order.menuId || "");
      if (!selectedByMenu.has(menuId)) selectedByMenu.set(menuId, new Set());
      selectedByMenu.get(menuId)?.add(String(order.itemId || ""));
    });
    for (const order of orders) {
      const menuId = String(order.menuId || "");
      const itemId = String(order.itemId || "");
      const { data: menu, error: menuError } = await supabase
        .from("lunch_menus")
        .select("*")
        .eq("id", menuId)
        .in("status", ["Open", "Published"])
        .maybeSingle();
      if (menuError) throw menuError;
      if (!menu) throw new Error("This lunch menu is not currently published.");
      const item = (Array.isArray(menu.items) ? menu.items : []).find((entry: Record<string, any>) => String(entry.id) === itemId);
      if (!item) throw new Error("One of the selected lunch items is no longer available.");
      if (item.requiresMeal) {
        const hasMeal = (Array.isArray(menu.items) ? menu.items : []).some((entry: Record<string, any>) =>
          entry.date === item.date &&
          !entry.requiresMeal &&
          String(entry.id) !== itemId &&
          selectedByMenu.get(menuId)?.has(String(entry.id))
        );
        if (!hasMeal) throw new Error(`${item.name} requires a regular meal on the same date.`);
      }
      cleanOrders.push({
        menu_id: menu.id,
        family_key: `staff:${email}`,
        family_name: "Staff Lunch Orders",
        student_name: email,
        student_grade: "Staff",
        order_date: item.date,
        item_name: item.name,
        item_description: item.description || "",
        price: 0,
        source: "Staff",
        status: "Anticipated",
        created_by_email: email,
        updated_by_email: email,
      });
    }

    const { data: existingOrders, error: existingError } = await supabase
      .from("lunch_orders")
      .select("menu_id,order_date,item_name,status")
      .eq("family_key", `staff:${email}`)
      .neq("status", "Cancelled");
    if (existingError) throw existingError;
    const existingKeys = new Set((existingOrders || []).map((order: Record<string, any>) => `${order.menu_id}:${order.order_date}:${order.item_name}`));
    const newOrders = cleanOrders.filter((order) => !existingKeys.has(`${order.menu_id}:${order.order_date}:${order.item_name}`));
    if (!newOrders.length) {
      return new Response(JSON.stringify({ submitted: true, count: 0, skippedDuplicates: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.from("lunch_orders").insert(newOrders).select("id");
    if (error) throw error;
    return new Response(JSON.stringify({ submitted: true, count: data?.length || 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ submitted: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
