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

function familyKeyFor(row: Record<string, any>) {
  return String([row.email1, row.email2, row.student_last_name].filter(Boolean).join("|")).replace(/\s+/g, "").toLowerCase();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const jwt = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!jwt) throw new Error("Please sign in before editing lunch orders.");
    const { menuId, studentId, orders } = await request.json();
    const cleanMenuId = String(menuId || "");
    const cleanStudentId = String(studentId || "");
    if (!cleanMenuId || !cleanStudentId) throw new Error("Missing menu or student.");
    if (!Array.isArray(orders)) throw new Error("Lunch order selections were not provided.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError) throw userError;
    const requesterEmail = String(userData?.user?.email || "").trim().toLowerCase();
    if (!requesterEmail) throw new Error("Please sign in before editing lunch orders.");

    const { data: access, error: accessError } = await supabase
      .from("family_portal_access")
      .select("*")
      .eq("active", true)
      .contains("contact_emails", [requesterEmail])
      .maybeSingle();
    if (accessError) throw accessError;
    if (!access) throw new Error("This email is not connected to a family portal.");

    const [{ data: directoryRows, error: directoryError }, { data: menu, error: menuError }] = await Promise.all([
      supabase.from("student_directory").select("*").eq("active", true),
      supabase.from("lunch_menus").select("*").eq("id", cleanMenuId).in("status", ["Open", "Published"]).maybeSingle(),
    ]);
    if (directoryError) throw directoryError;
    if (menuError) throw menuError;
    if (!menu) throw new Error("This lunch menu is not currently published.");

    const familyStudents = (directoryRows || []).filter((row: Record<string, any>) => familyKeyFor(row) === access.family_key);
    const studentRow = familyStudents.find((row: Record<string, any>) => String(row.student_id) === cleanStudentId);
    if (!studentRow) throw new Error("This student is not connected to your family portal.");
    const studentName = [studentRow.student_first_name, studentRow.student_last_name].filter(Boolean).join(" ");
    const studentGrade = studentRow.grade || "";
    const menuItems = Array.isArray(menu.items) ? menu.items : [];
    const selectedIds = new Set(orders.map((order: Record<string, any>) => String(order.itemId || "")));
    const selectedItems = menuItems.filter((item: Record<string, any>) => selectedIds.has(String(item.id)) && String(item.date || "") >= todayIso());

    for (const item of selectedItems) {
      if (item.requiresMeal) {
        const hasMeal = menuItems.some((entry: Record<string, any>) =>
          entry.date === item.date &&
          !entry.requiresMeal &&
          String(entry.id) !== String(item.id) &&
          selectedIds.has(String(entry.id))
        );
        if (!hasMeal) throw new Error(`${item.name} requires a regular meal on the same date.`);
      }
    }

    const { data: existingOrders, error: existingError } = await supabase
      .from("lunch_orders")
      .select("*")
      .eq("family_key", access.family_key)
      .eq("student_id", cleanStudentId)
      .eq("menu_id", cleanMenuId)
      .gte("order_date", todayIso())
      .neq("status", "Cancelled");
    if (existingError) throw existingError;

    const selectedKeys = new Set(selectedItems.map((item: Record<string, any>) => `${item.date}:${item.name}`));
    const existingKeys = new Set((existingOrders || []).map((order: Record<string, any>) => `${order.order_date}:${order.item_name}`));
    const deleteIds = (existingOrders || [])
      .filter((order: Record<string, any>) => order.status === "Anticipated" && !order.charged_at && !selectedKeys.has(`${order.order_date}:${order.item_name}`))
      .map((order: Record<string, any>) => order.id);

    if (deleteIds.length) {
      const { error: deleteError } = await supabase.from("lunch_orders").delete().in("id", deleteIds);
      if (deleteError) throw deleteError;
    }

    const inserts = selectedItems
      .filter((item: Record<string, any>) => !existingKeys.has(`${item.date}:${item.name}`))
      .map((item: Record<string, any>) => ({
        menu_id: menu.id,
        family_key: access.family_key,
        family_name: access.family_name,
        student_id: cleanStudentId,
        student_name: studentName,
        student_grade: studentGrade,
        order_date: item.date,
        item_name: item.name,
        item_description: item.description || "",
        price: Number(item.price || 0),
        source: "Family Portal",
        status: "Anticipated",
        created_by_email: requesterEmail,
        updated_by_email: requesterEmail,
      }));

    if (inserts.length) {
      const { error: insertError } = await supabase.from("lunch_orders").insert(inserts);
      if (insertError) throw insertError;
    }

    return new Response(JSON.stringify({ updated: true, added: inserts.length, removed: deleteIds.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ updated: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
