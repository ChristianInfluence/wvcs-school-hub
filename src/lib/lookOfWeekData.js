import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const LOOK_OF_WEEK_BUCKET = "look-of-the-week";

function sanitizePathPart(value) {
  return String(value || "file")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "file";
}

async function getSignedUrl(storagePath) {
  if (!storagePath) return "";
  const { data, error } = await supabase.storage
    .from(LOOK_OF_WEEK_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) throw error;
  return data?.signedUrl || "";
}

async function mapIssueFromDatabase(row) {
  return {
    id: row.id,
    title: row.title,
    weekOf: row.week_of,
    notes: row.notes || "",
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size || 0,
    storagePath: row.storage_path,
    pdfUrl: await getSignedUrl(row.storage_path),
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}

export async function fetchLookOfWeekIssues() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", issues: [] };
  }

  const { data, error } = await supabase
    .from("look_of_week_issues")
    .select("*")
    .order("week_of", { ascending: false });

  if (error) throw error;
  const issues = await Promise.all((data || []).map(mapIssueFromDatabase));
  return { loaded: true, issues };
}

export async function uploadLookOfWeekIssue({ title, weekOf, notes, file }) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const id = crypto.randomUUID();
  const fileName = file.name || "look-of-the-week.pdf";
  const storagePath = `${weekOf || "undated"}/${id}-${sanitizePathPart(fileName)}`;

  const { error: uploadError } = await supabase.storage
    .from(LOOK_OF_WEEK_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/pdf",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const row = {
    id,
    title,
    week_of: weekOf,
    notes,
    file_name: fileName,
    file_type: file.type || "application/pdf",
    file_size: file.size,
    storage_path: storagePath,
    published_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("look_of_week_issues")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return { saved: true, issue: await mapIssueFromDatabase(data) };
}

export async function deleteLookOfWeekIssue(issue) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  if (issue.storagePath) {
    const { error: storageError } = await supabase.storage
      .from(LOOK_OF_WEEK_BUCKET)
      .remove([issue.storagePath]);

    if (storageError) throw storageError;
  }

  const { error } = await supabase
    .from("look_of_week_issues")
    .delete()
    .eq("id", issue.id);

  if (error) throw error;
  return { saved: true };
}
