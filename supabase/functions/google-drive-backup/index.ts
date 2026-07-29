import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const JSON_MIME = "application/json";
const FINANCE_SOURCE_TYPES = new Set(["tuition_invoice", "incidental_invoice", "incidental_receipt"]);

const SNAPSHOT_DATASETS = [
  {
    key: "family-records",
    label: "Family Records",
    folder: ["Family Portal", "Family Records"],
    tables: ["student_directory", "family_portal_access"],
  },
  {
    key: "fos",
    label: "Friends of School",
    folder: ["Family Portal", "FOS"],
    tables: ["fos_hour_entries", "fos_audit_events", "fos_email_templates"],
  },
  {
    key: "lunch",
    label: "Lunch",
    folder: ["Family Portal", "Lunch"],
    tables: ["lunch_accounts", "lunch_menus", "lunch_orders", "lunch_transactions"],
  },
  {
    key: "family-forms-driver-records",
    label: "Family Forms and Driver Records",
    folder: ["Family Portal", "Forms and Driver Records"],
    tables: ["volunteer_driver_applications", "student_driver_registrations", "off_campus_lunch_permissions", "parent_background_checks"],
  },
  {
    key: "office-finance",
    label: "Office and Finance",
    folder: ["Office and Finance"],
    tables: ["incidental_invoices", "tuition_invoices", "office_finance_settings"],
  },
  {
    key: "permission-slips",
    label: "Permission Slip Records",
    folder: ["Digital Permission Slips", "Records"],
    tables: ["permission_events", "permission_recipients", "permission_submissions", "permission_audit_log"],
  },
  {
    key: "forms",
    label: "Forms and Approvals",
    folder: ["Forms", "Records"],
    tables: ["form_templates", "form_submissions", "form_approval_actions", "form_share_links"],
  },
  {
    key: "communications",
    label: "Communications",
    folder: ["Communications"],
    tables: ["hub_message_threads", "hub_message_participants", "hub_message_posts", "hub_message_email_imports", "staff_suggestions", "support_requests", "email_audit_log"],
  },
  {
    key: "scheduler-and-operations",
    label: "Scheduler and Operations",
    folder: ["Scheduler and Operations"],
    tables: ["scheduler_versions", "meeting_requests", "meeting_schedules", "important_documents"],
  },
  {
    key: "system",
    label: "System Settings and Access",
    folder: ["Settings Snapshots"],
    tables: ["staff_access", "drive_backup_settings"],
  },
];

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

function sanitizeFilePart(value: string) {
  return sanitizeFolderPart(value).replace(/\s+/g, "-");
}

function money(value: unknown) {
  const amount = Number.parseFloat(String(value || "0"));
  return Number.isFinite(amount) ? amount : 0;
}

function currency(value: unknown) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(money(value));
}

function shortDate(value: unknown) {
  if (!value) return "";
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toISOString().slice(0, 10);
}

