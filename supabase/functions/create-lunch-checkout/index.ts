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

function getOrigin(request: Request) {
  return request.headers.get("origin") || Deno.env.get("HUB_PUBLIC_URL") || "https://wvcshub.org";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = request.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "");
    if (!jwt) throw new Error("Please sign in before adding funds.");
    const { amount } = await request.json();
    const cents = Math.round(Number(amount || 0) * 100);
    if (cents < 50) throw new Error("Lunch account deposits must be at least $0.50.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError) throw userError;
    const requesterEmail = String(userData?.user?.email || "").trim().toLowerCase();
    if (!requesterEmail) throw new Error("Please sign in before adding funds.");

    const { data: access, error: accessError } = await supabase
      .from("family_portal_access")
      .select("*")
      .eq("active", true)
      .contains("contact_emails", [requesterEmail])
      .maybeSingle();
    if (accessError) throw accessError;
    if (!access) throw new Error(`This login (${requesterEmail}) is not connected to an active family portal record. Ask the office to send a family portal invite to this email.`);

    const origin = getOrigin(request);
    const params = new URLSearchParams();
    params.set("mode", "payment");
    params.set("success_url", `${origin}/?lunch_session_id={CHECKOUT_SESSION_ID}#/family-login`);
    params.set("cancel_url", `${origin}/#/family-login`);
    params.set("customer_email", requesterEmail);
    params.set("client_reference_id", access.family_key);
    params.set("metadata[payment_type]", "lunch_deposit");
    params.set("metadata[family_key]", access.family_key);
    params.set("metadata[family_name]", access.family_name);
    params.set("metadata[parent_email]", requesterEmail);
    params.set("payment_intent_data[metadata][payment_type]", "lunch_deposit");
    params.set("payment_intent_data[metadata][family_key]", access.family_key);
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", "usd");
    params.set("line_items[0][price_data][unit_amount]", String(cents));
    params.set("line_items[0][price_data][product_data][name]", "WVCS Lunch Account Deposit");
    params.set("line_items[0][price_data][product_data][description]", `${access.family_name} lunch balance`);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || "Stripe checkout session could not be created.");

    return new Response(JSON.stringify({ created: true, url: data.url, sessionId: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ created: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
