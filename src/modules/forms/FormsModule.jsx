import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import html2pdf from "html2pdf.js";
import { PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFTextField, PDFDocument } from "pdf-lib";
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Copy,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import { handleFormApprovalAction, handleFormShareLink, sendFormNotification } from "../../lib/formNotifications.js";
import {
  deleteFormTemplate,
  createStoredFileUrl,
  fetchFormSubmissions,
  fetchFormTemplates,
  saveFormSubmission,
  saveFormTemplate,
  storedFileToAttachment,
  uploadFormAnswerFile,
  uploadFormPdfBlob,
} from "../../lib/formsData.js";
import warriorHeadNew from "../../assets/warrior-head-new.png";

const STORE_KEY = "wvcs-forms-workflow-v1";
const SIGNATURE_KEY = "wvcs-forms-approval-signature";

const defaultTemplates = [
  {
    id: "field-trip-request",
    title: "Field Trip Request",
    category: "Activities",
    description: "Request transportation, supervision, and administrative approval for a class trip.",
    pdfName: "Field Trip Request.pdf",
    approver: "Principal",
    recipients: ["office@wvcs.org", "principal@wvcs.org"],
    finalCopyRecipients: ["mconniry@wvcs.org"],
    active: true,
    fields: [
      { id: "destination", label: "Destination", type: "text", required: true },
      { id: "date", label: "Requested Date", type: "date", required: true },
      { id: "students", label: "Estimated Students", type: "number", required: true },
      { id: "purpose", label: "Instructional Purpose", type: "textarea", required: true },
    ],
  },
  {
    id: "purchase-request",
    title: "Purchase Request",
    category: "Business Office",
    description: "Submit a purchase request for administrative review before ordering.",
    pdfName: "Purchase Request.pdf",
    approver: "Business Office",
    recipients: ["businessoffice@wvcs.org"],
    finalCopyRecipients: ["mconniry@wvcs.org"],
    active: true,
    fields: [
      { id: "vendor", label: "Vendor", type: "text", required: true },
      { id: "amount", label: "Estimated Amount", type: "number", required: true },
      { id: "budget", label: "Budget Area", type: "text", required: true },
      { id: "details", label: "Items or Services Requested", type: "textarea", required: true },
    ],
  },
];

const defaultSubmissions = [
  {
    id: "sub-1001",
    templateId: "field-trip-request",
    templateTitle: "Field Trip Request",
    submitterName: "Sarah Keith",
    submitterEmail: "skeith@wvcs.org",
    submittedAt: new Date(Date.now() - 1000 * 60 * 60 * 8).toISOString(),
    status: "Submitted",
    reviewer: "",
    reviewedAt: "",
    reviewNotes: "",
    answers: {
      destination: "Museum of Natural History",
      date: "2026-05-21",
      students: "28",
      purpose: "Life science exhibit and guided lab extension.",
    },
    emailStatus: "Not sent",
  },
];

const defaultSettings = {
  approvers: ["Principal", "Business Office", "Dean of Students"],
  defaultRecipients: ["mconniry@wvcs.org"],
  finalCopyRecipients: ["records@wvcs.org"],
  gmailSender: "forms@wvcs.org",
  supabaseProjectUrl: "",
  gmailConnected: false,
  supabaseConnected: false,
};

const defaultState = {
  templates: defaultTemplates,
  submissions: defaultSubmissions,
  settings: defaultSettings,
};

function loadFormsState() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return defaultState;
    const parsed = JSON.parse(saved);
    const settings = { ...defaultSettings, ...(parsed.settings || {}) };
    if (settings.defaultRecipients?.length === 1 && settings.defaultRecipients[0] === "office@wvcs.org") {
      settings.defaultRecipients = defaultSettings.defaultRecipients;
    }
    return {
      templates: parsed.templates?.length ? parsed.templates : defaultTemplates,
      submissions: parsed.submissions || [],
      settings,
    };
  } catch {
    return defaultState;
  }
}

function loadApprovalSignature() {
  try {
    return localStorage.getItem(SIGNATURE_KEY) || "";
  } catch {
    return "";
  }
}

function saveFormsState(nextState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(nextState));
}

function useFormsStore() {
  const [state, setState] = useState(loadFormsState);
  const [syncStatus, setSyncStatus] = useState("Connecting to shared templates...");

  async function loadSharedFormsData() {
    try {
      const [templatesResult, submissionsResult] = await Promise.all([
        fetchFormTemplates(),
        fetchFormSubmissions(),
      ]);

      if (!templatesResult.loaded && !submissionsResult.loaded) {
        setSyncStatus("Using local forms until Supabase is configured.");
        return;
      }

      setState((current) => {
        const localTemplates = current.templates?.length ? current.templates : defaultTemplates;
        const localSubmissions = current.submissions || [];
        const nextTemplates = templatesResult.templates?.length ? templatesResult.templates : localTemplates;
        const nextSubmissions = submissionsResult.submissions?.length ? submissionsResult.submissions : localSubmissions;

        if (templatesResult.loaded && !templatesResult.templates.length && localTemplates.length) {
          Promise.all(localTemplates.map((template) => saveFormTemplate(template)))
            .then(() => setSyncStatus("Shared forms connected."))
            .catch((error) => setSyncStatus(`Local templates loaded. Shared seed failed: ${error.message}`));
        }
        if (submissionsResult.loaded && !submissionsResult.submissions.length && localSubmissions.length) {
          Promise.all(localSubmissions.map((submission) => saveFormSubmission(submission)))
            .then(() => setSyncStatus("Shared forms connected."))
            .catch((error) => setSyncStatus(`Local submissions loaded. Shared seed failed: ${error.message}`));
        }

        if (
          (!templatesResult.loaded || templatesResult.templates.length || !localTemplates.length) &&
          (!submissionsResult.loaded || submissionsResult.submissions.length || !localSubmissions.length)
        ) {
          setSyncStatus("Shared forms connected.");
        }

        const next = { ...current, templates: nextTemplates, submissions: nextSubmissions };
        saveFormsState(next);
        return next;
      });
    } catch (error) {
      setSyncStatus(`Using local forms. Supabase sync failed: ${error.message}`);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(loadSharedFormsData, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function updateState(updater) {
    setState((current) => {
      const next = updater(current);
      saveFormsState(next);
      return next;
    });
  }

  return [state, updateState, syncStatus, setSyncStatus];
}

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function parseEmailList(value) {
  return value
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseChoiceOptions(value) {
  return String(value || "")
    .split(/[,\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getChoiceOptions(field) {
  const options = Array.isArray(field.options) ? field.options : parseChoiceOptions(field.options);
  return options.length ? options : ["Yes", "No"];
}

function hasRequiredAnswer(field, answers) {
  if (!field.required) return true;
  if (field.type === "checkbox") return answers[field.id] === true;
  if (field.type === "choice") {
    const answer = answers[field.id];
    return Array.isArray(answer) ? answer.length > 0 : Boolean(answer);
  }
  if (field.type === "file") return Boolean(answers[field.id]?.dataUrl || answers[field.id]?.storagePath);
  return Boolean(answers[field.id]);
}

function formatDate(value) {
  if (!value) return "Not yet";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getPdfFileName(submission) {
  const formName = submission.templateTitle.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return `${formName}-${submission.id}.pdf`;
}

function uniqueEmails(values) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean)));
}

function formatApproverIdentity(name, email) {
  const trimmedName = String(name || "").trim();
  const trimmedEmail = String(email || "").trim();
  if (trimmedName && trimmedEmail) return `${trimmedName} <${trimmedEmail}>`;
  return trimmedName || trimmedEmail || "Administration";
}

function getApproverLabel(submission, template) {
  if (submission?.status === "Submitted" || !submission?.reviewedAt) {
    return template?.approver || "Administration";
  }
  return submission?.approvalSignature?.value || submission?.reviewer || template?.approver || "Administration";
}

function getSignatureName(signature) {
  if (!signature) return "";
  if (signature.signerName) return signature.signerName;
  return String(signature.value || "").replace(/\s*<[^>]+>\s*$/, "");
}

function getApprovalBaseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function getPublicShareBaseUrl() {
  return `${window.location.origin}${window.location.pathname}`;
}

function dataUrlToAttachment(file) {
  if (!file?.dataUrl) return null;
  const [metadata, contentBase64] = file.dataUrl.split(",");
  const mimeType = metadata?.match(/^data:(.*?);base64$/)?.[1] || file.type || "application/octet-stream";
  return {
    filename: file.name || "attachment",
    mimeType,
    contentBase64,
  };
}

async function fileAnswerToAttachment(file) {
  if (!file) return null;
  if (file.dataUrl) return dataUrlToAttachment(file);
  if (file.storagePath) return storedFileToAttachment(file);
  return null;
}

async function blobToBase64(blob) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return String(dataUrl).split(",")[1];
}

function getSampleSubmission(template) {
  return {
    id: "preview",
    templateId: template.id,
    templateTitle: template.title,
    submitterName: "Staff Member",
    submitterEmail: "staff@wvcs.org",
    submittedAt: new Date().toISOString(),
    status: "Preview",
    reviewer: template.approver || "Administration",
    reviewedAt: "",
    reviewNotes: "Approval notes will appear here after administrative review.",
    approvalSignature: {
      type: "typed",
      value: "Matthew Conniry",
      signedAt: new Date().toISOString(),
      signerRole: template.approver || "Administration",
    },
    answers: Object.fromEntries(
      template.fields.map((field) => {
        const samples = {
          date: "2026-05-04",
          time: "08:30",
          number: "24",
          email: "staff@wvcs.org",
          checkbox: true,
          choice: getChoiceOptions(field)[0],
          file: { name: "receipt.pdf", type: "application/pdf", size: 128000, dataUrl: "" },
          textarea: "A longer staff response will flow into this area of the generated PDF.",
          text: "Sample response",
        };
        return [field.id, samples[field.type] || "Sample response"];
      })
    ),
    emailStatus: "Preview only",
  };
}

function statusStyle(status) {
  const styles = {
    Draft: "border-slate-600 bg-slate-800 text-slate-100",
    Submitted: "border-sky-400 bg-sky-500/15 text-sky-100",
    Approved: "border-emerald-400 bg-emerald-500/15 text-emerald-100",
    Rejected: "border-rose-400 bg-rose-500/15 text-rose-100",
    Sent: "border-teal-400 bg-teal-500/15 text-teal-100",
  };
  return styles[status] || styles.Submitted;
}

function Shell({ children }) {
  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">{children}</div>
    </section>
  );
}

function Stat({ icon: Icon, label, value, tone = "sky" }) {
  const toneClass = {
    sky: "border-sky-400/30 bg-sky-500/10 text-sky-100",
    emerald: "border-emerald-400/30 bg-emerald-500/10 text-emerald-100",
    amber: "border-amber-400/30 bg-amber-500/10 text-amber-100",
    rose: "border-rose-400/30 bg-rose-500/10 text-rose-100",
  }[tone];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{label}</div>
          <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
        </div>
        <div className={`rounded-lg border p-2 ${toneClass}`}>
          <Icon size={20} />
        </div>
      </div>
    </div>
  );
}

function Badge({ children, status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${statusStyle(status)}`}>
      {children}
    </span>
  );
}

function FieldInput({ field, value, onChange }) {
  const base =
    "w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-sky-400";

  if (field.type === "checkbox") {
    return (
      <label className="flex min-h-10 items-center gap-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-400"
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "choice") {
    const options = getChoiceOptions(field);
    const multiple = field.choiceMode === "multiple";
    const selectedValues = Array.isArray(value) ? value : value ? [value] : [];

    return (
      <div className="grid gap-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
        {options.map((option) => {
          const selected = selectedValues.includes(option);
          return (
            <label
              key={option}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition ${
                selected
                  ? "border-sky-400 bg-sky-500/15 text-white"
                  : "border-slate-800 bg-slate-900 text-slate-200 hover:border-slate-600"
              }`}
            >
              <input
                type={multiple ? "checkbox" : "radio"}
                name={field.id}
                checked={selected}
                onChange={(event) => {
                  if (!multiple) {
                    onChange(option);
                    return;
                  }
                  const nextValues = event.target.checked
                    ? [...selectedValues, option]
                    : selectedValues.filter((item) => item !== option);
                  onChange(nextValues);
                }}
                className="h-4 w-4 border-slate-600 bg-slate-900 text-sky-500 focus:ring-sky-400"
              />
              <span>{option}</span>
            </label>
          );
        })}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <textarea
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className={`${base} min-h-24 resize-y`}
        placeholder={field.label}
      />
    );
  }

  if (field.type === "file") {
    return (
      <div className="rounded-lg border border-slate-700 bg-slate-950 p-3">
        <input
          type="file"
          accept={field.accept || "application/pdf,image/*"}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              onChange(null);
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              onChange({
                name: file.name,
                type: file.type,
                size: file.size,
                dataUrl: reader.result,
                uploadedAt: new Date().toISOString(),
              });
            };
            reader.readAsDataURL(file);
          }}
          className="w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-500 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
        {value?.name && (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
            <span className="font-semibold text-slate-100">{value.name}</span>
            <span className="ml-2 text-slate-500">{formatFileSize(value.size)}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <input
      type={field.type}
      value={value || ""}
      onChange={(event) => onChange(event.target.value)}
      className={base}
      placeholder={field.label}
    />
  );
}

