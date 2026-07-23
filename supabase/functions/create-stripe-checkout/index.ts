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

function money(value: any) {
  const amount = Number.parseFloat(value);
  return Number.isFinite(amount) ? amount : 0;
}

function invoiceTotal(invoice: Record<string, any>) {
  return (invoice.charges || []).reduce((total: number, charge: Record<string, any>) => total + money(charge.amount), 0);
}

function getOrigin(request: Request) {
  const requestOrigin = request.headers.get("origin");
  if (requestOrigin) return requestOrigin;
  return Deno.env.get("HUB_PUBLIC_URL") || "https://wvcshub.org";
}

async function createStripeCheckoutSession({
  invoice,
  origin,
}: {
  invoice: Record<string, any>;
  origin: string;
}) {
  const invoiceJson = invoice.invoice_json || {};
  const totalCents = Math.round(invoiceTotal(invoiceJson) * 100);
  if (totalCents < 50) throw new Error("Invoice total must be at least $0.50 to create a Stripe checkout session.");

  const portalUrl = `${origin}/#/incidental-pay/${encodeURIComponent(invoice.public_token)}`;
  const params = new URLSearchParams();
  params.set("mode", "payment");
  params.set("success_url", portalUrl);
  params.set("cancel_url", portalUrl);
  params.set("client_reference_id", invoice.id);
  params.set("customer_email", invoiceJson.parentEmail || "");
  params.set("metadata[incidental_invoice_id]", invoice.id);
  params.set("metadata[public_token]", invoice.public_token);
  params.set("payment_intent_data[metadata][incidental_invoice_id]", invoice.id);
  params.set("payment_intent_data[metadata][public_token]", invoice.public_token);
  params.set("line_items[0][quantity]", "1");
  params.set("line_items[0][price_data][currency]", "usd");
  params.set("line_items[0][price_data][unit_amount]", String(totalCents));
  params.set("line_items[0][price_data][product_data][name]", `${invoice.family_name || "WVCS"} Incidental Invoice`);
  params.set("line_items[0][price_data][product_data][description]", "Willamette Valley Christian School incidental charges");

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
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ created: false, error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token } = await request.json();
    const cleanToken = String(token || "").trim();
    if (!cleanToken) throw new Error("Missing invoice token.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: invoice, error } = await supabase
      .from("incidental_invoices")
      .select("*")
      .eq("public_token", cleanToken)
      .maybeSingle();

    if (error) throw error;
    if (!invoice) throw new Error("Invoice was not found.");
    if (invoice.payment_status === "Paid") throw new Error("This invoice has already been paid.");

    const session = await createStripeCheckoutSession({ invoice, origin: getOrigin(request) });
    const invoiceJson = invoice.invoice_json || {};
    await supabase
      .from("incidental_invoices")
      .update({
        payment_status: "Pending",
        payment_url: session.url,
        invoice_json: {
          ...invoiceJson,
          paymentStatus: "Pending",
          paymentUrl: session.url,
          stripe: {
            ...(invoiceJson.stripe || {}),
            checkoutSessionId: session.id,
            checkoutCreatedAt: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", invoice.id);

    return new Response(JSON.stringify({ created: true, url: session.url, sessionId: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ created: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
