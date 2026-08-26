import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Download,
  Edit3,
  Eye,
  FileText,
  FolderOpen,
  Plus,
  Printer,
  Search,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  createEditableImportantDocument,
  deleteImportantDocument,
  fetchImportantDocuments,
  replaceImportantDocumentFile,
  reorderImportantDocuments,
  updateImportantDocument,
  uploadImportantDocument,
} from "../../lib/documentsData.js";

const STORE_KEY = "wvcs-important-documents-v1";

const defaultDocuments = [
  {
    id: "doc-sample-handbook",
    title: "Staff Handbook",
    category: "Policies",
    description: "Sample document placeholder. Upload official documents in Admin.",
    fileName: "Staff Handbook.pdf",
    fileType: "application/pdf",
    fileSize: 0,
    dataUrl: "",
    documentType: "file",
    contentHtml: "",
    contentText: "",
    versionHistory: [],
    displayOrder: 0,
    uploadedAt: new Date().toISOString(),
  },
];

function normalizeDocuments(documents) {
  return documents
    .map((document, index) => ({
      ...document,
      documentType: document.documentType || (document.contentHtml ? "editable" : "file"),
      contentHtml: document.contentHtml || "",
      contentText: document.contentText || "",
      versionHistory: document.versionHistory || [],
      displayOrder: document.displayOrder ?? index,
    }))
    .sort(compareDocuments);
}

function loadDocuments() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return normalizeDocuments(saved ? JSON.parse(saved) : defaultDocuments);
  } catch {
    return normalizeDocuments(defaultDocuments);
  }
}

function saveDocuments(documents) {
  localStorage.setItem(STORE_KEY, JSON.stringify(normalizeDocuments(documents)));
}