function financeBackupFilename(kind: string, row: Record<string, any>) {
  const invoice = row.invoice_json || {};
  const familyName = sanitizeFilePart(row.family_name || invoice.familyName || "WVCS-Family");
  const datePart = shortDate(row.paid_at || row.sent_at || invoice.invoiceDate || row.updated_at || row.created_at || new Date());
  const status = sanitizeFilePart(row.payment_status || row.status || invoice.paymentStatus || invoice.status || "Saved");
  return `${familyName}_${kind}_${datePart}_${status}.pdf`;
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
  try {
    return await googleDriveFetch(
      `/files/${encodeURIComponent(folderId)}?fields=id,name,webViewLink&supportsAllDrives=true`,
      accessToken
    );
  } catch (error) {
    if (!/file not found|not found/i.test(error.message || "")) throw error;
    const sharedDrive = await googleDriveFetch(
      `/drives/${encodeURIComponent(folderId)}?fields=id,name&useDomainAdminAccess=false`,
      accessToken
    );
    return {
      id: sharedDrive.id,
      name: sharedDrive.name,
      webViewLink: `https://drive.google.com/drive/folders/${sharedDrive.id}`,
      sharedDriveRoot: true,
    };
  }
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

async function uploadBlobToDrive({
  accessToken,
  folderId,
  filename,
  blob,
  mimeType = "application/pdf",
}: {
  accessToken: string;
  folderId: string;
  filename: string;
  blob: Blob;
  mimeType?: string;
}) {
  const boundary = `wvcs_${crypto.randomUUID().replace(/-/g, "")}`;
  const encoder = new TextEncoder();
  const metadata = {
    name: filename || "WVCS Hub Backup.pdf",
    mimeType,
    parents: [folderId],
  };
  const body = concatUint8Arrays([
    encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    encoder.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
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
  if (!response.ok) throw new Error(data.error?.message || data.error || "Unable to upload file to Google Drive.");
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

function wrapText(text: string, maxChars = 88) {
  const words = String(text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function chargeTotal(invoice: Record<string, any>) {
  return Array.isArray(invoice.charges)
    ? invoice.charges.reduce((total: number, charge: Record<string, any>) => total + money(charge.amount), 0)
    : money(invoice.total || invoice.amount || invoice.balanceDue);
}

function paymentHistoryTotal(invoice: Record<string, any>) {
  return Array.isArray(invoice.paymentHistory)
    ? invoice.paymentHistory
        .filter((payment: Record<string, any>) => String(payment.type || "payment") !== "refund")
        .reduce((total: number, payment: Record<string, any>) => total + money(payment.amount), 0)
    : 0;
}

function tuitionStudentTotal(student: Record<string, any>) {
  const discountTotal = Array.isArray(student.discounts)
    ? student.discounts.reduce((sum: number, discount: Record<string, any>) => sum + money(discount.amount), 0)
    : 0;
  const discountedTuition = Math.max(money(student.tuition) - discountTotal, 0);
  return Math.max(discountedTuition - discountedTuition * 0.05, 0) + money(student.comprehensiveFee);
}

function tuitionTotal(invoice: Record<string, any>) {
  if (money(invoice.total)) return money(invoice.total);
  const students = Array.isArray(invoice.students) ? invoice.students : [];
  const studentTotal = students.reduce((sum: number, student: Record<string, any>) => sum + tuitionStudentTotal(student), 0);
  return studentTotal + (invoice.registrationFeePaid ? 0 : money(invoice.registrationFee));
}

async function createFinancePdfBlob(row: Record<string, any>, sourceType: string) {
  const invoice = row.invoice_json || {};
  const isTuition = sourceType === "tuition_invoice";
  const isReceipt = sourceType === "incidental_receipt";
  const title = isTuition ? "Tuition Breakdown Invoice" : isReceipt ? "Payment Receipt" : "Incidental Invoice";
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = 744;

  function draw(text: string, x = margin, size = 10, font = regular, color = rgb(0.15, 0.18, 0.23)) {
    if (y < 70) {
      page = pdfDoc.addPage([612, 792]);
      y = 744;
    }
    page.drawText(String(text || ""), { x, y, size, font, color });
    y -= size + 7;
  }

  function drawPair(label: string, value: string) {
    page.drawText(label, { x: margin, y, size: 9, font: bold, color: rgb(0.35, 0.39, 0.46) });
    page.drawText(value || "-", { x: 170, y, size: 9, font: regular, color: rgb(0.12, 0.14, 0.18) });
    y -= 17;
  }

  function rule() {
    page.drawLine({ start: { x: margin, y }, end: { x: 564, y }, thickness: 1, color: rgb(0.82, 0.85, 0.9) });
    y -= 16;
  }

  page.drawRectangle({ x: 0, y: 720, width: 612, height: 72, color: rgb(0.95, 0.98, 1) });
  page.drawText("Willamette Valley Christian School", { x: margin, y: 760, size: 16, font: bold, color: rgb(0.04, 0.22, 0.36) });
  page.drawText("9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236", { x: margin, y: 740, size: 9, font: regular, color: rgb(0.28, 0.33, 0.4) });
  page.drawText(title, { x: 390, y: 760, size: 13, font: bold, color: rgb(0.04, 0.22, 0.36) });
  y = 700;

  drawPair("Family", row.family_name || invoice.familyName || "WVCS Family");
  drawPair("Invoice Date", shortDate(invoice.invoiceDate || row.created_at));
  drawPair("Sent Date", shortDate(row.sent_at));
  drawPair("Status", row.payment_status || row.status || invoice.paymentStatus || invoice.status || "Saved");
  if (row.receipt_number || invoice.receiptNumber) drawPair("Receipt #", row.receipt_number || invoice.receiptNumber);
  if (row.paid_at || invoice.paidAt) drawPair("Paid Date", shortDate(row.paid_at || invoice.paidAt));
  rule();

  if (isTuition) {
    draw("Students", margin, 12, bold, rgb(0.04, 0.22, 0.36));
    (invoice.students || []).forEach((student: Record<string, any>) => {
      draw(`${student.name || "Student"}${student.grade ? ` - Grade ${student.grade}` : ""}`, margin, 10, bold);
      drawPair("Tuition", currency(student.tuition));
      const discounts = Array.isArray(student.discounts) ? student.discounts : [];
      discounts.forEach((discount: Record<string, any>) => drawPair(`Discount: ${discount.label === "Manual" ? discount.customLabel || "Custom" : discount.label || "Discount"}`, `-${currency(discount.amount)}`));
      const discountedTuition = Math.max(money(student.tuition) - discounts.reduce((sum: number, discount: Record<string, any>) => sum + money(discount.amount), 0), 0);
      drawPair("Early Pay Discount", `-${currency(discountedTuition * 0.05)}`);
      drawPair("Comprehensive Fee", currency(student.comprehensiveFee));
      drawPair("Student Total", currency(tuitionStudentTotal(student)));
      y -= 4;
    });
    drawPair(invoice.registrationFeePaid ? "Registration Fee Paid" : "Registration Fee", invoice.registrationFeePaid ? "$0.00" : currency(invoice.registrationFee));
    rule();
    draw(`Total Due: ${currency(tuitionTotal(invoice))}`, margin, 14, bold, rgb(0.04, 0.22, 0.36));
  } else {
    draw(isReceipt ? "Payment Summary" : "Charges", margin, 12, bold, rgb(0.04, 0.22, 0.36));
    (invoice.charges || []).forEach((charge: Record<string, any>) => {
      const label = charge.description || charge.category || "Charge";
      wrapText(label, 70).forEach((line, index) => {
        page.drawText(line, { x: margin, y, size: 10, font: index === 0 ? bold : regular, color: rgb(0.12, 0.14, 0.18) });
        if (index === 0) page.drawText(currency(charge.amount), { x: 486, y, size: 10, font: bold, color: rgb(0.12, 0.14, 0.18) });
        y -= 17;
      });
    });
    rule();
    const total = chargeTotal(invoice);
    const paid = paymentHistoryTotal(invoice) || (String(row.payment_status || "").toLowerCase() === "paid" ? total : 0);
    drawPair("Invoice Total", currency(total));
    drawPair("Paid", currency(paid));
    drawPair("Balance", currency(Math.max(total - paid, 0)));
    if (isReceipt && Array.isArray(invoice.paymentHistory) && invoice.paymentHistory.length) {
      y -= 8;
      draw("Payments", margin, 12, bold, rgb(0.04, 0.22, 0.36));
      invoice.paymentHistory.forEach((payment: Record<string, any>) => {
        draw(`${shortDate(payment.date)} | ${payment.method || row.payment_method || "payment"} | ${currency(payment.amount)}${payment.checkNumber ? ` | Check ${payment.checkNumber}` : ""}`, margin, 10);
      });
    }
  }

  const bytes = await pdfDoc.save();
  return new Blob([bytes], { type: "application/pdf" });
}

async function getJobBlob(supabase: ReturnType<typeof createClient>, job: Record<string, unknown>) {
  if (FINANCE_SOURCE_TYPES.has(String(job.source_type))) {
    const table = job.source_type === "tuition_invoice" ? "tuition_invoices" : "incidental_invoices";
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("id", job.source_id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("The finance record could not be found.");
    const defaultName = financeBackupFilename(String(job.source_type === "tuition_invoice" ? "Tuition-Breakdown" : job.source_type === "incidental_receipt" ? "Receipt" : "Incidental-Invoice"), data);
    return {
      blob: await createFinancePdfBlob(data, String(job.source_type)),
      filename: String(job.filename || defaultName),
      mimeType: "application/pdf",
    };
  }

  const storage = await getJobStorage(supabase, job);
  if (!storage.bucket || !storage.path) throw new Error("The queued record does not have a stored PDF path yet.");
  const { data: pdfBlob, error: downloadError } = await supabase.storage.from(storage.bucket).download(storage.path);
  if (downloadError) throw downloadError;
  if (!pdfBlob) throw new Error("The stored PDF could not be downloaded from Supabase Storage.");
  return {
    blob: pdfBlob,
    filename: String(job.filename || storage.path.split("/").pop() || "WVCS Hub Backup.pdf"),
    mimeType: "application/pdf",
  };
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

  const file = await getJobBlob(supabase, job);

  const folder = await ensureTargetFolder(settings, job, accessToken);
  const uploaded = await uploadBlobToDrive({
    accessToken,
    folderId: folder.id,
    filename: file.filename,
    blob: file.blob,
    mimeType: file.mimeType,
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

function getSchoolYear(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return month >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function formatDatePart(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

async function fetchTableSnapshot(supabase: ReturnType<typeof createClient>, tableName: string) {
  const { data, error } = await supabase
    .from(tableName)
    .select("*")
    .limit(10000);
  if (error) {
    const message = String(error.message || "");
    if (/does not exist|schema cache|relation/i.test(message)) {
      return { table: tableName, skipped: true, reason: message, rows: [] };
    }
    throw error;
  }
  return { table: tableName, rowCount: data?.length || 0, rows: data || [] };
}

async function createDataSnapshot({
  supabase,
  settings,
  accessToken,
  requestedByEmail,
}: {
  supabase: ReturnType<typeof createClient>;
  settings: Record<string, unknown>;
  accessToken: string;
  requestedByEmail: string;
}) {
  const createdAt = new Date();
  const schoolYear = getSchoolYear(createdAt);
  const datePart = formatDatePart(createdAt);
  const uploaded = [];
  const failed = [];

  for (const dataset of SNAPSHOT_DATASETS) {
    try {
      const tables = [];
      for (const tableName of dataset.tables) {
        tables.push(await fetchTableSnapshot(supabase, tableName));
      }

      const folder = await ensureTargetFolder(
        settings,
        {
          target_folder_path: ["Data Snapshots", schoolYear, datePart, ...dataset.folder],
        },
        accessToken,
      );
      const payload = {
        backupType: "wvcs_hub_data_snapshot",
        dataset: dataset.key,
        label: dataset.label,
        createdAt: createdAt.toISOString(),
        requestedByEmail,
        schoolYear,
        tables,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: JSON_MIME });
      const file = await uploadBlobToDrive({
        accessToken,
        folderId: folder.id,
        filename: `${datePart}-${dataset.key}.json`,
        blob,
        mimeType: JSON_MIME,
      });
      uploaded.push({
        dataset: dataset.key,
        label: dataset.label,
        fileId: file.id,
        webViewLink: file.webViewLink,
        tableCount: tables.length,
        rowCount: tables.reduce((sum, table) => sum + Number(table.rowCount || 0), 0),
        skippedTables: tables.filter((table) => table.skipped).map((table) => table.table),
      });
    } catch (error) {
      failed.push({ dataset: dataset.key, label: dataset.label, error: error.message });
    }
  }

  return { uploaded, failed, schoolYear, datePart };
}

async function requireSuperuser(supabase: ReturnType<typeof createClient>, request: Request) {
  const authHeader = request.headers.get("Authorization") || "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) throw new Error("Sign in as a superuser to manage Drive backup.");

  const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
  if (userError) throw new Error("Sign in as a superuser to manage Drive backup.");
  const email = String(userData?.user?.email || "").trim().toLowerCase();
  if (!email) throw new Error("Sign in as a superuser to manage Drive backup.");

  const { data: staffRows, error: staffError } = await supabase
    .from("staff_access")
    .select("email,can_use_hub,can_manage_users")
    .eq("email", email)
    .limit(1);
  if (staffError) throw staffError;
  const staff = staffRows?.[0];
  if (email !== "mconniry@wvcs.org" && (!staff?.can_use_hub || !staff?.can_manage_users)) {
    throw new Error("Only superusers can manage Drive backup.");
  }
  return email;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let action = "test";

  try {
    const payload = await request.json().catch(() => ({}));
    action = payload.action || "test";
    const supabase = createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"));
    const requesterEmail = await requireSuperuser(supabase, request);

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

    if (action === "snapshot-data") {
      if (!settings.enabled) throw new Error("Drive backup is not enabled in settings.");
      if (!serviceAccountJson) throw new Error("Missing required secret: GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON");

      const accessToken = await getGoogleAccessToken(serviceAccountJson);
      const snapshot = await createDataSnapshot({
        supabase,
        settings,
        accessToken,
        requestedByEmail: requesterEmail,
      });

      return new Response(
        JSON.stringify({
          ok: true,
          ...snapshot,
          message: `Created ${snapshot.uploaded.length} data snapshot file${snapshot.uploaded.length === 1 ? "" : "s"}.`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ ok: false, error: `Unknown Drive backup action: ${action}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error.message || "Drive backup request failed.";
    const authorizationError = /superuser|not authorized|sign in/i.test(message);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: authorizationError ? 403 : action === "test" ? 200 : 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
