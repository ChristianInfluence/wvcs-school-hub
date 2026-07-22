import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function optionalEnv(name: string) {
  return Deno.env.get(name) || "";
}

function requiredEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function parseServiceAccountEmail(jsonValue: string) {
  if (!jsonValue) return "";
  try {
    const parsed = JSON.parse(jsonValue);
    return String(parsed.client_email || "");
  } catch {
    return "";
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await request.json().catch(() => ({}));
    const action = payload.action || "test";
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));

    const { data: storedSettings, error: settingsError } = await supabase
      .from("drive_backup_settings")
      .select("*")
      .eq("id", "primary")
      .maybeSingle();
    if (settingsError) throw settingsError;

    const settings = {
      ...(storedSettings || {}),
      ...(payload.settings || {}),
    };
    const serviceAccountJson = optionalEnv("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");
    const serviceAccountEmail = settings.serviceAccountEmail || settings.service_account_email || parseServiceAccountEmail(serviceAccountJson);
    const rootFolderId = settings.rootFolderId || settings.root_folder_id || optionalEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID");
    const rootFolderName = settings.rootFolderName || settings.root_folder_name || "WVCS Hub Backups";

    if (action === "test") {
      const missing = [];
      if (!serviceAccountEmail) missing.push("service account email");
      if (!rootFolderId && !rootFolderName) missing.push("Drive root folder");
      if (!serviceAccountJson) missing.push("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");

      return new Response(
        JSON.stringify({
          ok: true,
          ready: missing.length === 0,
          message: missing.length
            ? `Drive backup framework is reachable. Still needed: ${missing.join(", ")}.`
            : "Drive backup function is configured and ready for live upload wiring.",
          serviceAccountEmail,
          rootFolderId,
          rootFolderName,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ready: false,
        message: "Drive backup worker endpoint is installed. Live upload processing will be added after credentials are connected.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
