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

async function retrieveCheckoutSession(sessionId: string) {
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
    headers: {
      Authorization: `Bearer ${requiredEnv("STRIPE_SECRET_KEY")}`,
    },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Stripe checkout session could not be verified.");
  return data;
}

function buildPaymentHistory(invoiceJson: Record<string, any>, session: Record<string, any>) {
  const existingHistory = Array.isArray(invoiceJson.paymentHistory) ? invoiceJson.paymentHistory : [];
  if (existingHistory.some((payment: Record<string, any>) => payment.stripeCheckoutSessionId === session.id)) {
    return existingHistory;
  }

  return [
    ...existingHistory,
    {
      id: `stripe-${session.id}`,
      type: "payment",
      date: new Date().toISOString(),
      amount: ((session.amount_total || 0) / 100).toFixed(2),
      method: "card",
      checkNumber: "",
      note: "Stripe checkout payment",
      recordedBy: "Stripe",
      stripeCheckoutSessionId: session.id,
      stripePaymentIntentId: session.payment_intent || "",
    },
  ];
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ reconciled: false, error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { token, sessionId } = await request.json();
    const cleanToken = String(token || "").trim();
    const cleanSessionId = String(sessionId || "").trim();
    if (!cleanToken || !cleanSessionId) throw new Error("Missing invoice token or Stripe session id.");

    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const { data: invoice, error } = await supabase
      .from("incidental_invoices")
      .select("*")
      .eq("public_token", cleanToken)
      .maybeSingle();

    if (error) throw error;
    if (!invoice) throw new Error("Invoice was not found.");

    const session = await retrieveCheckoutSession(cleanSessionId);
    const metadata = session.metadata || {};
    if (metadata.public_token !== invoice.public_token || metadata.incidental_invoice_id !== invoice.id) {
      throw new Error("Stripe session does not match this invoice.");
    }

    if (session.payment_status !== "paid") {
      return new Response(JSON.stringify({ reconciled: false, paymentStatus: session.payment_status || "unpaid" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const invoiceJson = invoice.invoice_json || {};
    const paymentHistory = buildPaymentHistory(invoiceJson, session);
    const paidAt = invoice.paid_at || new Date().toISOString();
    const patch = {
      payment_status: "Paid",
      paid_at: paidAt,
      payment_url: session.url || invoice.payment_url || null,
      payment_method: "card",
      payment_history: paymentHistory,
      invoice_json: {
        ...invoiceJson,
        paymentStatus: "Paid",
        paidAt,
        paymentMethod: "card",
        paymentHistory,
        stripe: {
          ...(invoiceJson.stripe || {}),
          checkoutSessionId: session.id || "",
          paymentIntentId: session.payment_intent || "",
          customerEmail: session.customer_details?.email || session.customer_email || "",
          amountTotal: session.amount_total || Math.round(invoiceTotal(invoiceJson) * 100),
          currency: session.currency || "usd",
          paymentStatus: session.payment_status || "",
          reconciledAt: new Date().toISOString(),
        },
      },
      updated_at: new Date().toISOString(),
    };

    const { data: updatedInvoice, error: updateError } = await supabase
      .from("incidental_invoices")
      .update(patch)
      .eq("id", invoice.id)
      .select("*")
      .single();

    if (updateError) throw updateError;

    return new Response(JSON.stringify({
      reconciled: true,
      invoiceId: invoice.id,
      paymentStatus: updatedInvoice.payment_status,
      receiptNumber: updatedInvoice.receipt_number || "",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ reconciled: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