function formatFileSize(size) {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function renderAnswerValue(answer) {
  if (answer && typeof answer === "object" && "name" in answer) {
    return `${answer.name}${answer.size ? ` (${formatFileSize(answer.size)})` : ""}`;
  }
  if (Array.isArray(answer)) return answer.length ? answer.join(", ") : "-";
  if (typeof answer === "boolean") return answer ? "Yes" : "No";
  return answer || "-";
}

function AttachmentLink({ attachment, label = "View Attachment" }) {
  const storageKey = attachment?.storagePath || "";
  const [signedFile, setSignedFile] = useState({ key: "", href: "", error: "" });

  useEffect(() => {
    let active = true;
    if (!attachment?.storagePath) return undefined;

    createStoredFileUrl(attachment)
      .then((url) => {
        if (active) setSignedFile({ key: attachment.storagePath, href: url, error: "" });
      })
      .catch((downloadError) => {
        if (active) setSignedFile({ key: attachment.storagePath, href: "", error: downloadError.message });
      });

    return () => {
      active = false;
    };
  }, [attachment]);

  const href = attachment?.dataUrl || (signedFile.key === storageKey ? signedFile.href : "");
  const error = signedFile.key === storageKey ? signedFile.error : "";

  if (error) {
    return <span className="text-xs text-rose-300">Attachment unavailable: {error}</span>;
  }
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      download={attachment.name}
      className="inline-flex items-center gap-2 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25"
    >
      <Download size={14} />
      {label}
    </a>
  );
}

