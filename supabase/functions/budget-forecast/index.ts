import { createClient } from "@supabase/supabase-js";
import { handleForecastRequest, makeRepository } from "./service.ts";
import { quickBooksService } from "./quickbooks.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const client = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false, autoRefreshToken: false } });
const origin = new URL(Deno.env.get("HUB_PUBLIC_URL") || "https://wvcshub.org").origin;
const qbo = quickBooksService(client, {
  clientId: Deno.env.get("QBO_CLIENT_ID") || "", clientSecret: Deno.env.get("QBO_CLIENT_SECRET") || "",
  redirectUri: Deno.env.get("QBO_REDIRECT_URI") || `${url}/functions/v1/budget-forecast`,
  encryptionKey: Deno.env.get("QBO_TOKEN_ENCRYPTION_KEY") || "",
  environment: Deno.env.get("QBO_ENVIRONMENT") || "sandbox", origin,
});

Deno.serve(request => handleForecastRequest(request, {
  origin, repository: makeRepository(client), qbo,
  async verifyToken(token) {
    const { data, error } = await client.auth.getUser(token);
    return error ? null : data.user;
  },
}));
