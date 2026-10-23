import { addMonth, dateInMonth, type ForecastDocument } from "../_shared/financeForecast/model.ts";
import { isVerifiedForecastUser } from "../_shared/financeForecast/access.js";
import { ForecastError } from "./service.ts";

type Config = { clientId: string; clientSecret: string; redirectUri: string; encryptionKey: string; environment: string; origin: string };
const reports = ["ProfitAndLoss", "BalanceSheet", "CashFlow"] as const;
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unbase64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const stateHash = async (state: string) => base64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(state))));

export function quickBooksService(client: any, config: Config) {
  const ready = () => Boolean(config.clientId && config.clientSecret && config.redirectUri && config.encryptionKey);
  function configured() { if (!ready()) throw new ForecastError(503, "QuickBooks connection setup is pending. Report imports are available now."); }
  async function key() {
    configured();
    let raw;
    try { raw = unbase64(config.encryptionKey); } catch { throw new ForecastError(503, "QuickBooks connection setup needs attention."); }
    if (raw.length !== 32) throw new ForecastError(503, "QuickBooks connection setup needs attention.");
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  }
  async function seal(value: unknown) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(JSON.stringify(value)));
    return JSON.stringify({ v: 1, iv: base64(iv), data: base64(new Uint8Array(data)) });
  }
  async function unseal(value: string) {
    const payload = JSON.parse(value);
    const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unbase64(payload.iv) }, await key(), unbase64(payload.data));
    return JSON.parse(new TextDecoder().decode(data));
  }
  function checked(result: any) { if (result.error) throw new ForecastError(503, "QuickBooks connection storage is unavailable."); return result.data; }
  async function exchange(form: URLSearchParams) {
    const response = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}` }, body: form, signal: AbortSignal.timeout(25000),
    });
    if (!response.ok) throw new ForecastError(502, "QuickBooks authorization failed. Reconnect the school company.");
    const data = await response.json();
    if (!data.access_token || !data.refresh_token || !Number(data.expires_in)) throw new ForecastError(502, "QuickBooks returned an incomplete authorization.");
    return data;
  }
  async function claim() {
    const lock = crypto.randomUUID();
    const rows = checked(await client.from("budget_forecast_qbo_connections").update({ lock_token: lock, lock_until: new Date(Date.now() + 180000).toISOString() }).eq("scope", "wvcs").lt("lock_until", new Date().toISOString()).select("realm_id,sealed_tokens,expires_at"));
    if (!rows?.length) throw new ForecastError(409, "Connect QuickBooks first, or wait for the current request to finish.");
    return { row: rows[0], lock };
  }
  async function release(lock: string) {
    checked(await client.from("budget_forecast_qbo_connections").update({ lock_token: null, lock_until: "1970-01-01T00:00:00Z" }).eq("scope", "wvcs").eq("lock_token", lock));
  }
  const redirect = (result: string) => `${config.origin}/#/office-finance/forecast?view=connections&qbo=${result}`;
  return {
    async status() {
      const data = checked(await client.from("budget_forecast_qbo_connections").select("realm_id,connected_at,last_sync_at").eq("scope", "wvcs").maybeSingle());
      return { ready: ready(), connected: Boolean(data), environment: config.environment === "production" ? "production" : "sandbox", company: data };
    },
    async connect(userId: string) {
      configured();
      const state = base64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
      checked(await client.from("budget_forecast_oauth_states").delete().lt("expires_at", new Date().toISOString()));
      checked(await client.from("budget_forecast_oauth_states").insert({ state_hash: await stateHash(state), actor_id: userId, expires_at: new Date(Date.now() + 600000).toISOString() }));
      const url = new URL("https://appcenter.intuit.com/connect/oauth2");
      url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: config.redirectUri, response_type: "code", scope: "com.intuit.quickbooks.accounting", state }).toString();
      return url.toString();
    },
    async callback(url: URL) {
      try {
        configured();
        const state = url.searchParams.get("state") || "";
        if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return redirect("error");
        // DELETE RETURNING atomically consumes a state once, including denial callbacks.
        const states = checked(await client.from("budget_forecast_oauth_states").delete().eq("state_hash", await stateHash(state)).gt("expires_at", new Date().toISOString()).select("actor_id"));
        if (!states?.length) return redirect("error");
        const { data, error } = await client.auth.admin.getUserById(states[0].actor_id);
        if (error || !isVerifiedForecastUser(data?.user)) return redirect("error");
        const code = url.searchParams.get("code"), realm = url.searchParams.get("realmId");
        if (!code || code.length > 3000 || !realm || !/^\d{1,30}$/.test(realm)) return redirect("error");
        const connection = checked(await client.from("budget_forecast_qbo_connections").select("lock_until").eq("scope", "wvcs").maybeSingle());
        if (connection && new Date(connection.lock_until).getTime() > Date.now()) return redirect("error");
        const tokens = await exchange(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: config.redirectUri }));
        checked(await client.from("budget_forecast_qbo_connections").upsert({ scope: "wvcs", realm_id: realm, sealed_tokens: await seal(tokens), expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), connected_at: new Date().toISOString(), last_sync_at: null, lock_token: null, lock_until: "1970-01-01T00:00:00Z" }));
        return redirect("connected");
      } catch { return redirect("error"); }
    },
    async sync(document: ForecastDocument, throughDate?: string) {
      configured();
      const { row, lock } = await claim();
      try {
        let tokens = await unseal(row.sealed_tokens);
        if (new Date(row.expires_at).getTime() < Date.now() + 60000) {
          tokens = await exchange(new URLSearchParams({ grant_type: "refresh_token", refresh_token: tokens.refresh_token }));
          checked(await client.from("budget_forecast_qbo_connections").update({ sealed_tokens: await seal(tokens), expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString() }).eq("scope", "wvcs").eq("lock_token", lock));
        }
        const host = config.environment === "production" ? "https://quickbooks.api.intuit.com" : "https://sandbox-quickbooks.api.intuit.com";
        const result: Record<string, unknown> = {};
        for (const name of reports) {
          const parameters = new URLSearchParams({ start_date: `${addMonth(document.settings.cutoffMonth, -23)}-01`, end_date: name === "BalanceSheet" ? dateInMonth(document.settings.cutoffMonth, 31) : throughDate || dateInMonth(document.settings.cutoffMonth, 31), accounting_method: document.settings.basis, summarize_column_by: name === "BalanceSheet" ? "Total" : "Month" });
          // The app makes only GET calls to these three accounting report endpoints.
          const response = await fetch(`${host}/v3/company/${encodeURIComponent(row.realm_id)}/reports/${name}?${parameters}`, { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(25000) });
          if (!response.ok) throw new ForecastError(502, response.status === 401 ? "QuickBooks needs to be reconnected." : `QuickBooks could not supply ${name}. Try a report export instead.`);
          result[name] = await response.json();
        }
        checked(await client.from("budget_forecast_qbo_connections").update({ last_sync_at: new Date().toISOString() }).eq("scope", "wvcs").eq("lock_token", lock));
        return result;
      } finally { await release(lock); }
    },
    async disconnect() {
      configured();
      const { row, lock } = await claim();
      try {
        const tokens = await unseal(row.sealed_tokens);
        const response = await fetch("https://developer.api.intuit.com/v2/oauth2/tokens/revoke", { method: "POST", headers: { Authorization: `Basic ${btoa(`${config.clientId}:${config.clientSecret}`)}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ token: tokens.refresh_token }), signal: AbortSignal.timeout(25000) });
        if (!response.ok) throw new ForecastError(502, "QuickBooks could not revoke access. Try again or disconnect from QuickBooks Apps.");
        checked(await client.from("budget_forecast_qbo_connections").delete().eq("scope", "wvcs").eq("lock_token", lock));
      } finally { await release(lock); }
    },
  };
}