export function FormApprovalActionPage({ token }) {
  const [preview, setPreview] = useState({ loading: true, data: null, error: "" });
  const [notes, setNotes] = useState("");
  const [signerName, setSignerName] = useState("");
  const [result, setResult] = useState({ loading: false, data: null, error: "" });

  useEffect(() => {
    let active = true;
    handleFormApprovalAction({ token, operation: "preview" })
      .then((data) => {
        if (active) setPreview({ loading: false, data, error: data.reason && !data.valid ? data.reason : "" });
      })
      .catch((error) => {
        if (active) setPreview({ loading: false, data: null, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function resolveAction() {
    if (approving && !signerName.trim()) {
      setResult({ loading: false, data: null, error: "Type your name before approving this form." });
      return;
    }
    setResult({ loading: true, data: null, error: "" });
    try {
      const data = await handleFormApprovalAction({ token, operation: "resolve", notes, signerName });
      if (!data.ok) throw new Error(data.reason || data.error || "The approval action could not be completed.");
      setResult({ loading: false, data, error: "" });
    } catch (error) {
      setResult({ loading: false, data: null, error: error.message });
    }
  }

  const data = preview.data;
  const action = data?.action || "";
  const approving = action === "Approved";
  const valid = Boolean(data?.valid) && !result.data;

  return (
    <section className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
          <div className="flex items-center gap-3">
            <div className={`flex h-11 w-11 items-center justify-center rounded-lg border ${
              approving ? "border-emerald-400 bg-emerald-500/15 text-emerald-100" : "border-rose-400 bg-rose-500/15 text-rose-100"
            }`}>
              {approving ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">WVCS Form Review</div>
              <h1 className="text-2xl font-bold text-white">
                {action ? `${approving ? "Approve" : "Reject"} Form` : "Form Approval Link"}
              </h1>
            </div>
          </div>

          {preview.loading && <div className="mt-6 text-sm text-slate-300">Loading approval details...</div>}

          {!preview.loading && preview.error && (
            <div className="mt-6 rounded-lg border border-amber-400/40 bg-amber-500/10 p-4 text-sm text-amber-100">
              {preview.error}
            </div>
          )}

          {data?.submission && (
            <div className="mt-6 space-y-5">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Form</div>
                  <div className="mt-2 text-sm font-semibold text-white">{data.submission.templateTitle}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Submitted By</div>
                  <div className="mt-2 text-sm font-semibold text-white">{data.submission.submitterName}</div>
                  <div className="mt-1 text-xs text-slate-400">{data.submission.submitterEmail}</div>
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-800">
                {(data.answers || []).map((answer) => (
                  <div key={answer.label} className="grid gap-0 border-b border-slate-800 last:border-b-0 md:grid-cols-[220px_1fr]">
                    <div className="bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-300">{answer.label}</div>
                    <div className="px-4 py-3 text-sm text-slate-100">{renderAnswerValue(answer.value)}</div>
                  </div>
                ))}
              </div>

              {valid && (
                <>
                  {approving && (
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      Approver Name
                      <input
                        value={signerName}
                        onChange={(event) => setSignerName(event.target.value)}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                        placeholder="Type your full name"
                      />
                    </label>
                  )}
                  <label className="space-y-1 text-sm font-medium text-slate-200">
                    Notes
                    <textarea
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                      placeholder={approving ? "Optional approval note" : "Optional rejection reason"}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={resolveAction}
                    disabled={result.loading}
                    className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      approving
                        ? "border-emerald-400 bg-emerald-500 hover:bg-emerald-400"
                        : "border-rose-400 bg-rose-500 hover:bg-rose-400"
                    }`}
                  >
                    {approving ? <CheckCircle2 size={17} /> : <XCircle size={17} />}
                    {result.loading ? "Saving..." : `${approving ? "Approve" : "Reject"} This Form`}
                  </button>
                </>
              )}

              {result.data && (
                <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  {result.data.message || `The form was ${result.data.status?.toLowerCase()}.`}
                  {result.data.emailWarning && (
                    <div className="mt-2 text-amber-100">Status email warning: {result.data.emailWarning}</div>
                  )}
                </div>
              )}

              {result.error && (
                <div className="rounded-lg border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-100">
                  {result.error}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function PublicSharedFormPage({ token }) {
  const [shareState, setShareState] = useState({ loading: true, template: null, error: "" });
  const [submitter, setSubmitter] = useState({ name: "", email: "" });
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [receipt, setReceipt] = useState(null);

  useEffect(() => {
    let active = true;
    handleFormShareLink({ operation: "preview", token })
      .then((data) => {
        if (!active) return;
        if (!data.ok) throw new Error(data.reason || data.error || "This shared form is not available.");
        setShareState({ loading: false, template: data.template, error: "" });
      })
      .catch((error) => {
        if (active) setShareState({ loading: false, template: null, error: error.message });
      });
    return () => {
      active = false;
    };
  }, [token]);

  async function uploadPublicFiles(submissionId, template) {
    const nextAnswers = { ...answers };
    const fileFields = template.fields.filter((field) => field.type === "file" && nextAnswers[field.id]?.dataUrl);
    for (const field of fileFields) {
      const result = await uploadFormAnswerFile({
        submissionId,
        fieldId: field.id,
        file: nextAnswers[field.id],
      });
      if (result.uploaded) {
        nextAnswers[field.id] = result.file;
      }
    }
    return nextAnswers;
  }

  async function submitSharedForm() {
    const template = shareState.template;
    const submitterEmail = submitter.email.trim().toLowerCase();
    if (!template || !submitter.name.trim() || !submitterEmail) return;
    if (template.fields.some((field) => !hasRequiredAnswer(field, answers))) return;

    setIsSubmitting(true);
    setFeedback({ tone: "info", title: "Submitting form...", message: "Saving your form and notifying WVCS." });

    const submissionId = uid("sub");
    try {
      const submissionAnswers = await uploadPublicFiles(submissionId, template);
      const result = await handleFormShareLink({
        operation: "submit",
        token,
        submissionId,
        submitterName: submitter.name,
        submitterEmail,
        answers: submissionAnswers,
        shareBaseUrl: getPublicShareBaseUrl(),
        approvalBaseUrl: getApprovalBaseUrl(),
      });

      if (!result.ok) throw new Error(result.error || result.reason || "The shared form could not be submitted.");

      setFeedback({
        tone: result.emailWarning ? "warning" : "success",
        title: result.emailWarning ? "Form saved, but notification needs attention" : "Form submitted",
        message: result.emailWarning || "Your form was sent to WVCS for approval. You will receive approval or denial notifications at the email you entered.",
      });
      setReceipt({
        submissionId,
        submittedAt: new Date().toISOString(),
        submitterName: submitter.name,
        submitterEmail,
        templateTitle: template.title,
        emailWarning: result.emailWarning || "",
      });
      setAnswers({});
    } catch (error) {
      setFeedback({ tone: "warning", title: "Form could not be submitted", message: error.message });
    } finally {
      setIsSubmitting(false);
    }
  }

  const template = shareState.template;
  const canSubmit =
    template &&
    submitter.name.trim() &&
    submitter.email.trim() &&
    template.fields.every((field) => hasRequiredAnswer(field, answers));
  const feedbackTone = {
    info: "border-sky-400/40 bg-sky-500/10 text-sky-100",
    success: "border-emerald-400/40 bg-emerald-500/10 text-emerald-100",
    warning: "border-amber-400/40 bg-amber-500/10 text-amber-100",
  }[feedback?.tone || "info"];

  return (
    <section className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-5 flex items-center gap-3">
          <img src={warriorHeadNew} alt="WVCS Warrior" className="h-12 w-12 rounded-lg object-contain" />
          <div>
            <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Willamette Valley Christian School</div>
            <h1 className="text-2xl font-bold text-white">Shared Form</h1>
          </div>
        </div>

        {shareState.loading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
            Loading shared form...
          </div>
        )}

        {!shareState.loading && shareState.error && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-5 text-sm text-amber-100">
            {shareState.error}
          </div>
        )}

        {template && (
          <div className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-5">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                {template.category || "WVCS Form"}
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white">{template.title}</h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-400">{template.description}</p>
            </div>

            <div className="space-y-5 p-5">
              {receipt ? (
                <div className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 p-5 text-emerald-100">
                  <div className="flex items-start gap-3">
                    <div className="rounded-lg border border-emerald-300/50 bg-emerald-400/20 p-2">
                      <CheckCircle2 size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="text-lg font-bold text-white">WVCS received your submission</div>
                      <p className="mt-2 text-sm leading-6 text-emerald-50/90">
                        Thank you. Your form has been sent to Willamette Valley Christian School for review.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 rounded-lg border border-emerald-300/20 bg-slate-950/60 p-4 text-sm md:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Form</div>
                      <div className="mt-1 font-semibold text-white">{receipt.templateTitle}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Submitted</div>
                      <div className="mt-1 font-semibold text-white">{formatDate(receipt.submittedAt)}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Name</div>
                      <div className="mt-1 font-semibold text-white">{receipt.submitterName}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200/80">Email</div>
                      <div className="mt-1 break-words font-semibold text-white">{receipt.submitterEmail}</div>
                    </div>
                  </div>
                  {receipt.emailWarning && (
                    <div className="mt-4 rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm text-amber-100">
                      Saved successfully, but the notification email needs attention: {receipt.emailWarning}
                    </div>
                  )}
                  <div className="mt-5 flex flex-wrap gap-2">
                    <a
                      href="#/public-forms"
                      className="inline-flex items-center justify-center rounded-lg border border-emerald-400 bg-emerald-500 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-400"
                    >
                      View Public Forms
                    </a>
                    <button
                      type="button"
                      onClick={() => {
                        setReceipt(null);
                        setSubmitter({ name: "", email: "" });
                        setFeedback(null);
                      }}
                      className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                    >
                      Submit Another
                    </button>
                  </div>
                </div>
              ) : (
                <>
              {feedback && (
                <div className={`rounded-lg border p-4 text-sm ${feedbackTone}`}>
                  <div className="font-semibold">{feedback.title}</div>
                  <div className="mt-1">{feedback.message}</div>
                </div>
              )}

              <div className="grid gap-3 md:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Your Name
                  <input
                    value={submitter.name}
                    onChange={(event) => setSubmitter({ ...submitter, name: event.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Your Email
                  <input
                    type="email"
                    value={submitter.email}
                    onChange={(event) => setSubmitter({ ...submitter, email: event.target.value })}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                  />
                  <span className="block text-xs font-normal text-slate-500">
                    Approval or denial notifications will be sent here.
                  </span>
                </label>
              </div>

              <div className="grid gap-4">
                {template.fields.map((field) => (
                  <label key={field.id} className="space-y-1 text-sm font-medium text-slate-200">
                    {field.label}
                    {field.required && <span className="text-rose-300"> *</span>}
                    <FieldInput
                      field={field}
                      value={answers[field.id]}
                      onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
                    />
                  </label>
                ))}
              </div>

              <div className="flex justify-end border-t border-slate-800 pt-5">
                <button
                  type="button"
                  disabled={!canSubmit || isSubmitting}
                  onClick={submitSharedForm}
                  className="inline-flex items-center gap-2 rounded-lg border border-emerald-400 bg-emerald-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Send size={16} />
                  {isSubmitting ? "Submitting..." : "Submit Form"}
                </button>
              </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export function PublicFormsDirectoryPage() {
  const [directoryState, setDirectoryState] = useState({ loading: true, forms: [], error: "" });

  useEffect(() => {
    let active = true;
    handleFormShareLink({ operation: "directory", shareBaseUrl: getPublicShareBaseUrl() })
      .then((data) => {
        if (!active) return;
        if (!data.ok) throw new Error(data.error || "Public forms are not available.");
        setDirectoryState({ loading: false, forms: data.forms || [], error: "" });
      })
      .catch((error) => {
        if (active) setDirectoryState({ loading: false, forms: [], error: error.message });
      });
    return () => {
      active = false;
    };
  }, []);

  const groupedForms = useMemo(() => {
    return directoryState.forms.reduce((groups, form) => {
      const category = form.category || "WVCS Forms";
      if (!groups[category]) groups[category] = [];
      groups[category].push(form);
      return groups;
    }, {});
  }, [directoryState.forms]);

  return (
    <section className="min-h-screen bg-slate-950 px-5 py-8 text-slate-100">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <img src={warriorHeadNew} alt="WVCS Warrior" className="h-12 w-12 rounded-lg object-contain" />
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Willamette Valley Christian School</div>
              <h1 className="text-2xl font-bold text-white">Public Forms</h1>
            </div>
          </div>
          <a
            href="https://wvcs.org"
            className="inline-flex items-center justify-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Official School Site
          </a>
        </div>

        {directoryState.loading && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
            Loading public forms...
          </div>
        )}

        {!directoryState.loading && directoryState.error && (
          <div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-5 text-sm text-amber-100">
            {directoryState.error}
          </div>
        )}

        {!directoryState.loading && !directoryState.error && !directoryState.forms.length && (
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-5 text-sm text-slate-300">
            No public forms are available right now.
          </div>
        )}

        <div className="space-y-5">
          {Object.entries(groupedForms).map(([category, forms]) => (
            <div key={category} className="rounded-lg border border-slate-800 bg-slate-900">
              <div className="border-b border-slate-800 px-4 py-3">
                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">{category}</div>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {forms.map((form) => (
                  <article key={form.token} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                    <h2 className="text-base font-bold text-white">{form.title}</h2>
                    <p className="mt-2 min-h-10 text-sm leading-5 text-slate-400">{form.description || "Complete this WVCS form online."}</p>
                    <a
                      href={form.url}
                      className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400"
                    >
                      <FileText size={16} />
                      Open Form
                    </a>
                  </article>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function SubmissionPdf({ submission, template, settings }) {
  const recipients = [
    submission.submitterEmail,
    ...(template?.recipients || []),
    ...((template?.finalCopyRecipients?.length ? template.finalCopyRecipients : settings.finalCopyRecipients) || []),
  ];
  const fieldRows = template?.fields || [];
  const labelStyle = {
    fontSize: "8.5px",
    fontWeight: 700,
    letterSpacing: "0.8px",
    textTransform: "uppercase",
    color: "#64748b",
  };
  function renderPdfAnswer(field) {
    if (field.type === "file") {
      const attachment = submission.answers[field.id];
      return attachment?.name
        ? `${attachment.name}${attachment.size ? ` (${formatFileSize(attachment.size)})` : ""}`
        : "-";
    }

    if (field.type === "checkbox") {
      const checked = Boolean(submission.answers[field.id]);
      return (
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "16px",
              height: "16px",
              border: "1.5px solid #334155",
              borderRadius: "3px",
              fontSize: "12px",
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            {checked ? "X" : ""}
          </span>
          <span>{checked ? "Yes" : "No"}</span>
        </div>
      );
    }

    if (field.type === "choice") {
      const answer = submission.answers[field.id];
      const selectedValues = Array.isArray(answer) ? answer : answer ? [answer] : [];
      return (
        <div style={{ display: "grid", gap: "4px" }}>
          {getChoiceOptions(field).map((option) => {
            const checked = selectedValues.includes(option);
            return (
              <div key={option} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: "13px",
                    height: "13px",
                    border: "1.4px solid #334155",
                    borderRadius: field.choiceMode === "multiple" ? "3px" : "999px",
                    fontSize: "9px",
                    lineHeight: 1,
                    fontWeight: 700,
                  }}
                >
                  {checked ? "X" : ""}
                </span>
                <span>{option}</span>
              </div>
            );
          })}
        </div>
      );
    }

    return renderAnswerValue(submission.answers[field.id]);
  }

  return (
    <div
      style={{
        width: "709px",
        padding: "18px 24px 28px",
        background: "#ffffff",
        color: "#020617",
        fontFamily: "Arial, Helvetica, sans-serif",
        boxSizing: "border-box",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <img
        src={warriorHeadNew}
        alt=""
        style={{
          position: "absolute",
          left: "50%",
          top: "52%",
          width: "360px",
          transform: "translate(-50%, -50%)",
          opacity: 0.055,
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: "14px",
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderBottom: "3px solid #075985",
          borderRadius: "6px 6px 0 0",
          padding: "10px 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img src="/wvcs-logo.png" alt="WVCS" style={{ width: "128px", maxHeight: "50px", objectFit: "contain" }} />
          <div>
            <div style={{ ...labelStyle, letterSpacing: "1.6px" }}>
              WVCS Administrative Form
            </div>
            <h1 style={{ margin: "4px 0 0", fontSize: "19px", fontWeight: 700, color: "#020617" }}>
              {submission.templateTitle}
            </h1>
            <p style={{ margin: "2px 0 0", fontSize: "11px", lineHeight: 1.3, color: "#475569" }}>
              {template?.description || "Generated form record"}
            </p>
          </div>
        </div>
        <div
          style={{
            minWidth: "78px",
            border: "1px solid #94a3b8",
            borderRadius: "5px",
            background: "#ffffff",
            padding: "6px 8px",
            textAlign: "center",
            fontSize: "11px",
            fontWeight: 700,
          }}
        >
          <div style={labelStyle}>Status</div>
          <div style={{ marginTop: "3px" }}>{submission.status}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: "12px",
          border: "1px solid #cbd5e1",
          borderRadius: "5px",
          background: "#f8fafc",
          padding: "7px 9px",
          fontSize: "10px",
          color: "#475569",
        }}
      >
        <span style={{ fontWeight: 700, color: "#1e293b" }}>Submission ID:</span> {submission.id}
        <span style={{ margin: "0 8px" }}>|</span>
        <span style={{ fontWeight: 700, color: "#1e293b" }}>PDF:</span> {getPdfFileName(submission)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "9px 14px", marginTop: "14px", fontSize: "11px" }}>
        <div>
          <div style={labelStyle}>Submitted By</div>
          <div>{submission.submitterName}</div>
          <div>{submission.submitterEmail}</div>
        </div>
        <div>
          <div style={labelStyle}>Submitted</div>
          <div>{formatDate(submission.submittedAt)}</div>
        </div>
        <div>
          <div style={labelStyle}>Reviewer</div>
          <div>{getApproverLabel(submission, template)}</div>
        </div>
        <div>
          <div style={labelStyle}>Reviewed</div>
          <div>{formatDate(submission.reviewedAt)}</div>
        </div>
      </div>

      <div style={{ marginTop: "16px" }}>
        <h2 style={{ margin: 0, borderBottom: "1px solid #cbd5e1", paddingBottom: "5px", fontSize: "14px" }}>
          Form Responses
        </h2>
        <div style={{ marginTop: "7px", overflow: "hidden", border: "1px solid #cbd5e1", borderRadius: "5px" }}>
          {fieldRows.map((field, index) => (
            <div
              key={field.id}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                borderBottom: index === fieldRows.length - 1 ? "none" : "1px solid #e2e8f0",
              }}
            >
              <div style={{ background: "#f1f5f9", padding: "5px 8px", fontSize: "10.5px", fontWeight: 700 }}>
                {field.label}
              </div>
              <div style={{ padding: "5px 8px", fontSize: "10.5px", lineHeight: 1.25, whiteSpace: "pre-wrap" }}>
                {renderPdfAnswer(field)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "16px" }}>
        <h2 style={{ margin: 0, borderBottom: "1px solid #cbd5e1", paddingBottom: "5px", fontSize: "14px" }}>
          Approval Record
        </h2>
        <p
          style={{
            minHeight: "38px",
            margin: "6px 0 0",
            border: "1px solid #cbd5e1",
            borderRadius: "5px",
            padding: "7px 8px",
            fontSize: "10.5px",
            lineHeight: 1.3,
            whiteSpace: "pre-wrap",
          }}
        >
          {submission.reviewNotes || "No notes entered."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginTop: "10px" }}>
          <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "5px", fontSize: "10px", color: "#475569" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "15px", color: "#020617" }}>
              {getSignatureName(submission.approvalSignature)}
            </div>
            <div>Electronic Signature</div>
            {submission.approvalSignature?.signerEmail && (
              <div style={{ marginTop: "3px" }}>{submission.approvalSignature.signerEmail}</div>
            )}
            {submission.approvalSignature?.signerRole && (
              <div style={{ marginTop: "3px" }}>{submission.approvalSignature.signerRole}</div>
            )}
          </div>
          <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "5px", fontSize: "10px", color: "#475569" }}>
            <div style={{ fontSize: "11px", color: "#020617" }}>
              {formatDate(submission.approvalSignature?.signedAt || submission.reviewedAt)}
            </div>
            <div>Date Signed</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "16px", borderTop: "1px solid #cbd5e1", paddingTop: "8px", fontSize: "9.5px", color: "#475569" }}>
        Final copy recipients: {recipients.filter(Boolean).join(", ")}
      </div>
      </div>
    </div>
  );
}

function renderPdfNode(submission, template, settings) {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-10000px";
  host.style.top = "0";
  host.style.background = "#ffffff";
  host.style.color = "#020617";
  document.body.appendChild(host);

  return { host, element: <SubmissionPdf submission={submission} template={template} settings={settings} /> };
}

async function downloadSubmissionPdf(submission, template, settings) {
  const blob = await generateSubmissionPdfBlob(submission, template, settings);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getPdfFileName(submission);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

async function previewSubmissionPdf(submission, template, settings) {
  const blob = await generateSubmissionPdfBlob(submission, template, settings);
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function generateSubmissionPdfBlob(submission, template, settings) {
  const { host, element } = renderPdfNode(submission, template, settings);
  const root = createRoot(host);
  root.render(element);

  await new Promise((resolve) => setTimeout(resolve, 100));
  const blob = await html2pdf()
    .set({
      margin: [22, 30, 28, 30],
      filename: getPdfFileName(submission),
      html2canvas: { scale: 2 },
      jsPDF: { unit: "pt", format: "letter", orientation: "portrait" },
    })
    .from(host.firstElementChild)
    .outputPdf("blob");

  root.unmount();
  host.remove();
  return blob;
}

function StaffFormsModule({ currentUserEmail = "" }) {
  const [state, updateState, syncStatus, setSyncStatus] = useFormsStore();
  const activeTemplates = state.templates.filter((template) => template.active);
  const [selectedId, setSelectedId] = useState(activeTemplates[0]?.id || "");
  const selectedTemplate = activeTemplates.find((template) => template.id === selectedId) || activeTemplates[0];
  const [submitter, setSubmitter] = useState({ name: "", email: "" });
  const [preparedForOther, setPreparedForOther] = useState(false);
  const loggedInEmail = currentUserEmail.trim().toLowerCase();
  const submitterEmail = preparedForOther
    ? submitter.email.trim().toLowerCase()
    : loggedInEmail || submitter.email.trim().toLowerCase();
  const displayedSubmitterEmail = preparedForOther || !loggedInEmail ? submitter.email : loggedInEmail;
  const [answers, setAnswers] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionFeedback, setSubmissionFeedback] = useState(null);
  const mySubmissions = state.submissions.filter(
    (submission) => submission.submitterEmail?.toLowerCase() === submitterEmail
  );

  function startAnotherSubmission(nextTemplateId = selectedTemplate?.id) {
    if (nextTemplateId) setSelectedId(nextTemplateId);
    setAnswers({});
    setSubmissionFeedback(null);
  }

  async function uploadSubmissionFiles(submissionId) {
    const nextAnswers = { ...answers };
    const fileFields = selectedTemplate.fields.filter((field) => field.type === "file" && nextAnswers[field.id]?.dataUrl);
    for (const field of fileFields) {
      const result = await uploadFormAnswerFile({
        submissionId,
        fieldId: field.id,
        file: nextAnswers[field.id],
      });
      if (result.uploaded) {
        nextAnswers[field.id] = result.file;
      }
    }
    return nextAnswers;
  }

  async function submitForm() {
    if (!selectedTemplate || !submitter.name.trim() || !submitterEmail) return;
    const missing = selectedTemplate.fields.some((field) => !hasRequiredAnswer(field, answers));
    if (missing) return;

    setIsSubmitting(true);
    setSubmissionFeedback({
      tone: "info",
      title: "Submitting form...",
      message: "Saving the form and notifying administration.",
    });

    const submissionId = uid("sub");
    let submissionAnswers = answers;
    try {
      submissionAnswers = await uploadSubmissionFiles(submissionId);
    } catch (error) {
      setSyncStatus(`File upload failed, keeping local attachment data: ${error.message}`);
    }

    const submission = {
      id: submissionId,
      templateId: selectedTemplate.id,
      templateTitle: selectedTemplate.title,
      submitterName: submitter.name.trim(),
      submitterEmail,
      preparedByEmail: preparedForOther && loggedInEmail ? loggedInEmail : "",
      submittedAt: new Date().toISOString(),
      status: "Submitted",
      reviewer: "",
      reviewedAt: "",
      reviewNotes: "",
      answers: submissionAnswers,
      emailStatus: "Pending approval",
    };

    updateState((current) => ({
      ...current,
      submissions: [submission, ...current.submissions],
    }));
    try {
      const saveResult = await saveFormSubmission(submission);
      if (saveResult.saved) setSyncStatus("Shared forms connected.");
    } catch (error) {
      setSyncStatus(`Submission saved locally. Shared sync failed: ${error.message}`);
    }

    const recipients = uniqueEmails([...(selectedTemplate.recipients || []), ...(state.settings.defaultRecipients || [])]);
    try {
      const sendResult = await sendFormNotification({
        submission,
        template: selectedTemplate,
        status: "Submitted",
        notes: "A new form was submitted for approval.",
        recipients,
        attachments: [],
        approvalBaseUrl: getApprovalBaseUrl(),
      });

      if (!sendResult.sent) {
        throw new Error(sendResult.reason || "Email function did not send the submission notice.");
      }

      const emailPatch = {
        emailStatus: "Submission notice emailed to administration",
        emailedAt: new Date().toISOString(),
      };
      updateState((current) => ({
        ...current,
        submissions: current.submissions.map((item) =>
          item.id === submission.id ? { ...item, ...emailPatch } : item
        ),
      }));
      saveFormSubmission({ ...submission, ...emailPatch }).catch((error) =>
        setSyncStatus(`Email status saved locally. Shared sync failed: ${error.message}`)
      );
      setSubmissionFeedback({
        tone: "success",
        title: "Form sent for approval",
        message: "Administration has been notified, and your submission is now in the approval queue. You can start another form now.",
      });
    } catch (error) {
      const emailPatch = { emailStatus: `Submission saved; email failed: ${error.message}` };
      updateState((current) => ({
        ...current,
        submissions: current.submissions.map((item) =>
          item.id === submission.id ? { ...item, ...emailPatch } : item
        ),
      }));
      saveFormSubmission({ ...submission, ...emailPatch }).catch((syncError) =>
        setSyncStatus(`Email failure saved locally. Shared sync failed: ${syncError.message}`)
      );
      setSubmissionFeedback({
        tone: "warning",
        title: "Form saved, but email did not send",
        message: error.message,
      });
    } finally {
      setAnswers({});
      setIsSubmitting(false);
    }
  }

  const canSubmit =
    selectedTemplate &&
    submitter.name.trim() &&
    submitterEmail &&
    selectedTemplate.fields.every((field) => hasRequiredAnswer(field, answers));

  return (
    <Shell>
      <div className="grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className="space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-white">Staff Forms</h1>
            <p className="mt-2 text-sm text-slate-400">
              Complete a school form and send it to administration for approval.
            </p>
            <div className="mt-3 inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
              {syncStatus}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
              <FileText size={16} className="text-sky-300" />
              Available Forms
            </div>
            <div className="space-y-2">
              {activeTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    startAnotherSubmission(template.id);
                  }}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    selectedTemplate?.id === template.id
                      ? "border-sky-400 bg-sky-500/15"
                      : "border-slate-800 bg-slate-950 hover:border-slate-600"
                  }`}
                >
                  <div className="text-sm font-semibold text-white">{template.title}</div>
                  <div className="mt-1 text-xs text-slate-400">{template.category}</div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <main className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <div className="rounded-lg border border-slate-800 bg-slate-900">
            {selectedTemplate ? (
              <>
                <div className="border-b border-slate-800 p-5">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                        {selectedTemplate.category}
                      </div>
                      <h2 className="mt-2 text-xl font-bold text-white">{selectedTemplate.title}</h2>
                      <p className="mt-2 max-w-3xl text-sm text-slate-400">{selectedTemplate.description}</p>
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
                      PDF Template: <span className="font-semibold text-slate-100">{selectedTemplate.pdfName}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-5">
                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      {preparedForOther ? "Staff Member Name" : "Your Name"}
                      <input
                        value={submitter.name}
                        onChange={(event) => setSubmitter({ ...submitter, name: event.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      {preparedForOther ? "Staff Member Email" : "Your Email"}
                      <input
                        type="email"
                        value={displayedSubmitterEmail}
                        onChange={(event) => setSubmitter({ ...submitter, email: event.target.value })}
                        readOnly={Boolean(loggedInEmail) && !preparedForOther}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-sky-400 read-only:cursor-not-allowed read-only:border-slate-800 read-only:bg-slate-900 read-only:text-slate-300"
                      />
                      {loggedInEmail && !preparedForOther && (
                        <span className="block text-xs font-normal text-slate-500">
                          Pulled from your signed-in WVCS account.
                        </span>
                      )}
                      {preparedForOther && loggedInEmail && (
                        <span className="block text-xs font-normal text-slate-500">
                          Prepared by {loggedInEmail}.
                        </span>
                      )}
                    </label>
                  </div>

                  {loggedInEmail && (
                    <label className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200">
                      <input
                        type="checkbox"
                        checked={preparedForOther}
                        onChange={(event) => setPreparedForOther(event.target.checked)}
                        className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-sky-500"
                      />
                      <span>
                        This form is prepared for another staff member
                        <span className="block text-xs font-normal text-slate-500">
                          Use this when the approval should be tied to someone else&apos;s email.
                        </span>
                      </span>
                    </label>
                  )}

                  {submissionFeedback && (
                    <div
                      className={`rounded-lg border px-4 py-3 ${
                        submissionFeedback.tone === "success"
                          ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-100"
                          : submissionFeedback.tone === "warning"
                            ? "border-amber-400/60 bg-amber-500/15 text-amber-100"
                            : "border-sky-400/60 bg-sky-500/15 text-sky-100"
                      }`}
                      role="status"
                      aria-live="polite"
                    >
                      <div className="flex items-start gap-3">
                        {submissionFeedback.tone === "warning" ? (
                          <AlertCircle size={20} className="mt-0.5 shrink-0" />
                        ) : (
                          <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-bold">{submissionFeedback.title}</div>
                          <div className="mt-1 text-sm opacity-90">{submissionFeedback.message}</div>
                          {submissionFeedback.tone === "success" && (
                            <button
                              type="button"
                              onClick={() => startAnotherSubmission()}
                              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-300/60 bg-emerald-400/15 px-3 py-1.5 text-xs font-bold text-emerald-50 transition hover:bg-emerald-400/25"
                            >
                              <Plus size={14} />
                              Start Another Form
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid gap-4">
                    {selectedTemplate.fields.map((field) => (
                      <label key={field.id} className="space-y-1 text-sm font-medium text-slate-200">
                        {field.label}
                        {field.required && <span className="text-rose-300"> *</span>}
                        <FieldInput
                          field={field}
                          value={answers[field.id]}
                          onChange={(value) => setAnswers((current) => ({ ...current, [field.id]: value }))}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="flex justify-end border-t border-slate-800 pt-5">
                    <button
                      type="button"
                      disabled={!canSubmit || isSubmitting}
                      onClick={submitForm}
                      className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-950/30 transition hover:-translate-y-0.5 hover:bg-sky-400 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isSubmitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                      {isSubmitting ? "Submitting..." : "Submit for Approval"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 text-sm text-slate-400">No active forms are available.</div>
            )}
          </div>

          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-3 text-sm font-semibold text-white">My Recent Submissions</div>
              {mySubmissions.length ? (
                <div className="space-y-3">
                  {mySubmissions.slice(0, 6).map((submission) => {
                    const template = state.templates.find((item) => item.id === submission.templateId);
                    return (
                      <div key={submission.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-white">{submission.templateTitle}</div>
                            <div className="mt-1 text-xs text-slate-500">{formatDate(submission.submittedAt)}</div>
                          </div>
                          <Badge status={submission.status}>{submission.status}</Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <button
                            type="button"
                            onClick={() => previewSubmissionPdf(submission, template, state.settings)}
                            className="inline-flex items-center gap-2 text-xs font-semibold text-sky-300 hover:text-sky-200"
                          >
                            <Eye size={14} />
                            Preview PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadSubmissionPdf(submission, template, state.settings)}
                            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-slate-200"
                          >
                            <Download size={14} />
                            Download
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm text-slate-400">
                  Enter your email to see submissions from this device.
                </div>
              )}
            </div>
          </aside>
        </main>
      </div>
    </Shell>
  );
}

function getNewTemplateDraft(settings) {
  return {
    title: "",
    category: "",
    description: "",
    pdfName: "",
    approver: settings.approvers[0] || "Administration",
    recipients: settings.defaultRecipients.join(", "),
    finalCopyRecipients: settings.finalCopyRecipients.join(", "),
    active: true,
    fields: [
      { id: uid("field"), label: "Requested Date", type: "date", required: true },
      { id: uid("field"), label: "Reason / Details", type: "textarea", required: true },
    ],
  };
}

function labelFromPdfFieldName(name) {
  return name
    .replace(/\[(\d+)\]/g, " $1 ")
    .replace(/[_./-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

function fieldTypeFromPdfField(field) {
  if (field instanceof PDFCheckBox) return "checkbox";
  if (field instanceof PDFDropdown || field instanceof PDFRadioGroup) return "text";
  if (field instanceof PDFTextField) {
    const name = field.getName().toLowerCase();
    if (name.includes("email")) return "email";
    if (name.includes("date")) return "date";
    if (name.includes("time")) return "time";
    return "text";
  }
  return "text";
}

async function templateFromFillablePdf(file, settings) {
  const bytes = await file.arrayBuffer();
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();
  const pdfFields = form.getFields();

  if (!pdfFields.length) {
    throw new Error("No fillable fields were found in this PDF.");
  }

  const fields = pdfFields.map((field) => {
    const pdfFieldName = field.getName();
    return {
      id: uid("field"),
      label: labelFromPdfFieldName(pdfFieldName) || pdfFieldName,
      type: fieldTypeFromPdfField(field),
      required: false,
      pdfFieldName,
    };
  });

  const title = file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").trim() || "Imported PDF Form";

  return {
    id: uid("template"),
    title: labelFromPdfFieldName(title),
    category: "Imported PDF",
    description: "Template created from fillable PDF fields. Review field labels, order, and required settings before publishing.",
    pdfName: file.name,
    approver: settings.approvers[0] || "Administration",
    recipients: settings.defaultRecipients,
    finalCopyRecipients: settings.finalCopyRecipients,
    active: false,
    source: "fillable-pdf",
    fields,
  };
}

function getEditableTemplateDraft(template, settings) {
  if (!template) return getNewTemplateDraft(settings);
  return {
    ...template,
    recipients: (template.recipients || []).join(", "),
    finalCopyRecipients: (template.finalCopyRecipients?.length
      ? template.finalCopyRecipients
      : settings.finalCopyRecipients || []
    ).join(", "),
    fields: template.fields.map((field) => ({ ...field })),
  };
}

function TemplateEditorPanel({ settings, template, onCancel, onSave }) {
  const [draft, setDraft] = useState(() => getEditableTemplateDraft(template, settings));
  const [draggingFieldId, setDraggingFieldId] = useState("");
  const [newFieldId, setNewFieldId] = useState("");
  const [addFeedback, setAddFeedback] = useState("");
  const fieldInputRefs = useRef({});
  const isEditing = Boolean(template);

  useEffect(() => {
    if (!newFieldId) return;
    const fieldInput = fieldInputRefs.current[newFieldId];
    fieldInput?.scrollIntoView({ behavior: "smooth", block: "center" });
    fieldInput?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => {
      setNewFieldId("");
      setAddFeedback("");
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [newFieldId]);

  function updateField(fieldId, patch) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    }));
  }

  function updateFieldType(field, nextType) {
    const patch = { type: nextType };
    if (nextType === "choice") {
      patch.choiceMode = field.choiceMode || "single";
      patch.options = getChoiceOptions(field);
    }
    updateField(field.id, patch);
  }

  function addField() {
    const fieldId = uid("field");
    setDraft((current) => ({
      ...current,
      fields: [...current.fields, { id: fieldId, label: "New Field", type: "text", required: false }],
    }));
    setNewFieldId(fieldId);
    setAddFeedback("Field added");
  }

  function removeField(fieldId) {
    setDraft((current) => ({
      ...current,
      fields: current.fields.filter((field) => field.id !== fieldId),
    }));
  }

  function moveField(sourceId, targetId) {
    if (!sourceId || sourceId === targetId) return;
    setDraft((current) => {
      const sourceIndex = current.fields.findIndex((field) => field.id === sourceId);
      const targetIndex = current.fields.findIndex((field) => field.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return current;

      const nextFields = [...current.fields];
      const [movedField] = nextFields.splice(sourceIndex, 1);
      nextFields.splice(targetIndex, 0, movedField);
      return { ...current, fields: nextFields };
    });
  }

  function saveTemplate() {
    if (!draft.title.trim()) return;
    onSave({
      ...draft,
      id: draft.id || uid("template"),
      pdfName: draft.pdfName || "PDF template pending",
      recipients: parseEmailList(draft.recipients),
      finalCopyRecipients: parseEmailList(draft.finalCopyRecipients),
      active: draft.active,
      fields: draft.fields.map((field) => ({
        ...field,
        id: field.id || uid("field"),
        options: field.type === "choice" ? getChoiceOptions(field) : field.options,
        choiceMode: field.type === "choice" ? field.choiceMode || "single" : field.choiceMode,
      })),
    });
    if (!isEditing) setDraft(getNewTemplateDraft(settings));
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <FilePlus2 size={16} className="text-sky-300" />
          {isEditing ? "Edit PDF Form Template" : "Add PDF Form Template"}
        </div>
      </div>
      <div className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Form Title
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
        </div>

        <label className="space-y-1 text-sm font-medium text-slate-200">
          Description
          <textarea
            value={draft.description}
            onChange={(event) => setDraft({ ...draft, description: event.target.value })}
            className="min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
        </label>

        <div className="grid gap-3 md:grid-cols-[1fr_220px_1fr]">
          <label className="space-y-1 text-sm font-medium text-slate-200">
            PDF File
            <div className="relative">
              <input
                type="file"
                accept="application/pdf"
                onChange={(event) => setDraft({ ...draft, pdfName: event.target.files?.[0]?.name || "" })}
                className="absolute inset-0 cursor-pointer opacity-0"
              />
              <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                <Upload size={15} />
                <span className="truncate">{draft.pdfName || "Choose PDF"}</span>
              </div>
            </div>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Approver
            <select
              value={draft.approver}
              onChange={(event) => setDraft({ ...draft, approver: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
            >
              {settings.approvers.map((approver) => (
                <option key={approver}>{approver}</option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Approval / Denial Emails
            <input
              value={draft.recipients}
              onChange={(event) => setDraft({ ...draft, recipients: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
            />
            <span className="block text-xs font-normal text-slate-500">
              Receives submission notices and one-time email links to approve or reject.
            </span>
          </label>
        </div>

        <label className="space-y-1 text-sm font-medium text-slate-200">
          Completed PDF Recipients
          <input
            value={draft.finalCopyRecipients}
            onChange={(event) => setDraft({ ...draft, finalCopyRecipients: event.target.value })}
            placeholder="mconniry@wvcs.org, records@wvcs.org"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
          <span className="block text-xs font-normal text-slate-500">
            These emails receive the completed approved PDF in addition to the staff member who submitted it.
          </span>
        </label>

        <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          Active for staff
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Staff Fields</div>
              {addFeedback && <div className="mt-1 text-xs font-semibold text-emerald-300">{addFeedback}</div>}
            </div>
            <button
              type="button"
              onClick={addField}
              className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                addFeedback
                  ? "border-emerald-400 bg-emerald-500 text-white"
                  : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
              }`}
            >
              {addFeedback ? <CheckCircle2 size={14} /> : <Plus size={14} />}
              {addFeedback || "Add Field"}
            </button>
          </div>
          {draft.fields.map((field) => (
            <div
              key={field.id}
              draggable
              onDragStart={(event) => {
                setDraggingFieldId(field.id);
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", field.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                moveField(event.dataTransfer.getData("text/plain") || draggingFieldId, field.id);
                setDraggingFieldId("");
              }}
              onDragEnd={() => setDraggingFieldId("")}
              className={`grid cursor-grab gap-3 rounded-lg border bg-slate-950 p-3 transition active:cursor-grabbing md:grid-cols-[34px_minmax(240px,1fr)_170px_130px_40px] ${
                draggingFieldId === field.id
                  ? "border-sky-400 opacity-70"
                  : newFieldId === field.id
                    ? "border-emerald-400 ring-2 ring-emerald-400/30"
                    : "border-slate-800"
              }`}
            >
              <div className="flex items-center justify-center rounded-md border border-slate-800 bg-slate-900 text-xs font-semibold text-slate-500">
                {draft.fields.findIndex((item) => item.id === field.id) + 1}
              </div>
              <div>
                <input
                  ref={(node) => {
                    if (node) fieldInputRefs.current[field.id] = node;
                  }}
                  value={field.label}
                  onChange={(event) => updateField(field.id, { label: event.target.value })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
                {field.pdfFieldName && (
                  <div className="mt-1 truncate text-[11px] text-slate-500">
                    PDF field: {field.pdfFieldName}
                  </div>
                )}
              </div>
              <select
                value={field.type}
                onChange={(event) => updateFieldType(field, event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-400"
              >
                <option value="text">Text</option>
                <option value="textarea">Long Text</option>
                <option value="date">Date</option>
                <option value="time">Time</option>
                <option value="checkbox">Checkbox</option>
                <option value="choice">Choice Group</option>
                <option value="file">File Upload</option>
                <option value="number">Number</option>
                <option value="email">Email</option>
              </select>
              <label className="flex items-center gap-2 text-sm text-slate-300">
                <input
                  type="checkbox"
                  checked={field.required}
                  onChange={(event) => updateField(field.id, { required: event.target.checked })}
                />
                Required
              </label>
              <button
                type="button"
                onClick={() => removeField(field.id)}
                className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-300"
              >
                <Trash2 size={15} />
              </button>
              {field.type === "choice" && (
                <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900 p-3 md:col-span-5">
                  <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      Choice Behavior
                      <select
                        value={field.choiceMode || "single"}
                        onChange={(event) => updateField(field.id, { choiceMode: event.target.value })}
                        className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                      >
                        <option value="single">Single choice</option>
                        <option value="multiple">Multiple choices</option>
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-200">
                      Options
                      <textarea
                        value={getChoiceOptions(field).join("\n")}
                        onChange={(event) => updateField(field.id, { options: parseChoiceOptions(event.target.value) })}
                        className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                        placeholder={"Yes\nNo"}
                      />
                      <span className="block text-xs font-normal text-slate-500">
                        Separate options with commas, semicolons, or new lines.
                      </span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="flex justify-end border-t border-slate-800 pt-3">
            <button
              type="button"
              onClick={addField}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                addFeedback
                  ? "border-emerald-400 bg-emerald-500 text-white"
                  : "border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800"
              }`}
            >
              {addFeedback ? <CheckCircle2 size={16} /> : <Plus size={16} />}
              {addFeedback || "Add Field"}
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          {isEditing && (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={saveTemplate}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
          >
            <FilePlus2 size={16} />
            {isEditing ? "Save Changes" : "Create Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ApprovalQueue({ state, updateState, setSyncStatus, currentUserEmail = "" }) {
  const [selectedId, setSelectedId] = useState(state.submissions[0]?.id || "");
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState(
    state.submissions[0]?.templateId || state.templates[0]?.id || ""
  );
  const [notes, setNotes] = useState("");
  const [signatureName, setSignatureName] = useState(loadApprovalSignature);
  const [reviewFeedback, setReviewFeedback] = useState("");
  const [sendingId, setSendingId] = useState("");
  const templateGroups = useMemo(() => {
    const templateIdsWithSubmissions = new Set(state.submissions.map((submission) => submission.templateId));
    const archivedGroups = state.submissions
      .filter((submission) => !state.templates.some((item) => item.id === submission.templateId))
      .reduce((groups, submission) => {
        if (!groups.some((group) => group.id === submission.templateId)) {
          groups.push({
            id: submission.templateId,
            title: submission.templateTitle || "Archived Form",
            category: "Archived",
          });
        }
        return groups;
      }, []);
    return [...state.templates.filter((item) => templateIdsWithSubmissions.has(item.id)), ...archivedGroups];
  }, [state.submissions, state.templates]);
  const effectiveTemplateFilter = templateGroups.some((group) => group.id === selectedTemplateFilter)
    ? selectedTemplateFilter
    : templateGroups[0]?.id || "";
  const visibleSubmissions = state.submissions.filter((submission) => submission.templateId === effectiveTemplateFilter);
  const selected =
    visibleSubmissions.find((submission) => submission.id === selectedId) ||
    visibleSubmissions[0] ||
    state.submissions[0];
  const template = state.templates.find((item) => item.id === selected?.templateId);

  function selectTemplateGroup(templateId) {
    setSelectedTemplateFilter(templateId);
    const firstSubmission = state.submissions.find((submission) => submission.templateId === templateId);
    setSelectedId(firstSubmission?.id || "");
  }

  async function sendSubmissionEmail(submissionToSend, options = {}) {
    if (!submissionToSend) return;
    if (!["Approved", "Rejected", "Sent"].includes(submissionToSend.status)) {
      setReviewFeedback("Approve or reject the form before sending an email.");
      window.setTimeout(() => setReviewFeedback(""), 2600);
      return;
    }

    const localTemplate = state.templates.find((item) => item.id === submissionToSend.templateId);
    setSendingId(submissionToSend.id);
    if (options.auto) {
      setReviewFeedback(
        submissionToSend.status === "Approved"
          ? "Approved. Sending the completed PDF email now..."
          : "Rejected. Sending the status email now..."
      );
    }

    try {
      const approved = submissionToSend.status === "Approved" || submissionToSend.status === "Sent";
      const recipients = approved
        ? uniqueEmails([
            submissionToSend.submitterEmail,
            ...(localTemplate?.recipients || []),
            ...((localTemplate?.finalCopyRecipients?.length
              ? localTemplate.finalCopyRecipients
              : state.settings.finalCopyRecipients) || []),
          ])
        : uniqueEmails([submissionToSend.submitterEmail, ...(localTemplate?.recipients || [])]);

      const attachments = [];
      if (approved) {
        const pdfBlob = await generateSubmissionPdfBlob(submissionToSend, localTemplate, state.settings);
        attachments.push({
          filename: getPdfFileName(submissionToSend),
          mimeType: "application/pdf",
          contentBase64: await blobToBase64(pdfBlob),
        });

        (localTemplate?.fields || []).forEach((field) => {
          if (field.type !== "file") return;
          attachments.push(fileAnswerToAttachment(submissionToSend.answers[field.id]));
        });
      }

      const resolvedAttachments = (await Promise.all(attachments)).filter(Boolean);

      const sendResult = await sendFormNotification({
        submission: submissionToSend,
        template: localTemplate,
        status: submissionToSend.status,
        notes: submissionToSend.reviewNotes || notes,
        recipients,
        attachments: resolvedAttachments,
      });

      if (!sendResult.sent) {
        throw new Error(sendResult.reason || "Email function did not send the form notification.");
      }

      const sentPatch = {
        status: approved ? "Sent" : submissionToSend.status,
        emailStatus: approved ? "Completed PDF emailed" : "Status email sent",
        emailedAt: new Date().toISOString(),
      };
      updateState((current) => ({
        ...current,
        submissions: current.submissions.map((submission) =>
          submission.id === submissionToSend.id ? { ...submission, ...sentPatch } : submission
        ),
      }));
      saveFormSubmission({ ...submissionToSend, ...sentPatch })
        .then((result) => {
          if (result.saved) setSyncStatus("Shared forms connected.");
        })
        .catch((error) => setSyncStatus(`Email status saved locally. Shared sync failed: ${error.message}`));
      setReviewFeedback(approved ? "Approved and emailed. The completed PDF was sent." : "Rejected and emailed.");
    } catch (error) {
      const errorPatch = { emailStatus: `Email failed: ${error.message}` };
      updateState((current) => ({
        ...current,
        submissions: current.submissions.map((submission) =>
          submission.id === submissionToSend.id ? { ...submission, ...errorPatch } : submission
        ),
      }));
      saveFormSubmission({ ...submissionToSend, ...errorPatch })
        .then((result) => {
          if (result.saved) setSyncStatus("Shared forms connected.");
        })
        .catch((syncError) => setSyncStatus(`Email failure saved locally. Shared sync failed: ${syncError.message}`));
      setReviewFeedback(`Email failed: ${error.message}`);
    } finally {
      setSendingId("");
      window.setTimeout(() => setReviewFeedback(""), 4200);
    }
  }

  async function review(status) {
    if (!selected) return;
    const signedAt = new Date().toISOString();
    const trimmedSignature = signatureName.trim();
    if (status === "Approved" && !trimmedSignature) {
      setReviewFeedback("Type your e-signature before approving.");
      window.setTimeout(() => setReviewFeedback(""), 2600);
      return;
    }
    if (trimmedSignature) {
      localStorage.setItem(SIGNATURE_KEY, trimmedSignature);
    }
    const reviewPatch = {
      status,
      reviewer: formatApproverIdentity(trimmedSignature, currentUserEmail),
      reviewedAt: signedAt,
      reviewNotes: notes,
      emailStatus: status === "Approved" ? "PDF generated, ready for Gmail delivery" : "Ready for status email",
      generatedPdfName: status === "Approved" ? getPdfFileName(selected) : selected.generatedPdfName,
      generatedPdfAt: status === "Approved" ? signedAt : selected.generatedPdfAt,
      approvalSignature:
        status === "Approved"
          ? {
              type: "typed",
              value: formatApproverIdentity(trimmedSignature, currentUserEmail),
              signedAt,
              signerName: trimmedSignature,
              signerEmail: currentUserEmail || "",
              signerRole: template?.approver || "Administration",
            }
          : selected.approvalSignature,
    };
    let storedPdfPatch = {};
    if (status === "Approved") {
      try {
        const reviewedSubmission = { ...selected, ...reviewPatch };
        const pdfBlob = await generateSubmissionPdfBlob(reviewedSubmission, template, state.settings);
        const uploadResult = await uploadFormPdfBlob({
          submissionId: selected.id,
          filename: getPdfFileName(reviewedSubmission),
          blob: pdfBlob,
        });
        if (uploadResult.uploaded) {
          storedPdfPatch = {
            generatedPdfStorageBucket: uploadResult.bucket,
            generatedPdfStoragePath: uploadResult.path,
          };
        }
      } catch (error) {
        setSyncStatus(`Approved PDF generated locally. Storage upload failed: ${error.message}`);
      }
    }

    const nextPatch = { ...reviewPatch, ...storedPdfPatch };
    const reviewedSubmission = { ...selected, ...nextPatch };
    updateState((current) => ({
      ...current,
      submissions: current.submissions.map((submission) =>
        submission.id === selected.id
          ? {
              ...submission,
              ...nextPatch,
            }
          : submission
      ),
    }));
    saveFormSubmission(reviewedSubmission)
      .then((result) => {
        if (result.saved) setSyncStatus("Shared forms connected.");
      })
      .catch((error) => setSyncStatus(`Review saved locally. Shared sync failed: ${error.message}`));
    setNotes("");
    await sendSubmissionEmail(reviewedSubmission, { auto: true });
  }

  async function sendSelectedEmail() {
    await sendSubmissionEmail(selected);
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <ClipboardCheck size={16} className="text-sky-300" />
              Submissions by Form
            </div>
            <div className="text-xs text-slate-500">Choose a form to review its submissions.</div>
          </div>
        </div>
        <div className="max-h-[360px] overflow-auto p-2 xl:max-h-[620px]">
          {templateGroups.length ? (
            <>
              <div className="mb-3 grid gap-2">
                {templateGroups.map((group) => {
                  const groupSubmissions = state.submissions.filter((submission) => submission.templateId === group.id);
                  const pendingCount = groupSubmissions.filter((submission) => submission.status === "Submitted").length;
                  const isActive = effectiveTemplateFilter === group.id;
                  return (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => selectTemplateGroup(group.id)}
                      className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                        isActive
                          ? "border-sky-400 bg-sky-500/15"
                          : "border-slate-800 bg-slate-950 hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-white">{group.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{group.category || "Form"}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm font-bold text-slate-100">{groupSubmissions.length}</div>
                          <div className={`text-xs font-semibold ${pendingCount ? "text-amber-300" : "text-slate-500"}`}>
                            {pendingCount} pending
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-800 pt-3">
                <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  <span>Selected Form</span>
                  <span>{visibleSubmissions.length} total</span>
                </div>
                {visibleSubmissions.map((submission) => (
                  <button
                    key={submission.id}
                    type="button"
                    onClick={() => setSelectedId(submission.id)}
                    className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                      selected?.id === submission.id
                        ? submission.status === "Approved" || submission.status === "Sent"
                          ? "border-emerald-400 bg-emerald-500/15"
                          : "border-sky-400 bg-sky-500/15"
                        : "border-slate-800 bg-slate-950 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-white">{submission.submitterName}</div>
                        <div className="mt-1 truncate text-xs text-slate-400">{submission.submitterEmail}</div>
                      </div>
                      <Badge status={submission.status}>{submission.status}</Badge>
                    </div>
                    <div className="mt-2 text-xs text-slate-500">{formatDate(submission.submittedAt)}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="p-4 text-sm text-slate-400">No submissions yet.</div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
        {selected ? (
          <>
            {reviewFeedback && (
              <div className="border-b border-emerald-400/40 bg-emerald-500/15 px-5 py-3 text-sm font-semibold text-emerald-100">
                <CheckCircle2 size={16} className="mr-2 inline" />
                {reviewFeedback}
              </div>
            )}
            <div className="border-b border-slate-800 p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                    {template?.category || "Form Review"}
                  </div>
                  <h2 className="mt-2 text-xl font-bold text-white">{selected.templateTitle}</h2>
                  <p className="mt-1 text-sm text-slate-400">
                    Submitted by {selected.submitterName} on {formatDate(selected.submittedAt)}
                  </p>
                </div>
                <Badge status={selected.status}>{selected.status}</Badge>
              </div>
            </div>

            <div className="space-y-4 p-3 sm:p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Approver</div>
                  <div className="mt-2 text-sm font-semibold text-white">{getApproverLabel(selected, template)}</div>
                  {selected.status === "Submitted" && (
                    <div className="mt-1 text-xs text-slate-500">Approval role</div>
                  )}
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Generated PDF</div>
                  <div className="mt-2 truncate text-sm font-semibold text-white">
                    {selected.generatedPdfName || "Not generated yet"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">{formatDate(selected.generatedPdfAt)}</div>
                </div>
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Email Status</div>
                  <div className="mt-2 text-sm font-semibold text-white">{selected.emailStatus}</div>
                </div>
              </div>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
                  <ShieldCheck size={16} className="text-emerald-300" />
                  Approval History
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  {[
                    ["Submitted By", `${selected.submitterName} <${selected.submitterEmail}>`],
                    ["Submitted", formatDate(selected.submittedAt)],
                    ["Source", selected.source === "public-share-link" ? "Public form link" : "Hub form"],
                    ["Reviewed By", selected.reviewer || "Not reviewed yet"],
                    ["Reviewed", formatDate(selected.reviewedAt) || "Not reviewed yet"],
                    ["E-Signature", selected.approvalSignature?.value || "Not signed yet"],
                    ["PDF Generated", selected.generatedPdfName ? `${selected.generatedPdfName} ${formatDate(selected.generatedPdfAt)}` : "Not generated yet"],
                    ["Email", selected.emailStatus || "No email status yet"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</div>
                      <div className="mt-1 break-words text-sm font-semibold text-slate-100">{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-lg border border-slate-800">
                {(template?.fields || []).map((field) => (
                  <div key={field.id} className="grid gap-0 border-b border-slate-800 last:border-b-0 md:grid-cols-[240px_1fr]">
                    <div className="bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-300">{field.label}</div>
                    <div className="px-4 py-3 text-sm text-slate-100">
                      <div>{renderAnswerValue(selected.answers[field.id])}</div>
                      {field.type === "file" && (
                        <div className="mt-2">
                          <AttachmentLink attachment={selected.answers[field.id]} />
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <label className="space-y-1 text-sm font-medium text-slate-200">
                Approval Notes
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
                  placeholder="Optional notes for the staff member and approval record"
                />
              </label>

              <div className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                <label className="space-y-1 text-sm font-medium text-slate-200">
                  Approval E-Signature
                  <input
                    value={signatureName}
                    onChange={(event) => setSignatureName(event.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-400"
                    placeholder="Type your full name"
                  />
                </label>
                <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Signature Preview</div>
                  <div className="mt-1 font-serif text-2xl text-white">{signatureName || "Your Name"}</div>
                  <div className="mt-1 text-xs text-slate-400">
                    This typed signature will be added to the generated approval PDF.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-800 pt-4 sm:flex sm:flex-wrap sm:justify-end sm:pt-5">
                <button
                  type="button"
                  onClick={() => previewSubmissionPdf(selected, template, state.settings)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                >
                  <Eye size={16} />
                  Preview PDF
                </button>
                <button
                  type="button"
                  onClick={() => downloadSubmissionPdf(selected, template, state.settings)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                >
                  <Download size={16} />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => review("Rejected")}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-400 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/25"
                >
                  <XCircle size={16} />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => review("Approved")}
                  className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-white transition ${
                    selected.status === "Approved"
                      ? "border-emerald-300 bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.22)]"
                      : "border-emerald-400 bg-emerald-500 hover:bg-emerald-400"
                  }`}
                >
                  <CheckCircle2 size={16} />
                  {selected.status === "Approved" ? "Approved" : "Approve"}
                </button>
                <button
                  type="button"
                  disabled={sendingId === selected.id || !["Approved", "Rejected", "Sent"].includes(selected.status)}
                  onClick={sendSelectedEmail}
                  className="col-span-2 inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400 sm:col-span-1"
                >
                  <Mail size={16} />
                  {sendingId === selected.id ? "Sending..." : selected.status === "Approved" || selected.status === "Sent" ? "Send PDF Email" : "Send Status Email"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="p-8 text-sm text-slate-400">No submissions yet.</div>
        )}
      </div>
    </div>
  );
}

function SettingsPanel({ state, updateState }) {
  const [draft, setDraft] = useState({
    approvers: state.settings.approvers.join(", "),
    defaultRecipients: state.settings.defaultRecipients.join(", "),
    finalCopyRecipients: state.settings.finalCopyRecipients.join(", "),
    gmailSender: state.settings.gmailSender,
    supabaseProjectUrl: state.settings.supabaseProjectUrl,
  });

  function saveSettings() {
    updateState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        approvers: parseEmailList(draft.approvers),
        defaultRecipients: parseEmailList(draft.defaultRecipients),
        finalCopyRecipients: parseEmailList(draft.finalCopyRecipients),
        gmailSender: draft.gmailSender,
        supabaseProjectUrl: draft.supabaseProjectUrl,
      },
    }));
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-semibold text-white">
          <Settings size={16} className="text-sky-300" />
          Administration Tools
        </div>
        <div className="grid gap-4">
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Approver Roles
            <input
              value={draft.approvers}
              onChange={(event) => setDraft({ ...draft, approvers: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Default Admin Recipients
            <input
              value={draft.defaultRecipients}
              onChange={(event) => setDraft({ ...draft, defaultRecipients: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Final Copy Recipients
            <input
              value={draft.finalCopyRecipients}
              onChange={(event) => setDraft({ ...draft, finalCopyRecipients: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
            />
          </label>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-200">
              Gmail Sender
              <input
                value={draft.gmailSender}
                onChange={(event) => setDraft({ ...draft, gmailSender: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-200">
              Supabase Project URL
              <input
                value={draft.supabaseProjectUrl}
                onChange={(event) => setDraft({ ...draft, supabaseProjectUrl: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveSettings}
              className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-400"
            >
              <CheckCircle2 size={16} />
              Save Settings
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-white">
            <ShieldCheck size={16} className="text-emerald-300" />
            Backend Readiness
          </div>
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <AlertCircle size={16} className="mt-0.5 text-amber-300" />
              <div>
                <div className="text-sm font-semibold text-white">Supabase</div>
                <p className="mt-1 text-xs text-slate-400">
                  Store form templates, submissions, generated PDFs, users, and audit history.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <AlertCircle size={16} className="mt-0.5 text-amber-300" />
              <div>
                <div className="text-sm font-semibold text-white">Gmail API</div>
                <p className="mt-1 text-xs text-slate-400">
                  Send approval notices and final PDF copies after the server function is connected.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TemplateLibrary({ state, updateState, setSyncStatus }) {
  const [editingId, setEditingId] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [templateToDelete, setTemplateToDelete] = useState(null);
  const [expandedTemplateIds, setExpandedTemplateIds] = useState({});
  const [shareStatus, setShareStatus] = useState({ templateId: "", message: "", tone: "info" });
  const [publicLinks, setPublicLinks] = useState([]);
  const [publicLinksLoading, setPublicLinksLoading] = useState(true);
  const editingTemplate = state.templates.find((template) => template.id === editingId);
  const publicDirectoryUrl = `${getPublicShareBaseUrl()}#/public-forms`;

  async function loadPublicLinks() {
    setPublicLinksLoading(true);
    try {
      const result = await handleFormShareLink({
        operation: "manage",
        shareBaseUrl: getPublicShareBaseUrl(),
      });
      if (!result.ok) throw new Error(result.error || result.reason || "Unable to load public form links.");
      setPublicLinks(result.links || []);
    } catch (error) {
      setShareStatus({ templateId: "manager", message: error.message, tone: "warning" });
    } finally {
      setPublicLinksLoading(false);
    }
  }

  useEffect(() => {
    loadPublicLinks();
  }, [state.templates.length]);

  function addTemplate(template) {
    updateState((current) => ({
      ...current,
      templates: [template, ...current.templates],
    }));
    saveFormTemplate(template)
      .then((result) => {
        if (result.saved) setSyncStatus("Shared form templates connected.");
      })
      .catch((error) => setSyncStatus(`Template saved locally. Shared sync failed: ${error.message}`));
  }

  function updateTemplate(nextTemplate) {
    updateState((current) => ({
      ...current,
      templates: current.templates.map((template) => (template.id === nextTemplate.id ? nextTemplate : template)),
      submissions: current.submissions.map((submission) =>
        submission.templateId === nextTemplate.id
          ? { ...submission, templateTitle: nextTemplate.title }
          : submission
      ),
    }));
    saveFormTemplate(nextTemplate)
      .then((result) => {
        if (result.saved) setSyncStatus("Shared form templates connected.");
      })
      .catch((error) => setSyncStatus(`Template saved locally. Shared sync failed: ${error.message}`));
    setEditingId("");
  }

  function toggleTemplate(templateId) {
    const nextTemplate = state.templates.find((template) => template.id === templateId);
    const patchedTemplate = nextTemplate ? { ...nextTemplate, active: !nextTemplate.active } : null;
    updateState((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === templateId ? { ...template, active: !template.active } : template
      ),
    }));
    if (patchedTemplate) {
      saveFormTemplate(patchedTemplate)
        .then((result) => {
          if (result.saved) setSyncStatus("Shared form templates connected.");
        })
        .catch((error) => setSyncStatus(`Template updated locally. Shared sync failed: ${error.message}`));
    }
  }

  function deleteTemplate(templateId) {
    updateState((current) => ({
      ...current,
      templates: current.templates.filter((template) => template.id !== templateId),
    }));
    deleteFormTemplate(templateId)
      .then((result) => {
        if (result.saved) setSyncStatus("Shared form templates connected.");
      })
      .catch((error) => setSyncStatus(`Template deleted locally. Shared sync failed: ${error.message}`));
    setTemplateToDelete(null);
    setExpandedTemplateIds((current) => {
      const next = { ...current };
      delete next[templateId];
      return next;
    });
  }

  function toggleTemplateExpanded(templateId) {
    setExpandedTemplateIds((current) => ({ ...current, [templateId]: !current[templateId] }));
  }

  async function importFillablePdf(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      setImportStatus(`Reading ${file.name}...`);
      const template = await templateFromFillablePdf(file, state.settings);
      addTemplate(template);
      setEditingId(template.id);
      setImportStatus(`Imported ${template.fields.length} fields from ${file.name}. Review and activate when ready.`);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Unable to import this PDF.");
    }
  }

  async function createShareLink(template) {
    setShareStatus({ templateId: template.id, message: "Creating static public link...", tone: "info" });
    try {
      const result = await handleFormShareLink({
        operation: "create",
        templateId: template.id,
        shareBaseUrl: getPublicShareBaseUrl(),
        static: true,
      });
      if (!result.ok || !result.url) throw new Error(result.error || result.reason || "Unable to create share link.");

      try {
        await navigator.clipboard.writeText(result.url);
        setShareStatus({ templateId: template.id, message: "Static public form link copied.", tone: "success" });
      } catch {
        setShareStatus({ templateId: template.id, message: result.url, tone: "success" });
      }
      window.setTimeout(() => {
        setShareStatus((current) => (current.templateId === template.id ? { templateId: "", message: "", tone: "info" } : current));
      }, 5000);
      await loadPublicLinks();
    } catch (error) {
      setShareStatus({ templateId: template.id, message: error.message, tone: "warning" });
    }
  }

  async function copyPublicLink(link) {
    if (!link.publicActive) {
      const template = state.templates.find((item) => item.id === link.templateId);
      if (template) {
        await createShareLink(template);
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(link.url);
      setShareStatus({ templateId: link.templateId, message: "Public form link copied.", tone: "success" });
    } catch {
      setShareStatus({ templateId: link.templateId, message: link.url, tone: "success" });
    }
  }

  async function disablePublicLink(link) {
    setShareStatus({ templateId: link.templateId, message: "Disabling public link...", tone: "info" });
    try {
      const result = await handleFormShareLink({
        operation: "disable",
        templateId: link.templateId,
      });
      if (!result.ok) throw new Error(result.error || result.reason || "Unable to disable public link.");
      setShareStatus({ templateId: link.templateId, message: "Public link disabled.", tone: "success" });
      await loadPublicLinks();
    } catch (error) {
      setShareStatus({ templateId: link.templateId, message: error.message, tone: "warning" });
    }
  }

  async function copyPublicDirectoryLink() {
    try {
      await navigator.clipboard.writeText(publicDirectoryUrl);
      setShareStatus({ templateId: "directory", message: "Public forms directory link copied.", tone: "success" });
    } catch {
      setShareStatus({ templateId: "directory", message: publicDirectoryUrl, tone: "success" });
    }
    window.setTimeout(() => {
      setShareStatus((current) => (current.templateId === "directory" ? { templateId: "", message: "", tone: "info" } : current));
    }, 5000);
  }

  if (editingTemplate) {
    return (
      <div className="min-h-[680px] rounded-lg border border-sky-500/30 bg-slate-950">
        <div className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/95 px-5 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">
                <Settings size={15} />
                Editing Template
              </div>
              <h2 className="mt-2 text-2xl font-bold text-white">{editingTemplate.title}</h2>
              <p className="mt-1 text-sm text-slate-400">
                Make changes to the full PDF form template, fields, approver, recipients, and staff availability.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setEditingId("")}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              <XCircle size={16} />
              Back to Templates
            </button>
          </div>
        </div>

        <div className="mx-auto max-w-[1200px] p-5">
          <TemplateEditorPanel
            key={editingId}
            settings={state.settings}
            template={editingTemplate}
            onCancel={() => setEditingId("")}
            onSave={updateTemplate}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(720px,1fr)_420px]">
      <div>
        <TemplateEditorPanel
          key="new-template"
          settings={state.settings}
          template={null}
          onCancel={() => setEditingId("")}
          onSave={addTemplate}
        />
      </div>

      <div className="space-y-4">
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Link2 size={16} className="text-violet-200" />
                Public Forms Manager
              </div>
              <p className="mt-1 text-xs leading-5 text-violet-100/80">
                Control which templates are visible outside the Hub and copy links for sharing.
              </p>
            </div>
            <button
              type="button"
              onClick={copyPublicDirectoryLink}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-violet-400 bg-violet-500 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-400"
            >
              <Copy size={14} />
              Copy Directory
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {publicLinksLoading && (
              <div className="rounded-lg border border-violet-400/20 bg-slate-950/70 p-3 text-xs text-violet-100/80">
                Loading public form links...
              </div>
            )}
            {!publicLinksLoading && publicLinks.length ? (
              publicLinks.map((link) => (
                <div key={link.templateId} className="rounded-lg border border-violet-400/20 bg-slate-950/70 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-semibold text-white">{link.title}</div>
                      <div className="mt-1 truncate text-[11px] text-violet-100/70">
                        {link.category || "Uncategorized"} · {link.fieldCount} field{link.fieldCount === 1 ? "" : "s"}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-1 text-[11px] font-bold ${
                      link.publicActive
                        ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                        : "border-slate-600 bg-slate-900 text-slate-300"
                    }`}>
                      {link.publicActive ? "Public" : "Private"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyPublicLink(link)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-violet-400/60 bg-violet-500/15 px-2 py-1 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/25"
                  >
                    <Link2 size={12} />
                    {link.publicActive ? "Copy Link" : "Make Public"}
                  </button>
                    {link.publicActive && (
                      <>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-800"
                        >
                          <Eye size={12} />
                          Open
                        </a>
                        <button
                          type="button"
                          onClick={() => disablePublicLink(link)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-rose-500/60 bg-rose-500/15 px-2 py-1 text-[11px] font-semibold text-rose-100 hover:bg-rose-500/25"
                        >
                          <XCircle size={12} />
                          Disable
                        </button>
                      </>
                    )}
                  </div>
                  {shareStatus.templateId === link.templateId && shareStatus.message && (
                    <div className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
                      shareStatus.tone === "warning"
                        ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                        : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                    }`}>
                      {shareStatus.message}
                    </div>
                  )}
                </div>
              ))
            ) : !publicLinksLoading ? (
              <div className="rounded-lg border border-violet-400/20 bg-slate-950/70 p-3 text-xs text-violet-100/80">
                No templates are available yet.
              </div>
            ) : null}
          </div>
          {shareStatus.templateId === "manager" && shareStatus.message && (
            <div className="mt-3 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-100">
              {shareStatus.message}
            </div>
          )}
          {shareStatus.templateId === "directory" && shareStatus.message && (
            <div className="mt-3 rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-100">
              {shareStatus.message}
            </div>
          )}
        </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <FileText size={16} className="text-sky-300" />
                Template Library
              </div>
              {importStatus && <div className="mt-2 text-xs font-semibold text-sky-300">{importStatus}</div>}
            </div>
            <label className="relative inline-flex cursor-pointer items-center gap-2 rounded-lg border border-sky-500/60 bg-sky-500/15 px-3 py-2 text-xs font-semibold text-sky-100 hover:bg-sky-500/25">
              <Upload size={14} />
              Convert Fillable PDF
              <input type="file" accept="application/pdf" onChange={importFillablePdf} className="absolute inset-0 opacity-0" />
            </label>
          </div>
        </div>
        <div className="grid gap-3 p-4">
          {state.templates.map((template) => {
            const isExpanded = Boolean(expandedTemplateIds[template.id]);
            return (
              <article key={template.id} className="overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
                <button
                  type="button"
                  onClick={() => toggleTemplateExpanded(template.id)}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left transition hover:bg-slate-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {isExpanded ? <ChevronDown size={16} className="shrink-0 text-sky-300" /> : <ChevronRight size={16} className="shrink-0 text-slate-500" />}
                      <div className="truncate text-sm font-semibold text-white">{template.title}</div>
                    </div>
                    <div className="mt-1 truncate pl-6 text-xs text-slate-500">
                      {template.category || "Uncategorized"} · {template.fields.length} field{template.fields.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <Badge status={template.active ? "Approved" : "Draft"}>{template.active ? "Active" : "Inactive"}</Badge>
                </button>

                {isExpanded && (
                  <div className="border-t border-slate-800 p-4">
                    <p className="text-sm text-slate-400">{template.description}</p>
                    <div className="mt-4 grid gap-2 text-xs text-slate-400">
                      <div>PDF: <span className="text-slate-200">{template.pdfName}</span></div>
                      {template.source === "fillable-pdf" && (
                        <div>Source: <span className="text-slate-200">Fillable PDF import</span></div>
                      )}
                      <div>Approver: <span className="text-slate-200">{template.approver}</span></div>
                      <div>
                        Completed PDF recipients:{" "}
                        <span className="text-slate-200">
                          {(template.finalCopyRecipients?.length
                            ? template.finalCopyRecipients
                            : state.settings.finalCopyRecipients || []
                          ).join(", ") || "Submitter only"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => previewSubmissionPdf(getSampleSubmission(template), template, state.settings)}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                      >
                        <Eye size={14} />
                        Preview PDF
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(template.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-xs font-semibold text-white shadow-lg shadow-sky-950/30 transition hover:bg-sky-400"
                      >
                        <Settings size={14} />
                        Edit Template
                      </button>
                      <button
                        type="button"
                        onClick={() => createShareLink(template)}
                        className="inline-flex items-center gap-2 rounded-lg border border-violet-500/60 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/25"
                      >
                        {shareStatus.templateId === template.id && shareStatus.message === "Static public form link copied." ? <Copy size={14} /> : <Link2 size={14} />}
                        Copy Static Public Link
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleTemplate(template.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                      >
                        <RefreshCw size={14} />
                        {template.active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setTemplateToDelete(template)}
                        className="inline-flex items-center gap-2 rounded-lg border border-rose-500/60 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/25"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </div>
                    {shareStatus.templateId === template.id && shareStatus.message && (
                      <div
                        className={`mt-3 rounded-lg border px-3 py-2 text-xs font-semibold ${
                          shareStatus.tone === "warning"
                            ? "border-amber-400/40 bg-amber-500/10 text-amber-100"
                            : "border-emerald-400/40 bg-emerald-500/10 text-emerald-100"
                        }`}
                      >
                        {shareStatus.message}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
      </div>

      {templateToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-lg border border-rose-500/40 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="rounded-lg border border-rose-400/40 bg-rose-500/15 p-2 text-rose-100">
                <Trash2 size={18} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Delete Template?</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">
                  This will remove <span className="font-semibold text-slate-100">{templateToDelete.title}</span> from the template library.
                  Existing submissions will remain in the approval history.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTemplateToDelete(null)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => deleteTemplate(templateToDelete.id)}
                className="rounded-lg border border-rose-400 bg-rose-500 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-400"
              >
                Delete Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AdminFormsModule({ currentUserEmail = "" }) {
  const [state, updateState, syncStatus, setSyncStatus] = useFormsStore();
  const [view, setView] = useState("queue");
  const submitted = state.submissions.filter((item) => item.status === "Submitted").length;
  const approved = state.submissions.filter((item) => item.status === "Approved" || item.status === "Sent").length;
  const rejected = state.submissions.filter((item) => item.status === "Rejected").length;

  return (
    <Shell>
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-sky-300">Forms Administration</div>
          <h1 className="mt-2 text-2xl font-bold text-white">PDF Forms and Approvals</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Manage staff-facing form templates, approval routing, and final copy delivery rules.
          </p>
          <div className="mt-3 inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-semibold text-slate-300">
            {syncStatus}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            ["queue", "Approvals", ClipboardCheck],
            ["templates", "Templates", FilePlus2],
            ["settings", "Settings", Settings],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setView(id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                view === id
                  ? "border-sky-400 bg-sky-500 text-white"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <Stat icon={FileText} label="Templates" value={state.templates.length} />
        <Stat icon={ClipboardCheck} label="Pending" value={submitted} tone="amber" />
        <Stat icon={CheckCircle2} label="Approved/Sent" value={approved} tone="emerald" />
        <Stat icon={XCircle} label="Rejected" value={rejected} tone="rose" />
      </div>

      {view === "queue" && (
        <ApprovalQueue
          state={state}
          updateState={updateState}
          setSyncStatus={setSyncStatus}
          currentUserEmail={currentUserEmail}
        />
      )}
      {view === "templates" && (
        <TemplateLibrary state={state} updateState={updateState} setSyncStatus={setSyncStatus} />
      )}
      {view === "settings" && <SettingsPanel state={state} updateState={updateState} />}
    </Shell>
  );
}

export { AdminFormsModule };
export default StaffFormsModule;
