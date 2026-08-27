import { isSupabaseConfigured, supabase } from "./supabaseClient.js";
import { firstReturnedRow } from "./supabaseResponse.js";

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
  const documentType = row.document_type || (row.content_html ? "editable" : "file");
  return {
    id: row.id,
    title: row.title,
    category: row.category || "General",
    description: row.description || "",
    documentType,
    fileName: row.file_name || "",
    fileType: row.file_type || "application/octet-stream",
    fileSize: row.file_size || 0,
    dataUrl: documentType === "file" ? await getSignedDocumentUrl(row.storage_path) : "",
    storagePath: row.storage_path || "",
    contentHtml: row.content_html || "",
    contentText: row.content_text || "",
    versionHistory: row.version_history || [],
    displayOrder: row.display_order ?? 0,
    uploadedAt: row.uploaded_at || row.created_at,
    publishedAt: row.published_at || "",
    publishedByEmail: row.published_by_email || "",
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
    document_type: "file",
    file_name: file.name,
    file_type: file.type || "application/octet-stream",
    file_size: file.size,
    storage_path: storagePath,
    content_html: "",
    content_text: "",
    version_history: [],
    display_order: displayOrder,
    uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("important_documents")
    .insert(row)
    .select("*");

  if (error) throw error;
  return { saved: true, document: await mapDocumentFromDatabase(firstReturnedRow(data, "Document could not be uploaded.")) };
}

export async function createEditableImportantDocument({ title, category, description, contentHtml, contentText, displayOrder = 0, currentUserEmail = "" }) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const now = new Date().toISOString();
  const row = {
    id: crypto.randomUUID(),
    title,
    category: category || "General",
    description: description || "",
    document_type: "editable",
    file_name: "",
    file_type: "text/html",
    file_size: new Blob([contentHtml || ""]).size,
    storage_path: "",
    content_html: contentHtml || "",
    content_text: contentText || "",
    version_history: [],
    display_order: displayOrder,
    uploaded_at: now,
    published_at: now,
    published_by_email: currentUserEmail || null,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("important_documents")
    .insert(row)
    .select("*");

  if (error) throw error;
  return { saved: true, document: await mapDocumentFromDatabase(firstReturnedRow(data, "Editable document could not be created.")) };
}

export async function updateImportantDocument(document, options = {}) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const isEditable = document.documentType === "editable";
  const previousVersion = options.previousDocument && isEditable
    ? {
        savedAt: new Date().toISOString(),
        title: options.previousDocument.title || "",
        category: options.previousDocument.category || "General",
        description: options.previousDocument.description || "",
        contentHtml: options.previousDocument.contentHtml || "",
        contentText: options.previousDocument.contentText || "",
      }
    : null;
  const versionHistory = previousVersion
    ? [previousVersion, ...(document.versionHistory || [])].slice(0, 12)
    : document.versionHistory || [];

  const { data, error } = await supabase
    .from("important_documents")
    .update({
      title: document.title,
      category: document.category || "General",
      description: document.description || "",
      ...(isEditable
        ? {
            document_type: "editable",
            file_type: "text/html",
            file_size: new Blob([document.contentHtml || ""]).size,
            content_html: document.contentHtml || "",
            content_text: document.contentText || "",
            version_history: versionHistory,
            published_at: new Date().toISOString(),
            published_by_email: options.currentUserEmail || document.publishedByEmail || null,
          }
        : {}),
      display_order: document.displayOrder ?? 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", document.id)
    .select("*");

  if (error) throw error;
  return { saved: true, document: await mapDocumentFromDatabase(firstReturnedRow(data, "Document was not found or you do not have permission to update it.")) };
}

export async function replaceImportantDocumentFile(document, file) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };
  if (!file) throw new Error("Choose a replacement file.");

  const storagePath = `${document.id}/${sanitizePathPart(file.name || "document.bin")}`;
  const storageRemovals = document.storagePath && document.storagePath !== storagePath ? [document.storagePath] : [];

  const { error: uploadError } = await supabase.storage
    .from(IMPORTANT_DOCUMENTS_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

  if (uploadError) throw uploadError;

  if (storageRemovals.length) {
    const { error: removeError } = await supabase.storage
      .from(IMPORTANT_DOCUMENTS_BUCKET)
      .remove(storageRemovals);

    if (removeError) console.warn("Old document file cleanup failed:", removeError.message);
  }

  const previousVersion = {
    savedAt: new Date().toISOString(),
    title: document.title || "",
    category: document.category || "General",
    description: document.description || "",
    fileName: document.fileName || "",
    fileType: document.fileType || "",
    fileSize: document.fileSize || 0,
    storagePath: document.storagePath || "",
  };

  const { data, error } = await supabase
    .from("important_documents")
    .update({
      document_type: "file",
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      file_size: file.size,
      storage_path: storagePath,
      content_html: "",
      content_text: "",
      version_history: [previousVersion, ...(document.versionHistory || [])].slice(0, 12),
      uploaded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", document.id)
    .select("*");

  if (error) throw error;
  return { saved: true, document: await mapDocumentFromDatabase(firstReturnedRow(data, "Document was not found or you do not have permission to replace it.")) };
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