function compareDocuments(a, b) {
  const orderCompare = (a.displayOrder ?? 0) - (b.displayOrder ?? 0);
  if (orderCompare !== 0) return orderCompare;
  return new Date(b.uploadedAt || 0) - new Date(a.uploadedAt || 0);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatSize(size) {
  if (!size) return "File pending";
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function canPreview(document) {
  if (document.documentType === "editable") return true;
  return (
    document.dataUrl &&
    (document.fileType === "application/pdf" ||
      document.fileType.startsWith("image/") ||
      document.fileType.startsWith("text/"))
  );
}

function plainTextFromHtml(html) {
  if (!html) return "";
  const container = document.createElement("div");
  container.innerHTML = html;
  return container.textContent || "";
}

function sanitizeEditableHtml(html) {
  if (!html) return "";
  const allowedTags = new Set(["DIV", "P", "BR", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI", "H2", "H3", "H4", "BLOCKQUOTE", "A"]);
  const template = document.createElement("template");
  template.innerHTML = html;
  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        if (!allowedTags.has(child.tagName)) {
          child.replaceWith(...child.childNodes);
          return;
        }
        [...child.attributes].forEach((attribute) => {
          const name = attribute.name.toLowerCase();
          if (name.startsWith("on") || name === "style" || name === "class") child.removeAttribute(attribute.name);
          if (child.tagName === "A" && name === "href" && !/^https?:\/\//i.test(attribute.value)) {
            child.removeAttribute(attribute.name);
          }
        });
      }
      walk(child);
    });
  };
  walk(template.content);
  return template.innerHTML;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function editableDocumentHtml(document) {
  return `<!doctype html>
<html>
  <head>
    <title>${escapeHtml(document.title || "WVCS Document")}</title>
    <style>
      @page { size: letter portrait; margin: 0.55in; }
      body { margin: 0; color: #0f172a; font-family: Arial, Helvetica, sans-serif; background: white; }
      .document { max-width: 760px; margin: 0 auto; }
      .header { border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 22px; }
      .school { color: #0369a1; font-size: 11px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; }
      h1 { margin: 6px 0 0; font-size: 26px; line-height: 1.2; }
      .meta { margin-top: 8px; color: #64748b; font-size: 12px; }
      .content { font-size: 14px; line-height: 1.65; }
      .content h2 { font-size: 19px; margin: 22px 0 8px; }
      .content h3 { font-size: 16px; margin: 18px 0 7px; }
      .content p { margin: 0 0 11px; }
      .content ul, .content ol { margin-top: 6px; padding-left: 24px; }
      .footer { border-top: 1px solid #cbd5e1; margin-top: 28px; padding-top: 10px; color: #64748b; font-size: 11px; }
    </style>
  </head>
  <body>
    <main class="document">
      <header class="header">
        <div class="school">Willamette Valley Christian School</div>
        <h1>${escapeHtml(document.title || "Important Document")}</h1>
        <div class="meta">${escapeHtml(document.category || "General")}${document.publishedAt ? ` | Updated ${escapeHtml(formatDate(document.publishedAt))}` : ""}</div>
      </header>
      <section class="content">${document.contentHtml || "<p>No document content yet.</p>"}</section>
      <footer class="footer">WVCS School Hub | 9075 Pueblo Ave. NE, Brooks, OR 97305 | 503-393-5236</footer>
    </main>
  </body>
</html>`;
}

function printEditableDocument(document) {
  const printWindow = window.open("", "_blank", "noopener,noreferrer");
  if (!printWindow) return;
  printWindow.document.write(editableDocumentHtml(document));
  printWindow.document.close();
  printWindow.focus();
  window.setTimeout(() => printWindow.print(), 300);
}

function RichTextEditor({ value, onChange, minHeight = "min-h-56" }) {
  const editorRef = useRef(null);

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || "<p></p>";
    }
  }, [value]);

  function runCommand(command, argument = null) {
    editorRef.current?.focus();
    document.execCommand(command, false, argument);
    onChange(sanitizeEditableHtml(editorRef.current?.innerHTML || ""));
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
      <div className="flex flex-wrap gap-1 border-b border-slate-800 bg-slate-900 p-2">
        {[
          ["bold", "B"],
          ["italic", "I"],
          ["underline", "U"],
        ].map(([command, label]) => (
          <button
            key={command}
            type="button"
            onClick={() => runCommand(command)}
            className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-slate-700 px-2 text-xs font-black text-slate-200 hover:bg-slate-800"
          >
            {label}
          </button>
        ))}
        <button type="button" onClick={() => runCommand("formatBlock", "h2")} className="inline-flex h-8 items-center justify-center rounded-md border border-slate-700 px-2 text-xs font-bold text-slate-200 hover:bg-slate-800">H2</button>
        <button type="button" onClick={() => runCommand("formatBlock", "h3")} className="inline-flex h-8 items-center justify-center rounded-md border border-slate-700 px-2 text-xs font-bold text-slate-200 hover:bg-slate-800">H3</button>
        <button type="button" onClick={() => runCommand("insertUnorderedList")} className="inline-flex h-8 items-center justify-center rounded-md border border-slate-700 px-2 text-xs font-bold text-slate-200 hover:bg-slate-800">List</button>
        <button type="button" onClick={() => runCommand("insertOrderedList")} className="inline-flex h-8 items-center justify-center rounded-md border border-slate-700 px-2 text-xs font-bold text-slate-200 hover:bg-slate-800">1. List</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={(event) => onChange(sanitizeEditableHtml(event.currentTarget.innerHTML))}
        onBlur={(event) => onChange(sanitizeEditableHtml(event.currentTarget.innerHTML))}
        className={`${minHeight} w-full overflow-auto bg-white px-4 py-3 text-sm leading-7 text-slate-950 outline-none`}
      />
    </div>
  );
}

