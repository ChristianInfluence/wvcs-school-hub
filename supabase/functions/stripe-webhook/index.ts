import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

function requiredEnv(name: string) {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return result === 0;
}

async function computeStripeSignature(secret: string, payload: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return toHex(signed);
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string) {
  const parts = Object.fromEntries(
    signatureHeader
      .split(",")
      .map((part) => part.split("="))
      .filter(([key, value]) => key && value),
  );
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) throw new Error("Invalid Stripe signature header.");

  const signedPayload = `${timestamp}.${rawBody}`;
  const expectedSignature = await computeStripeSignature(webhookSecret, signedPayload);
  if (!timingSafeEqual(expectedSignature, signature)) {
    throw new Error("Stripe signature verification failed.");
  }
}

function getInvoiceLookup(session: Record<string, any>) {
  const metadata = session.metadata || {};
  return {
    invoiceId: metadata.incidental_invoice_id || metadata.invoice_id || "",
    publicToken: metadata.public_token || metadata.incidental_public_token || "",
  };
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

async function updateIncidentalInvoicePayment({
  supabase,
  session,
  paymentStatus,
}: {
  supabase: any;
  session: Record<string, any>;
  paymentStatus: "Paid" | "Payment Failed" | "Pending";
}) {
  const { invoiceId, publicToken } = getInvoiceLookup(session);
  if (!invoiceId && !publicToken) {
    return { updated: false, reason: "Stripe session did not include invoice metadata." };
  }

  const patch = {
    payment_status: paymentStatus,
    paid_at: paymentStatus === "Paid" ? new Date().toISOString() : null,
    payment_url: session.url || null,
    payment_method: paymentStatus === "Paid" ? "card" : null,
    payment_history: [] as any,
    updated_at: new Date().toISOString(),
    invoice_json: undefined as any,
  };

  const selectQuery = supabase.from("incidental_invoices").select("*").limit(1);
  const { data: existingRows, error: selectError } = invoiceId
    ? await selectQuery.eq("id", invoiceId)
    : await selectQuery.eq("public_token", publicToken);

  if (selectError) throw selectError;
  const existing = existingRows?.[0];
  if (!existing) return { updated: false, reason: "Matching incidental invoice was not found." };

  const paymentHistory = paymentStatus === "Paid" ? buildPaymentHistory(existing.invoice_json || {}, session) : existing.invoice_json?.paymentHistory || [];
  patch.payment_history = paymentHistory;
  patch.invoice_json = {
    ...(existing.invoice_json || {}),
    paymentStatus,
    paidAt: paymentStatus === "Paid" ? patch.paid_at : existing.invoice_json?.paidAt || "",
    paymentMethod: paymentStatus === "Paid" ? "card" : existing.invoice_json?.paymentMethod || "",
    paymentHistory,
    stripe: {
      checkoutSessionId: session.id || "",
      paymentIntentId: session.payment_intent || "",
      customerEmail: session.customer_details?.email || session.customer_email || "",
      amountTotal: session.amount_total || 0,
      currency: session.currency || "usd",
      paymentStatus: session.payment_status || "",
      updatedAt: patch.updated_at,
    },
  };

  const { error: updateError } = await supabase
    .from("incidental_invoices")
    .update(patch)
    .eq("id", existing.id);

  if (updateError) throw updateError;
  return { updated: true, invoiceId: existing.id };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") {
    return new Response(JSON.stringify({ received: false, error: "Method not allowed." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const rawBody = await request.text();
    const signatureHeader = request.headers.get("stripe-signature") || "";
    await verifyStripeSignature(rawBody, signatureHeader, requiredEnv("STRIPE_WEBHOOK_SECRET"));

    const event = JSON.parse(rawBody);
    const session = event.data?.object || {};
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

    let result = { updated: false, reason: "Event ignored." };
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      result = await updateIncidentalInvoicePayment({
        supabase,
        session,
        paymentStatus: session.payment_status === "paid" || event.type === "checkout.session.async_payment_succeeded" ? "Paid" : "Pending",
      });
    }

    if (event.type === "checkout.session.async_payment_failed" || event.type === "payment_intent.payment_failed") {
      result = await updateIncidentalInvoicePayment({
        supabase,
        session,
        paymentStatus: "Payment Failed",
      });
    }

    return new Response(JSON.stringify({ received: true, eventType: event.type, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ received: false, error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
