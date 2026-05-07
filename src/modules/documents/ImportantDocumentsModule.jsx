import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  FileText,
  FolderOpen,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import {
  deleteImportantDocument,
  fetchImportantDocuments,
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
    uploadedAt: new Date().toISOString(),
  },
];

function loadDocuments() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    return saved ? JSON.parse(saved) : defaultDocuments;
  } catch {
    return defaultDocuments;
  }
}

function saveDocuments(documents) {
  localStorage.setItem(STORE_KEY, JSON.stringify(documents));
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
  return (
    document.dataUrl &&
    (document.fileType === "application/pdf" ||
      document.fileType.startsWith("image/") ||
      document.fileType.startsWith("text/"))
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

function DocumentList({ documents, selectedId, onSelect }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <FolderOpen size={16} className="text-sky-300" />
          Document Library
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
              <span>{document.fileName}</span>
              <span>{formatSize(document.fileSize)}</span>
              <span>{formatDate(document.uploadedAt)}</span>
            </div>
          </button>
        ))}
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
      setDocuments(result.documents);
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
      saveDocuments(next);
      return next;
    });
  }

  return [documents, updateDocuments, syncStatus, loadSharedDocuments];
}

export default function ImportantDocumentsModule() {
  const [documents] = useDocumentStore();
  const visibleDocuments = documents.filter((document) => document.dataUrl);
  const [selectedId, setSelectedId] = useState(visibleDocuments[0]?.id || "");
  const selectedDocument = useMemo(
    () => visibleDocuments.find((document) => document.id === selectedId) || visibleDocuments[0],
    [visibleDocuments, selectedId]
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
            <DocumentList documents={visibleDocuments} selectedId={selectedDocument?.id} onSelect={setSelectedId} />
            <main className="space-y-4">
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-xl font-bold text-white">{selectedDocument.title}</div>
                    <p className="mt-1 text-sm text-slate-400">{selectedDocument.description}</p>
                  </div>
                  <div className="flex gap-2">
                    <a
                      href={selectedDocument.dataUrl}
                      download={selectedDocument.fileName}
                      className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400"
                    >
                      <Download size={16} />
                      Download
                    </a>
                  </div>
                </div>
              </div>
              <DocumentPreview document={selectedDocument} />
            </main>
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
  const [draft, setDraft] = useState({
    title: "",
    category: "",
    description: "",
    file: null,
  });
  const [status, setStatus] = useState("");

  async function uploadDocument() {
    if (!draft.file || !draft.title.trim()) return;
    try {
      setStatus("Uploading document...");
      const uploadResult = await uploadImportantDocument({
        title: draft.title.trim(),
        category: draft.category.trim() || "General",
        description: draft.description.trim(),
        file: draft.file,
      });

      if (uploadResult.saved) {
        updateDocuments((current) => [uploadResult.document, ...current]);
        setDraft({ title: "", category: "", description: "", file: null });
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
        uploadedAt: new Date().toISOString(),
      };
      updateDocuments((current) => [document, ...current.filter((item) => item.dataUrl)]);
      setDraft({ title: "", category: "", description: "", file: null });
      setStatus(`Document saved locally. ${uploadResult.reason}`);
    } catch (error) {
      setStatus(`Unable to upload this document: ${error.message}`);
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
                Upload Document
              </div>
            </div>
            <div className="space-y-4 p-4">
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
              {status && <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-sky-200">{status}</div>}
              <button
                type="button"
                onClick={uploadDocument}
                disabled={!draft.title.trim() || !draft.file}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={16} />
                Add Document
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
              {documents.filter((document) => document.dataUrl).map((document) => (
                <div key={document.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{document.title}</div>
                      <div className="mt-1 text-xs text-slate-500">{document.category}</div>
                    </div>
                    <FileText size={18} className="text-slate-500" />
                  </div>
                  <p className="mt-3 min-h-10 text-sm text-slate-400">{document.description || "No description"}</p>
                  <div className="mt-3 grid gap-1 text-xs text-slate-500">
                    <div>{document.fileName}</div>
                    <div>{formatSize(document.fileSize)} • Uploaded {formatDate(document.uploadedAt)}</div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {canPreview(document) && (
                      <a
                        href={document.dataUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                      >
                        <Eye size={14} />
                        View
                      </a>
                    )}
                    <a
                      href={document.dataUrl}
                      download={document.fileName}
                      className="inline-flex items-center gap-2 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25"
                    >
                      <Download size={14} />
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => removeDocument(document)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-rose-400 hover:text-rose-200"
                    >
                      <Trash2 size={14} />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              {!documents.some((document) => document.dataUrl) && (
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
