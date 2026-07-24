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

    const { data: menus, error } = await supabase
      .from("lunch_menus")
      .select("*")
      .in("status", ["Open", "Published"])
      .order("week_start", { ascending: true });
    if (error) throw error;

    const { data: orders, error: orderError } = await supabase
      .from("lunch_orders")
      .select("*")
      .eq("family_key", `staff:${email}`)
      .order("order_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (orderError) throw orderError;

    return new Response(JSON.stringify({ loaded: true, menus: menus || [], orders: orders || [], staffEmail: email }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ loaded: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
