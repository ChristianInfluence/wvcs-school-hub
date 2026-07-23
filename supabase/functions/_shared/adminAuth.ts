import { createClient } from "npm:@supabase/supabase-js@2";
import { hasAdminAccess } from "./studentRosterCore.js";

export function jsonResponse(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}

export async function requireAdmin(request: Request) {
  const authHeader = request.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return { error: "Sign in is required.", status: 401 };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return { error: "Server auth is not configured.", status: 500 };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser(token);
  if (userError || !userData?.user?.email) {
    return { error: "Sign in is required.", status: 401 };
  }

  const email = userData.user.email.toLowerCase();
  const adminClient = createClient(supabaseUrl, serviceKey);
  const { data, error } = await adminClient
    .from("staff_access")
    .select("can_use_admin")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    console.error("Student Directory admin lookup failed", error.message);
    return { error: "Unable to verify admin access.", status: 500 };
  }
  if (!hasAdminAccess(data || {})) {
    return { error: "Administrator access is required.", status: 403 };
  }

  return { email };
}
