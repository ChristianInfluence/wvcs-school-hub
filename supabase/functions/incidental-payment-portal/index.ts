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

function mapInvoice(row: Record<string, any>) {
  return {
    id: row.id,
    publicToken: row.public_token,
    familyName: row.family_name || "",
    status: row.status || "Draft",
    paymentStatus: row.payment_status || "Unpaid",
    invoice: row.invoice_json || {},
    paymentUrl: row.payment_url || "",
    sentAt: row.sent_at || "",
    sentTo: row.sent_to || [],
    paidAt: row.paid_at || "",
    updatedAt: row.updated_at || "",
  };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { token } = await request.json();
    const cleanToken = String(token || "").trim();
    if (!cleanToken) throw new Error("Missing invoice token.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data, error } = await supabase
      .from("incidental_invoices")
      .select("*")
      .eq("public_token", cleanToken)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return new Response(JSON.stringify({ loaded: true, found: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ loaded: true, found: true, invoice: mapInvoice(data) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ loaded: false, found: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
