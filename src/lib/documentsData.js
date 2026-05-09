import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

const IMPORTANT_DOCUMENTS_BUCKET = "important-documents";

function sanitizePathPart(value) {
  return String(value || "file")
    .replace(/[^a-z0-9._-]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 90) || "file";
}

async function getSignedDocumentUrl(storagePath) {
  if (!storagePath) return "";
  const { data, error } = await supabase.storage
    .from(IMPORTANT_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) throw error;
  return data?.signedUrl || "";
}

async function mapDocumentFromDatabase(row) {
  return {
    id: row.id,
    title: row.title,
    category: row.category || "General",
    description: row.description || "",
    fileName: row.file_name,
    fileType: row.file_type || "application/octet-stream",
    fileSize: row.file_size || 0,
    dataUrl: await getSignedDocumentUrl(row.storage_path),
    storagePath: row.storage_path,
    displayOrder: row.display_order ?? 0,
    uploadedAt: row.uploaded_at || row.created_at,
  };
}

export async function fetchImportantDocuments() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", documents: [] };
  }

  const { data, error } = await supabase
    .from("important_documents")
    .select("*")
    .order("display_order", { ascending: true })
    .order("uploaded_at", { ascending: false });

  if (error) throw error;
  const documents = await Promise.all((data || []).map(mapDocumentFromDatabase));
  return { loaded: true, documents };
}

export async function uploadImportantDocument({ title, category, description, file, displayOrder = 0 }) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const id = crypto.randomUUID();
  const extension = file.name?.includes(".") ? file.name.split(".").pop() : "bin";
  const storagePath = `${id}/${sanitizePathPart(file.name || `document.${extension}`)}`;

  const { error: uploadError } = await supabase.storage
    .from(IMPORTANT_DOCUMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) throw uploadError;

  const row = {
    id,
    title,
    category,
    description,
    file_name: file.name,
    file_type: file.type || "application/octet-stream",
    file_size: file.size,
    storage_path: storagePath,
    display_order: displayOrder,
    uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("important_documents")
    .insert(row)
    .select("*")
    .single();

  if (error) throw error;
  return { saved: true, document: await mapDocumentFromDatabase(data) };
}

export async function updateImportantDocument(document) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { data, error } = await supabase
    .from("important_documents")
    .update({
      title: document.title,
      category: document.category || "General",
      description: document.description || "",
      display_order: document.displayOrder ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", document.id)
    .select("*")
    .single();

  if (error) throw error;
  return { saved: true, document: await mapDocumentFromDatabase(data) };
}

export async function reorderImportantDocuments(documents) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const updates = documents.map((document, index) =>
    supabase
      .from("important_documents")
      .update({
        display_order: index,
        updated_at: new Date().toISOString(),
      })
      .eq("id", document.id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw failed.error;
  return { saved: true };
}

export async function deleteImportantDocument(document) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  if (document.storagePath) {
    const { error: storageError } = await supabase.storage
      .from(IMPORTANT_DOCUMENTS_BUCKET)
      .remove([document.storagePath]);

    if (storageError) throw storageError;
  }

  const { error } = await supabase
    .from("important_documents")
    .delete()
    .eq("id", document.id);

  if (error) throw error;
  return { saved: true };
}