function DocumentPreview({ document }) {
  if (!document) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-sm text-slate-400">
        Select a document to preview.
      </div>
    );
  }

  if (document.documentType === "editable") {
    return (
      <article className="min-h-[680px] rounded-lg border border-slate-800 bg-white p-6 text-slate-950 shadow-inner sm:p-8">
        <div className="border-b border-slate-200 pb-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Willamette Valley Christian School</div>
          <h2 className="mt-2 text-2xl font-black text-slate-950">{document.title}</h2>
          <div className="mt-1 text-xs font-semibold text-slate-500">
            {document.category || "General"}{document.publishedAt ? ` | Updated ${formatDate(document.publishedAt)}` : ""}
          </div>
        </div>
        <div
          className="prose prose-slate mt-5 max-w-none text-sm leading-7"
          dangerouslySetInnerHTML={{ __html: document.contentHtml || "<p>No document content yet.</p>" }}
        />
      </article>
    );
  }

  if (!canPreview(document)) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-center">
        <FileText size={42} className="text-slate-500" />
        <div className="mt-3 text-sm font-semibold text-white">Preview unavailable</div>
        <p className="mt-2 max-w-sm text-sm text-slate-400">
          This file type can still be downloaded, but the browser cannot preview it here.
        </p>
      </div>
    );
  }

  if (document.fileType.startsWith("image/")) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-slate-800 bg-slate-950 p-4">
        <img src={document.dataUrl} alt={document.title} className="max-h-[680px] max-w-full rounded-lg object-contain" />
      </div>
    );
  }

  return (
    <iframe
      title={document.title}
      src={document.dataUrl}
      className="min-h-[680px] w-full rounded-lg border border-slate-800 bg-white"
    />
  );
}

function DocumentList({ documents, selectedId, onSelect, query, onQueryChange, totalCount }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-4">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <FolderOpen size={16} className="text-sky-300" />
              Document Library
            </div>
            <div className="text-xs font-semibold text-slate-500">
              {documents.length} of {totalCount}
            </div>
          </div>
          <label className="relative block">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Search documents..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-sky-400"
            />
          </label>
        </div>
      </div>
      <div className="max-h-[720px] overflow-auto p-2">
        {documents.map((document) => (
          <button
            key={document.id}
            type="button"
            onClick={() => onSelect(document.id)}
            className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
              selectedId === document.id
                ? "border-sky-400 bg-sky-500/15"
                : "border-slate-800 bg-slate-950 hover:border-slate-600"
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{document.title}</div>
                <div className="mt-1 text-xs text-slate-500">{document.category || "General"}</div>
              </div>
              <FileText size={16} className="text-slate-500" />
            </div>
            <p className="mt-2 line-clamp-2 text-xs text-slate-400">{document.description}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold text-slate-500">
              <span>{document.documentType === "editable" ? "Editable Hub Document" : document.fileName}</span>
              <span>{document.documentType === "editable" ? `${document.versionHistory?.length || 0} saved version(s)` : formatSize(document.fileSize)}</span>
              <span>{formatDate(document.publishedAt || document.uploadedAt)}</span>
            </div>
          </button>
        ))}
        {!documents.length && (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-center text-sm text-slate-400">
            No documents match your search.
          </div>
        )}
      </div>
    </div>
  );
}

