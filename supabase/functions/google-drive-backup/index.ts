import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const FOLDER_MIME = "application/vnd.google-apps.folder";

let cachedAccessToken = "";
let cachedAccessTokenExpiresAt = 0;

function optionalEnv(name: string) {
  return Deno.env.get(name) || "";
}

function requiredEnv(name: string) {
  const value = optionalEnv(name);
  if (!value) throw new Error(`Missing required secret: ${name}`);
  return value;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parseServiceAccount(jsonValue: string) {
  const parsed = parseJson(jsonValue);
  if (!parsed?.client_email || !parsed?.private_key) {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON is missing client_email or private_key.");
  }
  return parsed;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.byteLength; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function base64Url(value: string | Uint8Array) {
  const base64 = typeof value === "string" ? btoa(value) : bytesToBase64(value);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes.buffer;
}

function escapeDriveQuery(value: string) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function sanitizeFolderPart(value: string) {
  return String(value || "")
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Untitled";
}

function concatUint8Arrays(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

async function getGoogleAccessToken(serviceAccountJson: string) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessTokenExpiresAt - 60 > now) return cachedAccessToken;

  const serviceAccount = parseServiceAccount(serviceAccountJson);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: DRIVE_SCOPE,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const unsignedToken = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsignedToken));
  const assertion = `${unsignedToken}.${base64Url(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error_description || data.error || "Unable to authenticate with Google Drive.");

  cachedAccessToken = data.access_token;
  cachedAccessTokenExpiresAt = now + Number(data.expires_in || 3600);
  return cachedAccessToken;
}

async function googleDriveFetch(path: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(`https://www.googleapis.com/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.error || "Google Drive request failed.");
  return data;
}

async function verifyDriveFolder(folderId: string, accessToken: string) {
  return googleDriveFetch(
    `/files/${encodeURIComponent(folderId)}?fields=id,name,webViewLink&supportsAllDrives=true`,
    accessToken
  );
}

async function findFolder(name: string, parentId: string, accessToken: string) {
  const query = [
    "trashed = false",
    `mimeType = '${FOLDER_MIME}'`,
    `name = '${escapeDriveQuery(name)}'`,
    `'${escapeDriveQuery(parentId)}' in parents`,
  ].join(" and ");
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,webViewLink)",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true",
  });
  const data = await googleDriveFetch(`/files?${params.toString()}`, accessToken);
  return data.files?.[0] || null;
}

async function createFolder(name: string, parentId: string, accessToken: string) {
  return googleDriveFetch("/files?fields=id,name,webViewLink&supportsAllDrives=true", accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  });
}

async function ensureFolder(name: string, parentId: string, accessToken: string) {
  const safeName = sanitizeFolderPart(name);
  const existing = await findFolder(safeName, parentId, accessToken);
  if (existing) return existing;
  return createFolder(safeName, parentId, accessToken);
}

