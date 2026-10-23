import { isSupabaseConfigured, supabase } from "../../lib/supabaseClient.js";

const actions: Record<string, string> = {
  "/api/import": "import",
  "/api/qbo/status": "qbo.status",
  "/api/qbo/sync": "qbo.sync",
  "/api/qbo/connect": "qbo.connect",
  "/api/qbo/disconnect": "qbo.disconnect",
};

export async function forecastApi(url: string, options?: RequestInit): Promise<any> {
  if (!isSupabaseConfigured || !supabase) throw new Error("The shared forecast is not configured yet.");
  const action = url === "/api/workspace"
    ? options?.method === "PUT" ? "save" : "load"
    : actions[url];
  if (!action) throw new Error("Unknown forecast operation.");
  const body = options?.body ? JSON.parse(String(options.body)) : {};
  const { data, error } = await supabase.functions.invoke("budget-forecast", { body: { ...body, action } });
  if (error) {
    let message = "The shared forecast could not be reached. Please try again.";
    if (error.context instanceof Response) {
      const result = await error.context.json().catch(() => null);
      if (result?.error) message = result.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