function useDocumentStore() {
  const [documents, setDocuments] = useState(loadDocuments);
  const [syncStatus, setSyncStatus] = useState("Loading shared documents...");

  async function loadSharedDocuments() {
    try {
      const result = await fetchImportantDocuments();
      if (!result.loaded) {
        setSyncStatus(result.reason);
        return;
      }
      setDocuments(normalizeDocuments(result.documents));
      setSyncStatus("Shared documents loaded.");
    } catch (error) {
      setSyncStatus(`Unable to load shared documents: ${error.message}`);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(loadSharedDocuments, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function updateDocuments(updater) {
    setDocuments((current) => {
      const next = updater(current);
      const normalizedNext = normalizeDocuments(next);
      saveDocuments(normalizedNext);
      return normalizedNext;
    });
  }

  return [documents, updateDocuments, syncStatus, loadSharedDocuments];
}

export default function ImportantDocumentsModule() {
  const [documents] = useDocumentStore();
  const [query, setQuery] = useState("");
  const visibleDocuments = normalizeDocuments(documents.filter((document) => document.dataUrl || document.documentType === "editable"));
  const filteredDocuments = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return visibleDocuments;
    return visibleDocuments.filter((document) =>
      [
        document.title,
        document.category,
        document.description,
        document.fileName,
        document.contentText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, visibleDocuments]);
  const [selectedId, setSelectedId] = useState(visibleDocuments[0]?.id || "");
  const selectedDocument = useMemo(
    () => filteredDocuments.find((document) => document.id === selectedId) || filteredDocuments[0],
    [filteredDocuments, selectedId]
  );

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Staff Resources</div>
          <h1 className="mt-2 text-2xl font-bold text-white">Important Documents</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            View important school documents in the browser or download a copy.
          </p>
        </div>

        {visibleDocuments.length ? (
          <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <DocumentList
              documents={filteredDocuments}
              selectedId={selectedDocument?.id}
              onSelect={setSelectedId}
              query={query}
              onQueryChange={setQuery}
              totalCount={visibleDocuments.length}
            />
            {selectedDocument ? (
              <main className="space-y-4">
                <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xl font-bold text-white">{selectedDocument.title}</div>
                      <p className="mt-1 text-sm text-slate-400">{selectedDocument.description}</p>
                    </div>
                    <div className="flex gap-2">
                      {selectedDocument.documentType === "editable" ? (
                        <button
                          type="button"
                          onClick={() => printEditableDocument(selectedDocument)}
                          className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400"
                        >
                          <Printer size={16} />
                          Print / PDF
                        </button>
                      ) : (
                        <a
                          href={selectedDocument.dataUrl}
                          download={selectedDocument.fileName}
                          className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400"
                        >
                          <Download size={16} />
                          Download
                        </a>
                      )}
                    </div>
                  </div>
                </div>
                <DocumentPreview document={selectedDocument} />
              </main>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-slate-700 bg-slate-900 p-8 text-center text-sm text-slate-400">
                Try a different search term to preview a document.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900 p-8 text-center">
            <FileText size={42} className="mx-auto text-slate-500" />
            <div className="mt-3 text-lg font-semibold text-white">No documents uploaded yet</div>
            <p className="mt-2 text-sm text-slate-400">Administrators can add documents from the Admin area.</p>
          </div>
        )}
      </div>
    </section>
  );
}

export function AdminDocumentsModule() {
  const [documents, updateDocuments, syncStatus, loadSharedDocuments] = useDocumentStore();
  const [draftType, setDraftType] = useState("file");
  const [draft, setDraft] = useState({
    title: "",
    category: "",
    description: "",
    file: null,
    contentHtml: "<p></p>",
  });
  const [editingId, setEditingId] = useState("");
  const [editDraft, setEditDraft] = useState({ title: "", category: "", description: "", contentHtml: "" });
  const [replacementFiles, setReplacementFiles] = useState({});
  const [status, setStatus] = useState("");
  const visibleDocuments = normalizeDocuments(documents.filter((document) => document.dataUrl || document.documentType === "editable"));

  function startEditing(document) {
    setEditingId(document.id);
    setEditDraft({
      title: document.title,
      category: document.category || "General",
      description: document.description || "",
      contentHtml: document.contentHtml || "<p></p>",
    });
    setStatus("");
  }

  function resetDraft() {
    setDraft({ title: "", category: "", description: "", file: null, contentHtml: "<p></p>" });
  }

  async function uploadDocument() {
    if (!draft.file || !draft.title.trim()) return;
    try {
      setStatus("Uploading document...");
      const nextDisplayOrder = visibleDocuments.length
        ? Math.min(...visibleDocuments.map((document) => document.displayOrder ?? 0)) - 1
        : 0;
      const uploadResult = await uploadImportantDocument({
        title: draft.title.trim(),
        category: draft.category.trim() || "General",
        description: draft.description.trim(),
        file: draft.file,
        displayOrder: nextDisplayOrder,
      });

      if (uploadResult.saved) {
        updateDocuments((current) => [uploadResult.document, ...current]);
        resetDraft();
        setStatus("Document uploaded to shared storage and available to staff.");
        await loadSharedDocuments();
        return;
      }

      const dataUrl = await readFileAsDataUrl(draft.file);
      const document = {
        id: crypto.randomUUID(),
        title: draft.title.trim(),
        category: draft.category.trim() || "General",
        description: draft.description.trim(),
        fileName: draft.file.name,
        fileType: draft.file.type || "application/octet-stream",
        fileSize: draft.file.size,
        dataUrl,
        documentType: "file",
        contentHtml: "",
        contentText: "",
        versionHistory: [],
        displayOrder: nextDisplayOrder,
        uploadedAt: new Date().toISOString(),
      };
      updateDocuments((current) => [document, ...current.filter((item) => item.dataUrl)]);
      resetDraft();
      setStatus(`Document saved locally. ${uploadResult.reason}`);
    } catch (error) {
      setStatus(`Unable to upload this document: ${error.message}`);
    }
  }

  async function createEditableDocument() {
    if (!draft.title.trim()) return;
    const contentHtml = sanitizeEditableHtml(draft.contentHtml || "");
    const contentText = plainTextFromHtml(contentHtml);
    if (!contentText.trim()) {
      setStatus("Add document content before publishing.");
      return;
    }
    try {
      setStatus("Publishing editable document...");
      const nextDisplayOrder = visibleDocuments.length
        ? Math.min(...visibleDocuments.map((document) => document.displayOrder ?? 0)) - 1
        : 0;
      const result = await createEditableImportantDocument({
        title: draft.title.trim(),
        category: draft.category.trim() || "General",
        description: draft.description.trim(),
        contentHtml,
        contentText,
        displayOrder: nextDisplayOrder,
      });
      if (result.saved) {
        updateDocuments((current) => [result.document, ...current]);
        resetDraft();
        setStatus("Editable document published and available to staff.");
        await loadSharedDocuments();
        return;
      }
      const localDocument = {
        id: crypto.randomUUID(),
        title: draft.title.trim(),
        category: draft.category.trim() || "General",
        description: draft.description.trim(),
        documentType: "editable",
        fileName: "",
        fileType: "text/html",
        fileSize: new Blob([contentHtml]).size,
        dataUrl: "",
        storagePath: "",
        contentHtml,
        contentText,
        versionHistory: [],
        displayOrder: nextDisplayOrder,
        uploadedAt: new Date().toISOString(),
        publishedAt: new Date().toISOString(),
      };
      updateDocuments((current) => [localDocument, ...current]);
      resetDraft();
      setStatus(`Editable document saved locally. ${result.reason}`);
    } catch (error) {
      setStatus(`Unable to publish editable document: ${error.message}`);
    }
  }

  async function saveDocumentEdits(document) {
    const updatedDocument = {
      ...document,
      title: editDraft.title.trim(),
      category: editDraft.category.trim() || "General",
      description: editDraft.description.trim(),
      contentHtml: document.documentType === "editable" ? sanitizeEditableHtml(editDraft.contentHtml || "") : document.contentHtml,
      contentText: document.documentType === "editable" ? plainTextFromHtml(editDraft.contentHtml || "") : document.contentText,
    };
    if (!updatedDocument.title) return;

    try {
      setStatus("Saving document changes...");
      const result = await updateImportantDocument(updatedDocument, { previousDocument: document });
      updateDocuments((current) =>
        current.map((item) => (item.id === document.id ? (result.saved ? result.document : updatedDocument) : item))
      );
      setEditingId("");
      setStatus(result.saved ? "Document details updated." : `Document details saved locally. ${result.reason}`);
    } catch (error) {
      setStatus(`Unable to save document changes: ${error.message}`);
    }
  }

  async function replaceDocument(document) {
    const file = replacementFiles[document.id];
    if (!file) return;
    try {
      setStatus("Replacing document file...");
      const result = await replaceImportantDocumentFile(document, file);
      updateDocuments((current) =>
        current.map((item) => (item.id === document.id ? (result.saved ? result.document : { ...document, fileName: file.name, fileType: file.type || "application/octet-stream", fileSize: file.size }) : item))
      );
      setReplacementFiles((current) => ({ ...current, [document.id]: null }));
      setStatus(result.saved ? "Document file replaced." : `Replacement saved locally. ${result.reason}`);
      if (result.saved) await loadSharedDocuments();
    } catch (error) {
      setStatus(`Unable to replace document file: ${error.message}`);
    }
  }

  async function moveDocument(document, direction) {
    const currentIndex = visibleDocuments.findIndex((item) => item.id === document.id);
    const targetIndex = currentIndex + direction;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= visibleDocuments.length) return;

    const reordered = [...visibleDocuments];
    const [movedDocument] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, movedDocument);
    const orderedDocuments = reordered.map((item, index) => ({ ...item, displayOrder: index }));

    updateDocuments((current) =>
      current.map((item) => {
        const orderedDocument = orderedDocuments.find((orderedItem) => orderedItem.id === item.id);
        return orderedDocument || item;
      })
    );

    try {
      setStatus("Saving document order...");
      const result = await reorderImportantDocuments(orderedDocuments);
      setStatus(result.saved ? "Document order updated." : `Document order saved locally. ${result.reason}`);
    } catch (error) {
      setStatus(`Document order changed locally. Shared sync failed: ${error.message}`);
    }
  }

  async function removeDocument(document) {
    try {
      const deleteResult = await deleteImportantDocument(document);
      updateDocuments((current) => current.filter((item) => item.id !== document.id));
      setStatus(deleteResult.saved ? "Document removed from shared storage." : `Document removed locally. ${deleteResult.reason}`);
    } catch (error) {
      setStatus(`Unable to remove document: ${error.message}`);
    }
  }

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-5">
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Administration</div>
          <h1 className="mt-2 text-2xl font-bold text-white">Important Documents</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Upload documents staff can view in the browser or download from the Important Documents module.
          </p>
        </div>

        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <aside className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Upload size={16} className="text-sky-300" />
                Add Document
              </div>
            </div>
            <div className="space-y-4 p-4">
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-800 bg-slate-950 p-1">
                {[
                  ["file", "Upload File"],
                  ["editable", "Editable Document"],
                ].map(([type, label]) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setDraftType(type)}
                    className={`rounded-md px-3 py-2 text-xs font-bold transition ${
                      draftType === type ? "bg-sky-500 text-white" : "text-slate-400 hover:bg-slate-900 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Document Title
                <input
                  value={draft.title}
                  onChange={(event) => setDraft({ ...draft, title: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Category
                <input
                  value={draft.category}
                  onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-200">
                Description
                <textarea
                  value={draft.description}
                  onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                  className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
              </label>
              {draftType === "file" ? (
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  File
                  <div className="relative">
                    <input
                      type="file"
                      onChange={(event) => setDraft({ ...draft, file: event.target.files?.[0] || null })}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                      <FileText size={15} />
                      <span className="truncate">{draft.file?.name || "Choose file"}</span>
                    </div>
                  </div>
                </label>
              ) : (
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Document Content
                  <RichTextEditor
                    value={draft.contentHtml}
                    onChange={(contentHtml) => setDraft((current) => ({ ...current, contentHtml }))}
                  />
                </label>
              )}
              {status && <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-sky-200">{status}</div>}
              <button
                type="button"
                onClick={draftType === "file" ? uploadDocument : createEditableDocument}
                disabled={!draft.title.trim() || (draftType === "file" ? !draft.file : !plainTextFromHtml(draft.contentHtml).trim())}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} />
                {draftType === "file" ? "Add Uploaded File" : "Publish Editable Document"}
              </button>
              <p className="text-xs leading-5 text-slate-500">
                {syncStatus}
              </p>
            </div>
          </aside>

          <main className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <FolderOpen size={16} className="text-sky-300" />
                Uploaded Documents
              </div>
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {visibleDocuments.map((document, index) => {
                const isEditing = editingId === document.id;
                return (
                <div key={document.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                  {isEditing ? (
                    <div className="space-y-3">
                      <label className="space-y-1 text-xs font-semibold text-slate-300">
                        Title
                        <input
                          value={editDraft.title}
                          onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-slate-300">
                        Category
                        <input
                          value={editDraft.category}
                          onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value })}
                          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                        />
                      </label>
                      <label className="space-y-1 text-xs font-semibold text-slate-300">
                        Description
                        <textarea
                          value={editDraft.description}
                          onChange={(event) => setEditDraft({ ...editDraft, description: event.target.value })}
                          className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                        />
                      </label>
                      {document.documentType === "editable" && (
                        <label className="space-y-1 text-xs font-semibold text-slate-300">
                          Document Content
                          <RichTextEditor
                            value={editDraft.contentHtml}
                            onChange={(contentHtml) => setEditDraft((current) => ({ ...current, contentHtml }))}
                            minHeight="min-h-72"
                          />
                        </label>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-white">{document.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{document.category}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-400">
                            #{index + 1}
                          </span>
                          <FileText size={18} className="text-slate-500" />
                        </div>
                      </div>
                      <p className="mt-3 min-h-10 text-sm text-slate-400">{document.description || "No description"}</p>
                    </>
                  )}
                  <div className="mt-3 grid gap-1 text-xs text-slate-500">
                    <div>{document.documentType === "editable" ? "Editable Hub Document" : document.fileName}</div>
                    <div>
                      {document.documentType === "editable"
                        ? `${document.versionHistory?.length || 0} saved version(s) | Updated ${formatDate(document.publishedAt || document.uploadedAt)}`
                        : `${formatSize(document.fileSize)} | Uploaded ${formatDate(document.uploadedAt)}`}
                    </div>
                  </div>
                  {!isEditing && document.documentType === "file" && (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label className="relative min-w-0 flex-1">
                          <input
                            type="file"
                            onChange={(event) => setReplacementFiles((current) => ({ ...current, [document.id]: event.target.files?.[0] || null }))}
                            className="absolute inset-0 cursor-pointer opacity-0"
                          />
                          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                            <Upload size={14} />
                            <span className="truncate">{replacementFiles[document.id]?.name || "Choose replacement file"}</span>
                          </div>
                        </label>
                        <button
                          type="button"
                          onClick={() => replaceDocument(document)}
                          disabled={!replacementFiles[document.id]}
                          className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Upload size={14} />
                          Replace File
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => saveDocumentEdits(document)}
                          disabled={!editDraft.title.trim()}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Save size={14} />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId("")}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
                        >
                          <X size={14} />
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => moveDocument(document, -1)}
                          disabled={index === 0}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowUp size={14} />
                          Up
                        </button>
                        <button
                          type="button"
                          onClick={() => moveDocument(document, 1)}
                          disabled={index === visibleDocuments.length - 1}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ArrowDown size={14} />
                          Down
                        </button>
                        <button
                          type="button"
                          onClick={() => startEditing(document)}
                          className="inline-flex items-center gap-2 rounded-lg border border-amber-500/60 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-100 hover:bg-amber-500/25"
                        >
                          <Edit3 size={14} />
                          Edit
                        </button>
                      </>
                    )}
                    {document.documentType === "editable" ? (
                      <button
                        type="button"
                        onClick={() => printEditableDocument(document)}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                      >
                        <Printer size={14} />
                        Print / PDF
                      </button>
                    ) : canPreview(document) ? (
                      <a
                        href={document.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                      >
                        <Eye size={14} />
                        View
                      </a>
                    ) : null}
                    {document.documentType === "file" && (
                      <a
                        href={document.dataUrl}
                        download={document.fileName}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25"
                      >
                        <Download size={14} />
                        Download
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => removeDocument(document)}
                      disabled={isEditing}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-200"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                </div>
              );
              })}
              {!visibleDocuments.length && (
                <div className="md:col-span-2 rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-center text-sm text-slate-400">
                  No documents uploaded yet.
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </section>
  );
}
