import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import html2pdf from "html2pdf.js";
import { PDFCheckBox, PDFDropdown, PDFRadioGroup, PDFTextField, PDFDocument } from "pdf-lib";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FilePlus2,
  FileText,
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

  function updateState(updater) {
    setState((current) => {
      const next = updater(current);
      saveFormsState(next);
      return next;
    });
  }

  return [state, updateState];
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

function hasRequiredAnswer(field, answers) {
  if (!field.required) return true;
  if (field.type === "checkbox") return answers[field.id] === true;
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

function SubmissionPdf({ submission, template, settings }) {
  const recipients = [
    submission.submitterEmail,
    ...(template?.recipients || []),
    ...(settings.finalCopyRecipients || []),
  ];
  const fieldRows = template?.fields || [];
  const labelStyle = {
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "1.2px",
    textTransform: "uppercase",
    color: "#64748b",
  };
  function renderPdfAnswer(field) {
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

    return submission.answers[field.id] || "-";
  }

  return (
    <div
      style={{
        width: "709px",
        padding: "28px 34px 44px",
        background: "#ffffff",
        color: "#020617",
        fontFamily: "Arial, Helvetica, sans-serif",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          gap: "20px",
          background: "#f8fafc",
          border: "1px solid #cbd5e1",
          borderBottom: "4px solid #075985",
          borderRadius: "8px 8px 0 0",
          padding: "14px 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <img src="/wvcs-logo.png" alt="WVCS" style={{ width: "180px", maxHeight: "72px", objectFit: "contain" }} />
          <div>
            <div style={{ ...labelStyle, letterSpacing: "2.2px" }}>
              WVCS Administrative Form
            </div>
            <h1 style={{ margin: "8px 0 0", fontSize: "24px", fontWeight: 700, color: "#020617" }}>
              {submission.templateTitle}
            </h1>
            <p style={{ margin: "4px 0 0", fontSize: "14px", lineHeight: 1.45, color: "#475569" }}>
              {template?.description || "Generated form record"}
            </p>
          </div>
        </div>
        <div
          style={{
            minWidth: "92px",
            border: "1px solid #94a3b8",
            borderRadius: "6px",
            background: "#ffffff",
            padding: "8px 12px",
            textAlign: "center",
            fontSize: "14px",
            fontWeight: 700,
          }}
        >
          <div style={labelStyle}>Status</div>
          <div style={{ marginTop: "3px" }}>{submission.status}</div>
        </div>
      </div>

      <div
        style={{
          marginTop: "20px",
          border: "1px solid #cbd5e1",
          borderRadius: "6px",
          background: "#f8fafc",
          padding: "12px",
          fontSize: "12px",
          color: "#475569",
        }}
      >
        <span style={{ fontWeight: 700, color: "#1e293b" }}>Submission ID:</span> {submission.id}
        <span style={{ margin: "0 8px" }}>|</span>
        <span style={{ fontWeight: 700, color: "#1e293b" }}>PDF:</span> {getPdfFileName(submission)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "24px", fontSize: "14px" }}>
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
          <div>{submission.reviewer || template?.approver || "Administration"}</div>
        </div>
        <div>
          <div style={labelStyle}>Reviewed</div>
          <div>{formatDate(submission.reviewedAt)}</div>
        </div>
      </div>

      <div style={{ marginTop: "28px" }}>
        <h2 style={{ margin: 0, borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", fontSize: "18px" }}>
          Form Responses
        </h2>
        <div style={{ marginTop: "12px", overflow: "hidden", border: "1px solid #cbd5e1", borderRadius: "6px" }}>
          {fieldRows.map((field, index) => (
            <div
              key={field.id}
              style={{
                display: "grid",
                gridTemplateColumns: "220px 1fr",
                borderBottom: index === fieldRows.length - 1 ? "none" : "1px solid #e2e8f0",
              }}
            >
              <div style={{ background: "#f1f5f9", padding: "8px 12px", fontSize: "14px", fontWeight: 700 }}>
                {field.label}
              </div>
              <div style={{ padding: "8px 12px", fontSize: "14px", whiteSpace: "pre-wrap" }}>
                {renderPdfAnswer(field)}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: "28px" }}>
        <h2 style={{ margin: 0, borderBottom: "1px solid #cbd5e1", paddingBottom: "8px", fontSize: "18px" }}>
          Approval Record
        </h2>
        <p
          style={{
            minHeight: "64px",
            margin: "8px 0 0",
            border: "1px solid #cbd5e1",
            borderRadius: "6px",
            padding: "12px",
            fontSize: "14px",
            whiteSpace: "pre-wrap",
          }}
        >
          {submission.reviewNotes || "No notes entered."}
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
          <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "8px", fontSize: "12px", color: "#475569" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", color: "#020617" }}>
              {submission.approvalSignature?.value || ""}
            </div>
            <div>Electronic Signature</div>
            {submission.approvalSignature?.signerRole && (
              <div style={{ marginTop: "3px" }}>{submission.approvalSignature.signerRole}</div>
            )}
          </div>
          <div style={{ borderTop: "1px solid #94a3b8", paddingTop: "8px", fontSize: "12px", color: "#475569" }}>
            <div style={{ fontSize: "14px", color: "#020617" }}>
              {formatDate(submission.approvalSignature?.signedAt || submission.reviewedAt)}
            </div>
            <div>Date Signed</div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: "28px", borderTop: "1px solid #cbd5e1", paddingTop: "16px", fontSize: "12px", color: "#475569" }}>
        Final copy recipients: {recipients.filter(Boolean).join(", ")}
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
  const { host, element } = renderPdfNode(submission, template, settings);
  const root = createRoot(host);
  root.render(element);

  await new Promise((resolve) => setTimeout(resolve, 100));
  await html2pdf()
    .set({
      margin: [32, 40, 48, 40],
      filename: getPdfFileName(submission),
      html2canvas: { scale: 2 },
      jsPDF: { unit: "pt", format: "letter", orientation: "portrait" },
    })
    .from(host.firstElementChild)
    .save();

  root.unmount();
  host.remove();
}

function StaffFormsModule() {
  const [state, updateState] = useFormsStore();
  const activeTemplates = state.templates.filter((template) => template.active);
  const [selectedId, setSelectedId] = useState(activeTemplates[0]?.id || "");
  const selectedTemplate = activeTemplates.find((template) => template.id === selectedId) || activeTemplates[0];
  const [submitter, setSubmitter] = useState({ name: "", email: "" });
  const [answers, setAnswers] = useState({});
  const mySubmissions = state.submissions.filter(
    (submission) => submission.submitterEmail && submission.submitterEmail === submitter.email
  );

  function submitForm() {
    if (!selectedTemplate || !submitter.name.trim() || !submitter.email.trim()) return;
    const missing = selectedTemplate.fields.some((field) => !hasRequiredAnswer(field, answers));
    if (missing) return;

    const submission = {
      id: uid("sub"),
      templateId: selectedTemplate.id,
      templateTitle: selectedTemplate.title,
      submitterName: submitter.name.trim(),
      submitterEmail: submitter.email.trim(),
      submittedAt: new Date().toISOString(),
      status: "Submitted",
      reviewer: "",
      reviewedAt: "",
      reviewNotes: "",
      answers,
      emailStatus: "Pending approval",
    };

    updateState((current) => ({
      ...current,
      submissions: [submission, ...current.submissions],
    }));
    setAnswers({});
  }

  const canSubmit =
    selectedTemplate &&
    submitter.name.trim() &&
    submitter.email.trim() &&
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
                    setSelectedId(template.id);
                    setAnswers({});
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
                    </label>
                  </div>

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
                      disabled={!canSubmit}
                      onClick={submitForm}
                      className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Send size={16} />
                      Submit for Approval
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
                        <button
                          type="button"
                          onClick={() => downloadSubmissionPdf(submission, template, state.settings)}
                          className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-sky-300 hover:text-sky-200"
                        >
                          <Download size={14} />
                          Download PDF Copy
                        </button>
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
      active: draft.active,
      fields: draft.fields.map((field) => ({
        ...field,
        id: field.id || uid("field"),
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
            Approval Copy Emails
            <input
              value={draft.recipients}
              onChange={(event) => setDraft({ ...draft, recipients: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-sky-400"
            />
          </label>
        </div>

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
                onChange={(event) => updateField(field.id, { type: event.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-sky-400"
              >
                <option value="text">Text</option>
                <option value="textarea">Long Text</option>
                <option value="date">Date</option>
                <option value="time">Time</option>
                <option value="checkbox">Checkbox</option>
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

function ApprovalQueue({ state, updateState }) {
  const [selectedId, setSelectedId] = useState(state.submissions[0]?.id || "");
  const selected = state.submissions.find((submission) => submission.id === selectedId) || state.submissions[0];
  const template = state.templates.find((item) => item.id === selected?.templateId);
  const [notes, setNotes] = useState("");
  const [signatureName, setSignatureName] = useState(loadApprovalSignature);
  const [reviewFeedback, setReviewFeedback] = useState("");

  function review(status) {
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
    updateState((current) => ({
      ...current,
      submissions: current.submissions.map((submission) =>
        submission.id === selected.id
          ? {
              ...submission,
              status,
              reviewer: template?.approver || "Administration",
              reviewedAt: signedAt,
              reviewNotes: notes,
              emailStatus: status === "Approved" ? "PDF generated, ready for Gmail delivery" : "Ready for status email",
              generatedPdfName: status === "Approved" ? getPdfFileName(submission) : submission.generatedPdfName,
              generatedPdfAt: status === "Approved" ? signedAt : submission.generatedPdfAt,
              approvalSignature:
                status === "Approved"
                  ? {
                      type: "typed",
                      value: trimmedSignature,
                      signedAt,
                      signerRole: template?.approver || "Administration",
                    }
                  : submission.approvalSignature,
            }
          : submission
      ),
    }));
    setReviewFeedback(status === "Approved" ? "Approved. PDF is ready for delivery." : "Rejected. Status email is ready.");
    window.setTimeout(() => setReviewFeedback(""), 2600);
    setNotes("");
  }

  function markSent() {
    if (!selected) return;
    updateState((current) => ({
      ...current,
      submissions: current.submissions.map((submission) =>
        submission.id === selected.id ? { ...submission, status: "Sent", emailStatus: "Sent by Gmail API" } : submission
      ),
    }));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
      <div className="rounded-lg border border-slate-800 bg-slate-900">
        <div className="border-b border-slate-800 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <ClipboardCheck size={16} className="text-sky-300" />
            Approval Queue
          </div>
        </div>
        <div className="max-h-[620px] overflow-auto p-2">
          {state.submissions.map((submission) => (
            <button
              key={submission.id}
              type="button"
              onClick={() => setSelectedId(submission.id)}
              className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                selected?.id === submission.id
                  ? submission.status === "Approved"
                    ? "border-emerald-400 bg-emerald-500/15"
                    : "border-sky-400 bg-sky-500/15"
                  : "border-slate-800 bg-slate-950 hover:border-slate-600"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{submission.templateTitle}</div>
                  <div className="mt-1 text-xs text-slate-400">{submission.submitterName}</div>
                </div>
                <Badge status={submission.status}>{submission.status}</Badge>
              </div>
              <div className="mt-2 text-xs text-slate-500">{formatDate(submission.submittedAt)}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-800 bg-slate-900">
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

            <div className="space-y-5 p-5">
              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">Approver</div>
                  <div className="mt-2 text-sm font-semibold text-white">{template?.approver || "Administration"}</div>
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

              <div className="overflow-hidden rounded-lg border border-slate-800">
                {(template?.fields || []).map((field) => (
                  <div key={field.id} className="grid gap-0 border-b border-slate-800 last:border-b-0 md:grid-cols-[240px_1fr]">
                    <div className="bg-slate-950 px-4 py-3 text-sm font-semibold text-slate-300">{field.label}</div>
                    <div className="px-4 py-3 text-sm text-slate-100">{selected.answers[field.id] || "-"}</div>
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

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-5">
                <button
                  type="button"
                  onClick={() => downloadSubmissionPdf(selected, template, state.settings)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
                >
                  <Download size={16} />
                  PDF Copy
                </button>
                <button
                  type="button"
                  onClick={() => review("Rejected")}
                  className="inline-flex items-center gap-2 rounded-lg border border-rose-400 bg-rose-500/15 px-3 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/25"
                >
                  <XCircle size={16} />
                  Reject
                </button>
                <button
                  type="button"
                  onClick={() => review("Approved")}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-white transition ${
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
                  onClick={markSent}
                  className="inline-flex items-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-400"
                >
                  <Mail size={16} />
                  Mark Sent
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

function TemplateLibrary({ state, updateState }) {
  const [editingId, setEditingId] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const editingTemplate = state.templates.find((template) => template.id === editingId);

  function addTemplate(template) {
    updateState((current) => ({
      ...current,
      templates: [template, ...current.templates],
    }));
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
    setEditingId("");
  }

  function toggleTemplate(templateId) {
    updateState((current) => ({
      ...current,
      templates: current.templates.map((template) =>
        template.id === templateId ? { ...template, active: !template.active } : template
      ),
    }));
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
    <div className="grid gap-4 2xl:grid-cols-[520px_minmax(720px,1fr)]">
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
          {state.templates.map((template) => (
            <div key={template.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{template.title}</div>
                  <div className="mt-1 text-xs text-slate-500">{template.category || "Uncategorized"}</div>
                </div>
                <Badge status={template.active ? "Approved" : "Draft"}>{template.active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-3 min-h-10 text-sm text-slate-400">{template.description}</p>
              <div className="mt-4 grid gap-2 text-xs text-slate-400">
                <div>PDF: <span className="text-slate-200">{template.pdfName}</span></div>
                {template.source === "fillable-pdf" && (
                  <div>Source: <span className="text-slate-200">Fillable PDF import</span></div>
                )}
                <div>Approver: <span className="text-slate-200">{template.approver}</span></div>
                <div>Fields: <span className="text-slate-200">{template.fields.length}</span></div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => downloadSubmissionPdf(getSampleSubmission(template), template, state.settings)}
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
                  onClick={() => toggleTemplate(template.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  <RefreshCw size={14} />
                  {template.active ? "Deactivate" : "Activate"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="2xl:order-last">
        <TemplateEditorPanel
          key="new-template"
          settings={state.settings}
          template={null}
          onCancel={() => setEditingId("")}
          onSave={addTemplate}
        />
      </div>
    </div>
  );
}

function AdminFormsModule() {
  const [state, updateState] = useFormsStore();
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

      {view === "queue" && <ApprovalQueue state={state} updateState={updateState} />}
      {view === "templates" && <TemplateLibrary state={state} updateState={updateState} />}
      {view === "settings" && <SettingsPanel state={state} updateState={updateState} />}
    </Shell>
  );
}

export { AdminFormsModule };
export default StaffFormsModule;