async function ensureTargetFolder(settings: Record<string, unknown>, job: Record<string, unknown>, accessToken: string) {
  const rootFolderId = String(settings.rootFolderId || settings.root_folder_id || optionalEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID") || "").trim();
  const rootFolderName = sanitizeFolderPart(String(settings.rootFolderName || settings.root_folder_name || "WVCS Hub Backups"));
  const path = Array.isArray(job.target_folder_path) ? job.target_folder_path : [];

  let currentFolder = rootFolderId ? await verifyDriveFolder(rootFolderId, accessToken) : await ensureFolder(rootFolderName, "root", accessToken);
  for (const part of path) {
    currentFolder = await ensureFolder(String(part), currentFolder.id, accessToken);
  }
  return currentFolder;
}

async function uploadPdfToDrive({
  accessToken,
  folderId,
  filename,
  blob,
}: {
  accessToken: string;
  folderId: string;
  filename: string;
  blob: Blob;
}) {
  const boundary = `wvcs_${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();
  const metadata = {
    name: filename || "WVCS Hub Backup.pdf",
    mimeType: "application/pdf",
    parents: [folderId],
  };
  const body = concatUint8Arrays([
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    new Uint8Array(await blob.arrayBuffer()),
    encoder.encode(`\r\n--${boundary}--`),
  ]);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink&supportsAllDrives=true",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.error || "Unable to upload PDF to Google Drive.");
  return data;
}

async function getJobStorage(supabase: ReturnType<typeof createClient>, job: Record<string, unknown>) {
  const metadata = (job.metadata || {}) as Record<string, string>;
  if (metadata.storageBucket && metadata.storagePath) {
    return { bucket: metadata.storageBucket, path: metadata.storagePath };
  }

  if (job.source_type === "permission_submission") {
    const { data, error } = await supabase
      .from("permission_submissions")
      .select("signed_pdf_bucket,signed_pdf_path")
      .eq("id", job.source_id)
      .maybeSingle();
    if (error) throw error;
    return { bucket: data?.signed_pdf_bucket || "", path: data?.signed_pdf_path || "" };
  }

  if (job.source_type === "form_submission") {
    const { data, error } = await supabase
      .from("form_submissions")
      .select("submission")
      .eq("id", job.source_id)
      .maybeSingle();
    if (error) throw error;
    return {
      bucket: data?.submission?.generatedPdfStorageBucket || "",
      path: data?.submission?.generatedPdfStoragePath || "",
    };
  }

  return { bucket: "", path: "" };
}

async function processJob({
  supabase,
  settings,
  accessToken,
  job,
}: {
  supabase: ReturnType<typeof createClient>;
  settings: Record<string, unknown>;
  accessToken: string;
  job: Record<string, unknown>;
}) {
  const attempts = Number(job.attempts || 0) + 1;
  await supabase
    .from("drive_backup_jobs")
    .update({ attempts, last_attempt_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", job.id);

  const storage = await getJobStorage(supabase, job);
  if (!storage.bucket || !storage.path) throw new Error("The queued record does not have a stored PDF path yet.");

  const { data: pdfBlob, error: downloadError } = await supabase.storage.from(storage.bucket).download(storage.path);
  if (downloadError) throw downloadError;
  if (!pdfBlob) throw new Error("The stored PDF could not be downloaded from Supabase Storage.");

  const folder = await ensureTargetFolder(settings, job, accessToken);
  const uploaded = await uploadPdfToDrive({
    accessToken,
    folderId: folder.id,
    filename: String(job.filename || storage.path.split("/").pop() || "WVCS Hub Backup.pdf"),
    blob: pdfBlob,
  });

  await supabase
    .from("drive_backup_jobs")
    .update({
      status: "uploaded",
      drive_folder_id: folder.id,
      drive_file_id: uploaded.id,
      drive_web_url: uploaded.webViewLink,
      error_message: null,
      attempts,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  return { jobId: job.id, fileId: uploaded.id, webViewLink: uploaded.webViewLink };
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
    const serviceAccount = serviceAccountJson ? parseServiceAccount(serviceAccountJson) : null;
    const serviceAccountEmail = String(
      settings.serviceAccountEmail || settings.service_account_email || serviceAccount?.client_email || ""
    );
    const rootFolderId = String(settings.rootFolderId || settings.root_folder_id || optionalEnv("GOOGLE_DRIVE_ROOT_FOLDER_ID") || "");
    const rootFolderName = String(settings.rootFolderName || settings.root_folder_name || "WVCS Hub Backups");

    if (action === "test") {
      const missing = [];
      if (!serviceAccountEmail) missing.push("service account email");
      if (!rootFolderId && !rootFolderName) missing.push("Drive root folder");
      if (!serviceAccountJson) missing.push("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");

      let folder = null;
      if (!missing.length) {
        const accessToken = await getGoogleAccessToken(serviceAccountJson);
        if (rootFolderId) folder = await verifyDriveFolder(rootFolderId, accessToken);
      }

      return new Response(
        JSON.stringify({
          ok: true,
          ready: missing.length === 0,
          message: missing.length
            ? `Drive backup framework is reachable. Still needed: ${missing.join(", ")}.`
            : rootFolderId
              ? `Google Drive credentials verified for "${folder?.name || "selected folder"}".`
              : "Google Drive credentials verified. Add a shared Root Folder ID so backups land in a folder your office can see.",
          serviceAccountEmail,
          rootFolderId,
          rootFolderName,
          verifiedFolder: folder,
          serverSecretConfigured: Boolean(serviceAccountJson),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "process-pending") {
      if (!settings.enabled) throw new Error("Drive backup is not enabled in settings.");
      if (!serviceAccountJson) throw new Error("Missing required secret: GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");

      const accessToken = await getGoogleAccessToken(serviceAccountJson);
      const limit = Math.min(Math.max(Number(payload.limit || 10), 1), 25);
      const { data: jobs, error: jobsError } = await supabase
        .from("drive_backup_jobs")
        .select("*")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (jobsError) throw jobsError;

      const uploaded = [];
      const failed = [];
      for (const job of jobs || []) {
        try {
          uploaded.push(await processJob({ supabase, settings, accessToken, job }));
        } catch (error) {
          failed.push({ jobId: job.id, error: error.message });
          await supabase
            .from("drive_backup_jobs")
            .update({
              status: "failed",
              error_message: error.message,
              attempts: Number(job.attempts || 0) + 1,
              last_attempt_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", job.id);
        }
      }

      return new Response(
        JSON.stringify({
          ok: true,
          processed: (jobs || []).length,
          uploaded,
          failed,
          message: `Processed ${(jobs || []).length} backup record${(jobs || []).length === 1 ? "" : "s"}.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: false, error: `Unknown Drive backup action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
