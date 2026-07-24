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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) throw new Error("Please sign in before ordering lunch.");

    const { orders } = await request.json();
    if (!Array.isArray(orders) || !orders.length) throw new Error("Choose at least one lunch item.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError) throw userError;
    const requesterEmail = String(userData?.user?.email || "").trim().toLowerCase();
    if (!requesterEmail) throw new Error("Please sign in before ordering lunch.");

    const { data: access, error: accessError } = await supabase
      .from("family_portal_access")
      .select("*")
      .eq("active", true)
      .contains("contact_emails", [requesterEmail])
      .maybeSingle();
    if (accessError) throw accessError;
    if (!access) throw new Error("This email is not connected to a family portal.");

    const { data: directoryRows, error: directoryError } = await supabase.from("student_directory").select("*").eq("active", true);
    if (directoryError) throw directoryError;
    const familyStudents = (directoryRows || []).filter((row: Record<string, any>) => familyKeyFor(row) === access.family_key);
    const studentMap = new Map(
      familyStudents.map((row: Record<string, any>) => [
        String(row.student_id),
        {
          studentId: row.student_id,
          studentName: [row.student_first_name, row.student_last_name].filter(Boolean).join(" "),
          grade: row.grade || "",
        },
      ]),
    );

    const cleanOrders = [];
    for (const order of orders) {
      const student = studentMap.get(String(order.studentId || ""));
      if (!student) throw new Error("One of the selected students is not connected to this family.");
      const menuId = String(order.menuId || "");
      const itemId = String(order.itemId || "");
      const { data: menu, error: menuError } = await supabase
        .from("lunch_menus")
        .select("*")
        .eq("id", menuId)
        .eq("status", "Open")
        .maybeSingle();
      if (menuError) throw menuError;
      if (!menu) throw new Error("This lunch menu is not currently open.");
      const item = (Array.isArray(menu.items) ? menu.items : []).find((entry: Record<string, any>) => String(entry.id) === itemId);
      if (!item) throw new Error("One of the selected lunch items is no longer available.");
      cleanOrders.push({
        menu_id: menu.id,
        family_key: access.family_key,
        family_name: access.family_name,
        student_id: student.studentId,
        student_name: student.studentName,
        student_grade: student.grade,
        order_date: item.date,
        item_name: item.name,
        item_description: item.description || "",
        price: Number(item.price || 0),
        source: "Family Portal",
        status: "Anticipated",
        created_by_email: requesterEmail,
        updated_by_email: requesterEmail,
      });
    }

    const { data, error } = await supabase.from("lunch_orders").insert(cleanOrders).select("*");
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
