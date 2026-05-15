import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ClipboardList,
  Copy,
  Download,
  FileSignature,
  Link2,
  Mail,
  MessageSquareText,
  GripVertical,
  Plus,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import html2pdf from "html2pdf.js";
import warriorHeadNew from "../../assets/warrior-head-new.png";
import {
  deletePermissionRecipient,
  deletePermissionRosterStudent,
  fetchPermissionEvents,
  fetchPermissionRecipients,
  fetchPermissionRoster,
  fetchPermissionSubmissions,
  logPermissionAudit,
  replacePermissionRosterGrade,
  savePermissionEvent,
  savePermissionRecipients,
  savePermissionRosterStudent,
  savePermissionSubmission,
  sendPermissionParentCopyEmail,
  sendPermissionSigningRequestEmail,
  sendPermissionSigningRequestSms,
  uploadPermissionSignedPdf,
} from "../../lib/permissionSlipsData.js";

const STORE_KEY = "wvcs-permission-slips-v1";

const fieldTypes = [
  ["text", "Short Answer"],
  ["textarea", "Long Answer"],
  ["checkbox", "Checkbox"],
  ["choice", "Multiple Choice"],
];

const defaultParentIntro =
  "Dear Parent(s):\n\nA field trip has been planned for your student. Policy requires parental permission for students to attend field trips. If you grant your permission, please provide your e-signature on this form. Below is information about the field trip.";

const defaultMedicalRelease =
  "I grant permission for my student to participate in the above field trip. As a parent and/or guardian, I do herewith authorize the treatment of the following minor by a qualified and licensed physician in the event of a medical emergency which, in the opinion of the attending physician, may endanger his/her life, cause disfigurement, physical impairment or undue discomfort if delayed. This authority is granted only after a reasonable effort has been made to reach us.";

const sampleStudents = [
  {
    id: "stu-avery-martin",
    grade: "5",
    studentName: "Avery Martin",
    parents: [
      { id: "parent-jordan-martin", parentName: "Jordan Martin", parentPhone: "503-555-0198", parentEmail: "jordan@example.com" },
      { id: "parent-casey-martin", parentName: "Casey Martin", parentPhone: "503-555-0144", parentEmail: "casey@example.com" },
    ],
  },
  {
    id: "stu-ella-thompson",
    grade: "5",
    studentName: "Ella Thompson",
    parents: [
      { id: "parent-morgan-thompson", parentName: "Morgan Thompson", parentPhone: "503-555-0112", parentEmail: "morgan@example.com" },
    ],
  },
  {
    id: "stu-noah-ramirez",
    grade: "6",
    studentName: "Noah Ramirez",
    parents: [
      { id: "parent-daniela-ramirez", parentName: "Daniela Ramirez", parentPhone: "503-555-0177", parentEmail: "daniela@example.com" },
      { id: "parent-eli-ramirez", parentName: "Eli Ramirez", parentPhone: "503-555-0181", parentEmail: "eli@example.com" },
    ],
  },
  {
    id: "stu-mia-chen",
    grade: "7",
    studentName: "Mia Chen",
    parents: [
      { id: "parent-rachel-chen", parentName: "Rachel Chen", parentPhone: "503-555-0105", parentEmail: "rachel@example.com" },
    ],
  },
  {
    id: "stu-lucas-wilson",
    grade: "8",
    studentName: "Lucas Wilson",
    parents: [
      { id: "parent-taylor-wilson", parentName: "Taylor Wilson", parentPhone: "503-555-0133", parentEmail: "taylor@example.com" },
    ],
  },
];

const sampleEvent = {
  id: "perm-event-demo",
  title: "Oregon Garden Field Trip",
  destination: "The Oregon Garden",
  eventDate: "2026-05-29",
  parentIntro: defaultParentIntro,
  description:
    "Students will visit The Oregon Garden for a guided science extension. Students will depart from WVCS at 9:00 AM and return by 2:30 PM.",
  transportation: "WVCS bus",
  emergencyInstructions: "Bring a sack lunch, water bottle, and weather-appropriate jacket.",
  medicalRelease: defaultMedicalRelease,
  fields: [
    { id: "medical", label: "Medical notes or allergies", type: "textarea", required: false, options: [] },
    {
      id: "lunch",
      label: "Lunch plan",
      type: "choice",
      required: true,
      options: ["Student will bring lunch", "Student needs school lunch"],
    },
    { id: "photo", label: "I allow WVCS to include my student in field trip photos", type: "checkbox", required: false, options: [] },
  ],
  selectedGrades: ["5"],
  selectedStudentIds: ["stu-avery-martin", "stu-ella-thompson"],
  recipients: [
    {
      id: "recipient-demo",
      studentId: "stu-avery-martin",
      grade: "5",
      parentContactId: "parent-jordan-martin",
      studentName: "Avery Martin",
      parentName: "Jordan Martin",
      parentPhone: "503-555-0198",
      parentEmail: "jordan@example.com",
      token: "demo-signing-link",
      status: "Ready",
      sentAt: "",
      viewedAt: "",
      signedAt: "",
    },
  ],
  createdAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
  updatedAt: new Date(Date.now() - 1000 * 60 * 40).toISOString(),
};

const defaultState = {
  events: [sampleEvent],
  submissions: [],
  rosterStudents: sampleStudents,
};

function uid(prefix) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function findRosterStudentByName(rosterStudents, studentName) {
  return rosterStudents.find((student) => student.studentName.toLowerCase() === String(studentName || "").toLowerCase());
}

function normalizeEvent(event, rosterStudents = sampleStudents) {
  return {
    ...event,
    parentIntro: event.parentIntro || defaultParentIntro,
    medicalRelease: event.medicalRelease || defaultMedicalRelease,
    selectedGrades: event.selectedGrades || [],
    selectedStudentIds: event.selectedStudentIds || [],
    recipients: (event.recipients || []).map((recipient) => {
      const rosterStudent = recipient.studentId ? rosterStudents.find((student) => student.id === recipient.studentId) : findRosterStudentByName(rosterStudents, recipient.studentName);
      const rosterParent = rosterStudent?.parents.find(
        (parent) => parent.parentEmail === recipient.parentEmail || parent.parentName === recipient.parentName
      );
      return {
        ...recipient,
        studentId: recipient.studentId || rosterStudent?.id || "",
        grade: recipient.grade || rosterStudent?.grade || "",
        parentContactId: recipient.parentContactId || rosterParent?.id || "",
        emailedAt: recipient.emailedAt || "",
      };
    }),
  };
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return defaultState;
    const parsed = JSON.parse(saved);
    const rosterStudents = parsed.rosterStudents?.length ? parsed.rosterStudents : defaultState.rosterStudents;
    const events = parsed.events?.length ? parsed.events.map((event) => normalizeEvent(event, rosterStudents)) : defaultState.events;
    const submissions = (parsed.submissions || []).map((submission) => {
      if (submission.studentId) return submission;
      const event = events.find((item) => item.id === submission.eventId);
      const recipient = event?.recipients.find((item) => item.id === submission.recipientId || item.token === submission.token);
      return {
        ...submission,
        studentId: recipient?.studentId || submission.recipientId,
        grade: recipient?.grade || "",
        studentName: recipient?.studentName || submission.studentName || "",
        parentName: recipient?.parentName || submission.parentName || submission.signerName || "",
      };
    });
    return {
      events,
      submissions,
      rosterStudents,
    };
  } catch {
    return defaultState;
  }
}

function saveState(nextState) {
  localStorage.setItem(STORE_KEY, JSON.stringify(nextState));
}

function attachRecipientsToEvents(events, recipients) {
  return events.map((event) => ({
    ...event,
    recipients: recipients.filter((recipient) => recipient.eventId === event.id),
  }));
}

function createBlankEvent() {
  return {
    id: uid("perm-event"),
    title: "",
    destination: "",
    eventDate: today(),
    parentIntro: defaultParentIntro,
    description: "",
    transportation: "",
    emergencyInstructions: "",
    medicalRelease: defaultMedicalRelease,
    fields: [
      { id: uid("field"), label: "Emergency contact phone", type: "text", required: true, options: [] },
      { id: uid("field"), label: "Medical notes or allergies", type: "textarea", required: false, options: [] },
    ],
    selectedGrades: [],
    selectedStudentIds: [],
    recipients: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function createBlankRecipient() {
  return {
    id: uid("recipient"),
    studentId: "",
    grade: "",
    parentContactId: "",
    studentName: "",
    parentName: "",
    parentPhone: "",
    parentEmail: "",
    token: uid("sign"),
    status: "Ready",
    sentAt: "",
    viewedAt: "",
    signedAt: "",
  };
}

function createRecipientFromStudentParent(student, parent) {
  return {
    id: uid("recipient"),
    studentId: student.id,
    grade: student.grade,
    parentContactId: parent.id,
    studentName: student.studentName,
    parentName: parent.parentName,
    parentPhone: parent.parentPhone,
    parentEmail: parent.parentEmail,
    token: uid("sign"),
    status: "Ready",
    sentAt: "",
    emailedAt: "",
    viewedAt: "",
    signedAt: "",
  };
}

function parseDelimitedLine(line, delimiter) {
  const values = [];
  let current = "";
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];
    if (character === '"' && nextCharacter === '"') {
      current += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === delimiter && !inQuotes) {
      values.push(current.trim());
      current = "";
    } else {
      current += character;
    }
  }
  values.push(current.trim());
  return values;
}

function parseRosterCsv(csvText, grade) {
  const lines = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  const delimiter = lines[0].includes("\t") ? "\t" : ",";
  const headers = parseDelimitedLine(lines[0], delimiter).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => parseDelimitedLine(line, delimiter));

  return rows
    .map((row, rowIndex) => {
      const record = Object.fromEntries(headers.map((header, index) => [header, row[index] || ""]));
      const studentFirstName = record["Student-FN"]?.trim();
      const studentLastName = record["Student-LN"]?.trim();
      if (!studentFirstName && !studentLastName) return null;

      const studentName = [studentFirstName, studentLastName].filter(Boolean).join(" ");
      const studentId = `grade-${grade}-${studentName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || rowIndex}`;
      const parents = [
        {
          id: `${studentId}-parent-1`,
          parentName: [record["Parent-1-FN"], record["Parent-1-LN"]].filter(Boolean).join(" ").trim(),
          parentEmail: record["EMAIL-1"]?.trim() || "",
          parentPhone: record["Parent-1-#"]?.trim() || "",
        },
        {
          id: `${studentId}-parent-2`,
          parentName: [record["Parent-2-FN"], record["Parent-2-LN"]].filter(Boolean).join(" ").trim(),
          parentEmail: record["EMAIL-2"]?.trim() || "",
          parentPhone: record["Parent-2-#"]?.trim() || "",
        },
      ].filter((parent) => parent.parentName || parent.parentEmail || parent.parentPhone);

      return {
        id: studentId,
        grade,
        studentName,
        parents,
      };
    })
    .filter(Boolean);
}

function getSigningUrl(token) {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}#/permission-sign/${encodeURIComponent(token)}`;
}

function formatDate(value) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00`));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStudentKey(recipientOrSubmission) {
  return recipientOrSubmission.studentId || recipientOrSubmission.recipientId || recipientOrSubmission.id;
}

function getStudentSubmissions(submissions, eventId, studentId) {
  return submissions.filter((submission) => submission.eventId === eventId && getStudentKey(submission) === studentId);
}

function getPermissionEmail({ event, recipient }) {
  const url = getSigningUrl(recipient.token);
  const subject = `WVCS Permission Slip: ${event.title || "Field Trip"}`;
  const body = [
    `Dear ${recipient.parentName || "Parent/Guardian"},`,
    "",
    `Willamette Valley Christian School has a permission slip for ${recipient.studentName || "your student"} for ${event.title || "an upcoming field trip"}.`,
    "",
    `Please review and sign here: ${url}`,
    "",
    "Thank you,",
    "Willamette Valley Christian School",
  ].join("\n");
  return {
    subject,
    body,
    mailto: `mailto:${encodeURIComponent(recipient.parentEmail || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

function getSignedParentEmail({ event, recipient, submission }) {
  const subject = `Signed WVCS Permission Slip: ${event.title || "Field Trip"}`;
  const body = [
    `Dear ${recipient?.parentName || submission.signerName || "Parent/Guardian"},`,
    "",
    `Thank you for signing the WVCS permission slip for ${recipient?.studentName || submission.studentName || "your student"}.`,
    "",
    "A signed PDF copy has been recorded by Willamette Valley Christian School. In the live system, this email will be sent automatically with the signed PDF attached.",
    "",
    `Signed by: ${submission.signerName}`,
    `Signed on: ${new Date(submission.signedAt).toLocaleString()}`,
    "",
    "Willamette Valley Christian School",
    "9075 Pueblo Ave NE, Brooks, OR 97305",
    "TEL: 503-393-5236",
  ].join("\n");
  return {
    subject,
    body,
    mailto: `mailto:${encodeURIComponent(recipient?.parentEmail || "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

function buildSignedPermissionHtml({ event, recipient, submission }) {
  const answers = event.fields
    .map((field) => {
      const answer = field.type === "checkbox" ? (submission.answers?.[field.id] ? "Yes" : "No") : submission.answers?.[field.id] || "No response";
      return `
        <div class="pdf-response-row">
          <div class="pdf-response-label">${escapeHtml(field.label)}</div>
          <div class="pdf-response-answer">${escapeHtml(answer)}</div>
        </div>
      `;
    })
    .join("");
  const parentIntro = (event.parentIntro || defaultParentIntro)
    .split("\n")
    .filter((paragraph) => paragraph.trim())
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join("");

  return `
    <style>
      .pdf-document {
        box-sizing: border-box;
        position: relative;
        width: 7.75in;
        min-height: 10.25in;
        padding: 0.18in 0.22in;
        font-family: Arial, Helvetica, sans-serif;
        color: #0f172a;
        background: #ffffff;
        line-height: 1.42;
      }
      .pdf-watermark {
        position: fixed;
        left: 50%;
        top: 52%;
        width: 4.6in;
        opacity: 0.055;
        transform: translate(-50%, -50%);
        z-index: 0;
      }
      .pdf-content {
        position: relative;
        z-index: 1;
      }
      .pdf-header {
        display: grid;
        grid-template-columns: 0.78in 1fr;
        gap: 0.16in;
        align-items: center;
        padding-bottom: 0.14in;
        border-bottom: 2px solid #0f172a;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .pdf-logo {
        width: 0.64in;
        height: 0.64in;
        object-fit: contain;
      }
      .pdf-school {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        letter-spacing: 0;
      }
      .pdf-contact {
        margin-top: 3px;
        font-size: 9px;
        color: #475569;
        line-height: 1.3;
      }
      .pdf-title {
        margin: 0.18in 0 0.12in;
        font-size: 17px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0;
      }
      .pdf-meta {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 0.14in;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .pdf-meta-item {
        padding: 8px 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #f8fafc;
      }
      .pdf-kicker {
        font-size: 8px;
        font-weight: 700;
        color: #64748b;
        text-transform: uppercase;
      }
      .pdf-value {
        margin-top: 2px;
        font-size: 12px;
        font-weight: 700;
      }
      .pdf-section {
        margin-top: 0.14in;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .pdf-section h3 {
        margin: 0 0 6px;
        font-size: 13px;
        color: #0f172a;
      }
      .pdf-section p {
        margin: 0 0 8px;
        font-size: 11px;
      }
      .pdf-trip-box {
        padding: 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #f8fafc;
      }
      .pdf-response-row {
        margin: 7px 0;
        padding: 9px 10px;
        border: 1px solid #dbe3ec;
        border-radius: 6px;
        background: #ffffff;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .pdf-response-label {
        font-size: 10px;
        font-weight: 700;
      }
      .pdf-response-answer {
        margin-top: 3px;
        font-size: 11px;
        color: #334155;
      }
      .pdf-signature-box {
        display: grid;
        grid-template-columns: 2.5in 1fr;
        gap: 12px;
        align-items: center;
        padding: 10px;
        border: 1px solid #cbd5e1;
        border-radius: 6px;
        background: #ffffff;
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .pdf-signature {
        height: 0.82in;
        max-width: 2.35in;
        object-fit: contain;
        border-bottom: 1px solid #94a3b8;
      }
      .pdf-small {
        margin: 0;
        font-size: 8px;
        color: #64748b;
        line-height: 1.35;
        word-break: break-word;
      }
    </style>
    <div class="pdf-document">
      <img class="pdf-watermark" src="${warriorHeadNew}" alt="">
      <div class="pdf-content">
        <header class="pdf-header">
          <img class="pdf-logo" src="${warriorHeadNew}" alt="WVCS Warrior">
          <div>
            <h1 class="pdf-school">Willamette Valley Christian School</h1>
            <div class="pdf-contact">
              Willamette Valley Christian School<br>
              9075 Pueblo Ave NE, Brooks, OR 97305<br>
              TEL: 503-393-5236
            </div>
          </div>
        </header>

        <h2 class="pdf-title">Signed Permission Slip</h2>

        <section class="pdf-meta">
          <div class="pdf-meta-item"><div class="pdf-kicker">Field Trip</div><div class="pdf-value">${escapeHtml(event.title || "Untitled Permission Slip")}</div></div>
          <div class="pdf-meta-item"><div class="pdf-kicker">Date</div><div class="pdf-value">${escapeHtml(formatDate(event.eventDate))}</div></div>
          <div class="pdf-meta-item"><div class="pdf-kicker">Student</div><div class="pdf-value">${escapeHtml(recipient?.studentName || submission.studentName || "Student")}</div></div>
          <div class="pdf-meta-item"><div class="pdf-kicker">Parent/Guardian</div><div class="pdf-value">${escapeHtml(submission.signerName)}</div></div>
        </section>

        <section class="pdf-section">
          ${parentIntro}
        </section>

        <section class="pdf-section pdf-trip-box">
          <h3>Permission/medical release form</h3>
          <p>${escapeHtml(event.description || "Trip information has not been entered yet.")}</p>
          <p><strong>Destination:</strong> ${escapeHtml(event.destination || "Not specified")}</p>
          <p><strong>Transportation:</strong> ${escapeHtml(event.transportation || "Not specified")}</p>
          <p><strong>Notes:</strong> ${escapeHtml(event.emergencyInstructions || "None")}</p>
        </section>

        <section class="pdf-section">
          <p>${escapeHtml(event.medicalRelease || defaultMedicalRelease)}</p>
        </section>

        <section class="pdf-section">
          <h3>Parent/Guardian Responses</h3>
          ${answers}
        </section>

        <section class="pdf-section">
          <h3>Electronic Signature</h3>
          <div class="pdf-signature-box">
            <div>
              <img class="pdf-signature" src="${submission.signatureDataUrl}" alt="Parent signature">
              <p class="pdf-small">Electronic signature</p>
            </div>
            <p class="pdf-small">
              Signed by ${escapeHtml(submission.signerName)} on ${escapeHtml(new Date(submission.signedAt).toLocaleString())}<br>
              Electronic records consent: Yes
            </p>
          </div>
        </section>

        <section class="pdf-section">
          <h3>Audit Record</h3>
          <p class="pdf-small">
            Phone: ${escapeHtml(submission.audit?.parentPhone || "Not recorded")}<br>
            Timezone: ${escapeHtml(submission.audit?.timezone || "Not recorded")}<br>
            Device: ${escapeHtml(submission.audit?.userAgent || "Not recorded")}
          </p>
        </section>
      </div>
    </div>
  `;
}

function getSignedPermissionFilename({ event, recipient, submission }) {
  return `${(recipient?.studentName || submission.studentName || "permission-slip").replace(/[^a-z0-9]+/gi, "-")}-${(event.title || "signed").replace(/[^a-z0-9]+/gi, "-")}.pdf`;
}

function getSignedPdfOptions(filename) {
  return {
    margin: 0.3,
    filename,
    html2canvas: { scale: 2.4, useCORS: true },
    pagebreak: { mode: ["css", "legacy"], avoid: [".pdf-section", ".pdf-response-row", ".pdf-signature-box", ".pdf-meta"] },
    jsPDF: { unit: "in", format: "letter", orientation: "portrait" },
  };
}

async function createSignedPermissionPdfBlob({ event, recipient, submission }) {
  const element = document.createElement("div");
  element.innerHTML = buildSignedPermissionHtml({ event, recipient, submission });
  document.body.appendChild(element);
  try {
    const worker = html2pdf()
      .set(getSignedPdfOptions(getSignedPermissionFilename({ event, recipient, submission })))
      .from(element)
      .toPdf();
    const pdf = await worker.get("pdf");
    return pdf.output("blob");
  } finally {
    element.remove();
  }
}

async function downloadSignedPermissionPdf({ event, recipient, submission }) {
  const blob = await createSignedPermissionPdfBlob({ event, recipient, submission });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = getSignedPermissionFilename({ event, recipient, submission });
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function FieldRenderer({ field, value, onChange, disabled = false }) {
  if (field.type === "textarea") {
    return (
      <textarea
        value={value || ""}
        onChange={(event) => onChange(field.id, event.target.value)}
        disabled={disabled}
        rows={3}
        className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-500 disabled:bg-slate-100"
      />
    );
  }

  if (field.type === "checkbox") {
    return (
      <label className="mt-3 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(field.id, event.target.checked)}
          disabled={disabled}
          className="mt-1 h-4 w-4"
        />
        <span>{field.label}</span>
      </label>
    );
  }

  if (field.type === "choice") {
    return (
      <div className="mt-2 grid gap-2">
        {(field.options || []).filter(Boolean).map((option) => (
          <label key={option} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
            <input
              type="radio"
              name={field.id}
              checked={value === option}
              onChange={() => onChange(field.id, option)}
              disabled={disabled}
            />
            {option}
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      type="text"
      value={value || ""}
      onChange={(event) => onChange(field.id, event.target.value)}
      disabled={disabled}
      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-sky-500 disabled:bg-slate-100"
    />
  );
}

function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const initialValueRef = useRef(value);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 3;
    context.strokeStyle = "#0f172a";
    if (initialValueRef.current) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.src = initialValueRef.current;
    }
  }, []);

  function getPoint(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const touch = event.touches?.[0];
    const clientX = touch?.clientX ?? event.clientX;
    const clientY = touch?.clientY ?? event.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function startDrawing(event) {
    event.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(event);
  }

  function draw(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const nextPoint = getPoint(event);
    const previous = lastPointRef.current || nextPoint;
    context.beginPath();
    context.moveTo(previous.x, previous.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    lastPointRef.current = nextPoint;
    onChange(canvas.toDataURL("image/png"));
  }

  function stopDrawing() {
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={720}
        height={220}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={stopDrawing}
        className="mt-2 h-44 w-full touch-none rounded-lg border border-slate-300 bg-white"
      />
      <button
        type="button"
        onClick={clearSignature}
        className="mt-2 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
      >
        <RotateCcw size={15} />
        Clear
      </button>
    </div>
  );
}

function PermissionPreview({ event, recipient, submission }) {
  const answers = submission?.answers || {};
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 text-slate-950 shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
        <img src={warriorHeadNew} alt="WVCS Warrior" className="h-12 w-12 rounded-lg object-contain" />
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Willamette Valley Christian School</div>
          <h2 className="text-xl font-bold">Permission Slip</h2>
        </div>
      </div>
      <div className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Field Trip</div>
          <div className="font-semibold">{event.title || "Untitled Permission Slip"}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Date</div>
          <div className="font-semibold">{formatDate(event.eventDate)}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Student</div>
          <div className="font-semibold">{recipient?.studentName || "Student"}</div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase text-slate-500">Parent/Guardian</div>
          <div className="font-semibold">{recipient?.parentName || "Parent/Guardian"}</div>
        </div>
      </div>
      <div className="mt-5 space-y-3 text-sm leading-6">
        {(event.parentIntro || defaultParentIntro).split("\n").map((paragraph) => (
          <p key={paragraph || "blank"}>{paragraph}</p>
        ))}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 text-sm font-bold">Permission/medical release form:</div>
          <p>{event.description || "Trip information has not been entered yet."}</p>
        </div>
        <p><strong>Destination:</strong> {event.destination || "Not specified"}</p>
        <p><strong>Transportation:</strong> {event.transportation || "Not specified"}</p>
        <p><strong>Notes:</strong> {event.emergencyInstructions || "None"}</p>
        <p>{event.medicalRelease || defaultMedicalRelease}</p>
      </div>
      {submission && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">Signed Response</h3>
          <div className="mt-3 grid gap-3">
            {event.fields.map((field) => (
              <div key={field.id} className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="font-semibold">{field.label}</div>
                <div className="mt-1 text-slate-700">{field.type === "checkbox" ? (answers[field.id] ? "Yes" : "No") : answers[field.id] || "No response"}</div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm">
            <div className="font-semibold">Electronic signature</div>
            <img src={submission.signatureDataUrl} alt="Parent signature" className="mt-2 h-24 max-w-full rounded border border-slate-200 bg-white object-contain" />
            <div className="mt-2 text-xs text-slate-500">
              Signed by {submission.signerName} on {new Date(submission.signedAt).toLocaleString()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ParentPermissionSigningPage({ token }) {
  const [state, setState] = useState(loadState);
  const [syncStatus, setSyncStatus] = useState("Loading permission slip...");
  let match = null;
  for (const event of state.events) {
    const recipient = event.recipients.find((item) => item.token === token);
    if (recipient) {
      match = { event, recipient };
      break;
    }
  }
  const existingSubmission = state.submissions.find((submission) => submission.token === token);
  const otherParentSubmission = match
    ? state.submissions.find(
        (submission) =>
          submission.eventId === match.event.id &&
          submission.studentId === match.recipient.studentId &&
          submission.token !== token
      )
    : null;
  const [answers, setAnswers] = useState(existingSubmission?.answers || {});
  const [signerName, setSignerName] = useState(existingSubmission?.signerName || match?.recipient.parentName || "");
  const [signatureDataUrl, setSignatureDataUrl] = useState(existingSubmission?.signatureDataUrl || "");
  const [electronicConsent, setElectronicConsent] = useState(Boolean(existingSubmission?.electronicConsent));
  const [parentCopyRequested, setParentCopyRequested] = useState(Boolean(existingSubmission?.parentCopyRequested));
  const [error, setError] = useState("");
  const [submitStatus, setSubmitStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(Boolean(existingSubmission));

  useEffect(() => {
    let active = true;
    async function loadRemoteSigningData() {
      try {
        const [eventsResult, recipientsResult, submissionsResult] = await Promise.all([
          fetchPermissionEvents(),
          fetchPermissionRecipients(),
          fetchPermissionSubmissions(),
        ]);
        if (!active || !eventsResult.loaded || !recipientsResult.loaded || !submissionsResult.loaded) {
          setSyncStatus("");
          return;
        }
        const next = {
          ...loadState(),
          events: attachRecipientsToEvents(eventsResult.events, recipientsResult.recipients),
          submissions: submissionsResult.submissions,
        };
        saveState(next);
        setState(next);
        setSyncStatus("");
      } catch (remoteError) {
        if (active) setSyncStatus(`Using local signing data. ${remoteError.message}`);
      }
    }
    loadRemoteSigningData();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setState((current) => {
        let changed = false;
        const next = {
          ...current,
          events: current.events.map((event) => ({
            ...event,
            recipients: event.recipients.map((recipient) => {
              if (recipient.token !== token || recipient.viewedAt) return recipient;
              changed = true;
              return { ...recipient, status: "Viewed", viewedAt: new Date().toISOString() };
            }),
          })),
        };
        if (!changed) return current;
        saveState(next);
        return next;
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [token]);

  if (!match) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <ShieldCheck className="mx-auto text-slate-400" size={34} />
          <h1 className="mt-3 text-xl font-bold text-slate-950">Permission link unavailable</h1>
          <p className="mt-2 text-sm text-slate-600">This signing link could not be found on this device.</p>
        </div>
      </div>
    );
  }

  const { event, recipient } = match;
  const alreadySignedByThisParent = Boolean(existingSubmission);

  function updateAnswer(fieldId, value) {
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  }

  async function submitSignature() {
    if (isSubmitting) return;
    const missingField = event.fields.find((field) => {
      if (!field.required) return false;
      const value = answers[field.id];
      return field.type === "checkbox" ? !value : !String(value || "").trim();
    });
    if (missingField) {
      setError(`Please complete: ${missingField.label}`);
      return;
    }
    if (!electronicConsent) {
      setError("Please agree to use electronic records and an electronic signature.");
      return;
    }
    if (!signerName.trim()) {
      setError("Please type your full name.");
      return;
    }
    if (!signatureDataUrl) {
      setError("Please sign in the signature box.");
      return;
    }

    setError("");
    setIsSubmitting(true);
    setSubmitStatus("Creating signed PDF...");
    const signedAt = new Date().toISOString();
    let submission = {
      id: existingSubmission?.id || uid("permission-submission"),
      eventId: event.id,
      recipientId: recipient.id,
      studentId: recipient.studentId || recipient.id,
      grade: recipient.grade || "",
      studentName: recipient.studentName,
      parentName: recipient.parentName,
      parentEmail: recipient.parentEmail,
      token,
      answers,
      signerName: signerName.trim(),
      signatureDataUrl,
      electronicConsent: true,
      parentCopyRequested,
      signedAt,
      parentCopyEmailStatus: parentCopyRequested
        ? recipient.parentEmail ? "Requested" : "Requested, but no parent email on file"
        : "Not requested",
      parentCopyEmailPreparedAt: parentCopyRequested && recipient.parentEmail ? signedAt : "",
      audit: {
        signedAt,
        parentPhone: recipient.parentPhone,
        userAgent: navigator.userAgent,
        language: navigator.language,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    };

    try {
      const pdfBlob = await createSignedPermissionPdfBlob({ event, recipient, submission });
      setSubmitStatus("Uploading signed PDF...");
      const uploadResult = await uploadPermissionSignedPdf({
        submissionId: submission.id,
        filename: getSignedPermissionFilename({ event, recipient, submission }),
        blob: pdfBlob,
      });
      if (uploadResult.uploaded) {
        submission = {
          ...submission,
          signedPdf: {
            bucket: uploadResult.bucket,
            path: uploadResult.path,
            name: getSignedPermissionFilename({ event, recipient, submission }),
          },
        };
      }
    } catch (uploadError) {
      setError(`Signature saved, but signed PDF upload failed: ${uploadError.message}`);
    }

    setState((current) => {
      const submissions = current.submissions.some((item) => item.token === token)
        ? current.submissions.map((item) => (item.token === token ? submission : item))
        : [submission, ...current.submissions];
      const next = {
        ...current,
        submissions,
        events: current.events.map((item) =>
          item.id === event.id
            ? {
                ...item,
                recipients: item.recipients.map((entry) =>
                  entry.id === recipient.id ? { ...entry, status: "Signed", signedAt } : entry
                ),
              }
            : item
        ),
      };
      saveState(next);
      return next;
    });
    setSubmitStatus("Saving signature record...");
    try {
      await savePermissionSubmission(submission);
      await savePermissionRecipients(event.id, [{ ...recipient, status: "Signed", signedAt }]);
      await logPermissionAudit({
        eventId: event.id,
        recipientId: recipient.id,
        submissionId: submission.id,
        action: "permission_signed",
        actorLabel: signerName.trim(),
        details: { ...submission.audit, signedPdf: submission.signedPdf || null },
      });
      if (parentCopyRequested && submission.parentEmail && submission.signedPdf) {
        setSubmitStatus("Emailing parent copy...");
        try {
          const emailResult = await sendPermissionParentCopyEmail({ submissionId: submission.id });
          submission = {
            ...submission,
            parentCopyEmailStatus: emailResult.sent ? "Sent" : emailResult.reason || "Not sent",
            parentCopyEmailSentAt: emailResult.sentAt || "",
          };
          setState((current) => {
            const next = {
              ...current,
              submissions: current.submissions.map((item) => (item.id === submission.id ? submission : item)),
            };
            saveState(next);
            return next;
          });
        } catch (emailError) {
          setError(`Signed and saved, but parent email failed: ${emailError.message}`);
        }
      }
    } catch (remoteError) {
      setError(`Signed locally, but Supabase save failed: ${remoteError.message}`);
    }
    setSubmitted(true);
    setSubmitStatus("");
    setIsSubmitting(false);
  }

  async function downloadParentSignedPdf() {
    const submission = state.submissions.find((item) => item.token === token) || existingSubmission;
    if (!submission) return;
    await downloadSignedPermissionPdf({ event, recipient, submission });
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-5 text-slate-950">
      <div className="mx-auto max-w-3xl">
        {submitted ? (
          <div className="rounded-lg border border-emerald-200 bg-white p-6 text-center shadow-sm">
            <CheckCircle2 className="mx-auto text-emerald-600" size={42} />
            <h1 className="mt-3 text-2xl font-bold">Permission Slip Signed</h1>
            <p className="mt-2 text-sm text-slate-600">
              {alreadySignedByThisParent
                ? "This permission slip has already been signed by you."
                : `Thank you. WVCS has recorded your electronic signature for ${event.title}.`}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              A parent copy email is ready for the school email delivery step. Automatic sending will be enabled when the backend mail function is connected.
            </p>
            <button
              type="button"
              onClick={downloadParentSignedPdf}
              className="mt-4 inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-emerald-500"
            >
              <Download size={16} />
              Download Signed PDF
            </button>
          </div>
        ) : null}
        {syncStatus && (
          <div className="rounded-lg border border-slate-200 bg-white p-3 text-center text-xs font-semibold text-slate-500">
            {syncStatus}
          </div>
        )}

        {!submitted && otherParentSubmission && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
            This permission slip has already been signed by another parent/guardian for {recipient.studentName}. You may still sign it as well.
          </div>
        )}

        <div className="mt-4">
          <PermissionPreview event={event} recipient={recipient} />
        </div>

        {!submitted && (
          <section className="mt-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-bold">Parent/Guardian Response</h2>
            <div className="mt-4 grid gap-4">
              {event.fields.map((field) => (
                <div key={field.id}>
                  {field.type !== "checkbox" && (
                    <label className="text-sm font-semibold text-slate-800">
                      {field.label} {field.required && <span className="text-rose-600">*</span>}
                    </label>
                  )}
                  <FieldRenderer field={field} value={answers[field.id]} onChange={updateAnswer} />
                </div>
              ))}
            </div>
            <label className="mt-5 flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-slate-800">
              <input type="checkbox" checked={electronicConsent} onChange={(event) => setElectronicConsent(event.target.checked)} className="mt-1 h-4 w-4" />
              <span>
                I agree to use electronic records and an electronic signature for this WVCS permission slip, and I understand my signature indicates permission for my student to participate.
              </span>
            </label>
            <label className="mt-3 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800">
              <input type="checkbox" checked={parentCopyRequested} onChange={(event) => setParentCopyRequested(event.target.checked)} className="mt-1 h-4 w-4" />
              <span>Email me a copy of the signed permission slip after I submit this form.</span>
            </label>
            <div className="mt-5">
              <label className="text-sm font-semibold text-slate-800">Typed full name</label>
              <input
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
            </div>
            <div className="mt-5">
              <label className="text-sm font-semibold text-slate-800">Signature</label>
              <SignaturePad value={signatureDataUrl} onChange={setSignatureDataUrl} />
            </div>
            {submitStatus && <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm font-semibold text-sky-800">{submitStatus}</div>}
            {error && <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</div>}
            <button
              type="button"
              onClick={submitSignature}
              disabled={isSubmitting}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileSignature size={18} />
              {isSubmitting ? "Signing..." : "Sign and Submit"}
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

export default function PermissionSlipsModule({ currentUserEmail = "" }) {
  const [state, setState] = useState(loadState);
  const [activeWorkspace, setActiveWorkspace] = useState("slips");
  const [selectedEventId, setSelectedEventId] = useState(() => loadState().events[0]?.id || "");
  const [copiedToken, setCopiedToken] = useState("");
  const [expandedSubmissionIds, setExpandedSubmissionIds] = useState([]);
  const [rosterGrade, setRosterGrade] = useState("5");
  const [activeRosterGrade, setActiveRosterGrade] = useState("");
  const [rosterCsv, setRosterCsv] = useState("");
  const [rosterMessage, setRosterMessage] = useState("");
  const [isSendingCheckedStudents, setIsSendingCheckedStudents] = useState(false);
  const [sendingRecipientIds, setSendingRecipientIds] = useState([]);
  const [lastSendResult, setLastSendResult] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentStatusFilter, setStudentStatusFilter] = useState("all");
  const [draggedFieldId, setDraggedFieldId] = useState("");
  const [addedFieldId, setAddedFieldId] = useState("");
  const selectedEventIdRef = useRef(selectedEventId);
  const [syncStatus, setSyncStatus] = useState("Connecting to shared permission data...");
  const [manualRosterStudent, setManualRosterStudent] = useState({
    grade: "5",
    studentName: "",
    parent1Name: "",
    parent1Email: "",
    parent1Phone: "",
    parent2Name: "",
    parent2Email: "",
    parent2Phone: "",
  });
  const selectedEvent = state.events.find((event) => event.id === selectedEventId) || state.events[0];
  const submissionsForEvent = state.submissions.filter((submission) => submission.eventId === selectedEvent?.id);
  const rosterStudents = state.rosterStudents?.length ? state.rosterStudents : sampleStudents;
  const availableGrades = [...new Set(rosterStudents.map((student) => student.grade))].sort((a, b) => Number(a) - Number(b));
  const rosterStudentsByGrade = availableGrades.map((grade) => ({
    grade,
    students: rosterStudents
      .filter((student) => student.grade === grade)
      .sort((a, b) => a.studentName.localeCompare(b.studentName)),
  }));
  const selectedRosterGrade = activeRosterGrade && availableGrades.includes(activeRosterGrade)
    ? activeRosterGrade
    : availableGrades[0] || "";
  const activeRosterStudents = rosterStudents
    .filter((student) => student.grade === selectedRosterGrade)
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
  const selectedGrades = selectedEvent?.selectedGrades || [];
  const visibleStudents = selectedGrades.length
    ? rosterStudents.filter((student) => selectedGrades.includes(student.grade))
    : [];
  const filteredVisibleStudents = visibleStudents.filter((student) => {
    const search = studentSearch.trim().toLowerCase();
    const studentRecipients = selectedEvent?.recipients.filter((recipient) => (recipient.studentId || recipient.studentName) === student.id || recipient.studentName === student.studentName) || [];
    const studentSubmissions = getStudentSubmissions(submissionsForEvent, selectedEvent?.id, student.id);
    const viewed = studentRecipients.some((recipient) => recipient.viewedAt);
    const sent = studentRecipients.some((recipient) => ["Email Sent", "Viewed", "Signed"].includes(recipient.status));
    const signed = studentSubmissions.length > 0;

    if (search && !student.studentName.toLowerCase().includes(search)) return false;
    if (studentStatusFilter === "unsigned" && signed) return false;
    if (studentStatusFilter === "not-sent" && sent) return false;
    if (studentStatusFilter === "sent-not-viewed" && (!sent || viewed || signed)) return false;
    if (studentStatusFilter === "viewed-unsigned" && (!viewed || signed)) return false;
    if (studentStatusFilter === "signed" && !signed) return false;
    return true;
  });
  const selectedStudentIds = selectedEvent?.selectedStudentIds || [];
  const signedStudentIds = new Set(submissionsForEvent.map((submission) => getStudentKey(submission)));
  const signedCount = signedStudentIds.size;

  useEffect(() => {
    let active = true;
    async function loadSharedPermissionData() {
      try {
        const [rosterResult, eventsResult, recipientsResult, submissionsResult] = await Promise.all([
          fetchPermissionRoster(),
          fetchPermissionEvents(),
          fetchPermissionRecipients(),
          fetchPermissionSubmissions(),
        ]);

        if (!active) return;
        if (!rosterResult.loaded && !eventsResult.loaded && !recipientsResult.loaded && !submissionsResult.loaded) {
          setSyncStatus("Using local permission data until Supabase is configured.");
          return;
        }

        setState((current) => {
          const nextEvents = eventsResult.events?.length
            ? attachRecipientsToEvents(eventsResult.events, recipientsResult.recipients || [])
            : current.events;
          const next = {
            ...current,
            rosterStudents: rosterResult.rosterStudents?.length ? rosterResult.rosterStudents : current.rosterStudents,
            events: nextEvents,
            submissions: submissionsResult.submissions?.length ? submissionsResult.submissions : current.submissions,
          };
          saveState(next);
          if (next.events[0] && !next.events.some((event) => event.id === selectedEventIdRef.current)) {
            selectedEventIdRef.current = next.events[0].id;
            setSelectedEventId(next.events[0].id);
          }
          return next;
        });
        setSyncStatus("Shared permission data connected.");
      } catch (error) {
        if (active) setSyncStatus(`Using local permission data. Supabase sync failed: ${error.message}`);
      }
    }
    loadSharedPermissionData();
    return () => {
      active = false;
    };
  }, []);

  function persist(updater) {
    setState((current) => {
      const next = updater(current);
      saveState(next);
      return next;
    });
  }

  function updateEvent(patch) {
    const nextEvent = { ...selectedEvent, ...patch, updatedAt: new Date().toISOString() };
    persist((current) => ({
      ...current,
      events: current.events.map((event) =>
        event.id === selectedEvent.id ? nextEvent : event
      ),
    }));
    savePermissionEvent(nextEvent, currentUserEmail).catch((error) => setSyncStatus(`Saved locally. Supabase event save failed: ${error.message}`));
  }

  function addEvent() {
    const event = createBlankEvent();
    persist((current) => ({ ...current, events: [event, ...current.events] }));
    setSelectedEventId(event.id);
    savePermissionEvent(event, currentUserEmail).catch((error) => setSyncStatus(`Created locally. Supabase event save failed: ${error.message}`));
  }

  function addField() {
    const field = { id: uid("field"), label: "New question", type: "text", required: false, options: [] };
    updateEvent({
      fields: [...selectedEvent.fields, field],
    });
    setAddedFieldId(field.id);
    window.setTimeout(() => setAddedFieldId((current) => (current === field.id ? "" : current)), 1400);
  }

  function updateField(fieldId, patch) {
    updateEvent({
      fields: selectedEvent.fields.map((field) => (field.id === fieldId ? { ...field, ...patch } : field)),
    });
  }

  function moveField(fieldId, targetFieldId) {
    if (!fieldId || !targetFieldId || fieldId === targetFieldId) return;
    const fields = [...selectedEvent.fields];
    const fromIndex = fields.findIndex((field) => field.id === fieldId);
    const toIndex = fields.findIndex((field) => field.id === targetFieldId);
    if (fromIndex < 0 || toIndex < 0) return;
    const [movedField] = fields.splice(fromIndex, 1);
    fields.splice(toIndex, 0, movedField);
    updateEvent({ fields });
  }

  function updateChoiceOption(field, optionIndex, value) {
    const options = [...(field.options || [])];
    options[optionIndex] = value;
    updateField(field.id, { options });
  }

  function addChoiceOption(field) {
    updateField(field.id, { options: [...(field.options || []), ""] });
  }

  function removeChoiceOption(field, optionIndex) {
    updateField(field.id, { options: (field.options || []).filter((_, index) => index !== optionIndex) });
  }

  function deleteField(fieldId) {
    const field = selectedEvent.fields.find((item) => item.id === fieldId);
    if (!window.confirm(`Delete the field "${field?.label || "this field"}"? This cannot be undone.`)) return;
    updateEvent({ fields: selectedEvent.fields.filter((field) => field.id !== fieldId) });
  }

  function addRecipient() {
    updateEvent({ recipients: [...selectedEvent.recipients, createBlankRecipient()] });
  }

  function toggleGrade(grade) {
    const grades = selectedGrades.includes(grade)
      ? selectedGrades.filter((item) => item !== grade)
      : [...selectedGrades, grade];
    const visibleIds = rosterStudents.filter((student) => grades.includes(student.grade)).map((student) => student.id);
    updateEvent({
      selectedGrades: grades,
      selectedStudentIds: selectedStudentIds.filter((studentId) => visibleIds.includes(studentId)),
    });
  }

  function toggleStudent(studentId) {
    updateEvent({
      selectedStudentIds: selectedStudentIds.includes(studentId)
        ? selectedStudentIds.filter((id) => id !== studentId)
        : [...selectedStudentIds, studentId],
    });
  }

  function setAllVisibleStudents(checked) {
    const visibleIds = filteredVisibleStudents.map((student) => student.id);
    updateEvent({
      selectedStudentIds: checked
        ? [...new Set([...selectedStudentIds, ...visibleIds])]
        : selectedStudentIds.filter((studentId) => !visibleIds.includes(studentId)),
    });
  }

  function prepareSelectedRecipients() {
    const selectedStudents = rosterStudents.filter((student) => selectedStudentIds.includes(student.id));
    const existingKeys = new Set(
      selectedEvent.recipients.map((recipient) => `${recipient.studentId || recipient.studentName}:${recipient.parentContactId || recipient.parentEmail || recipient.parentName}`)
    );
    const nextRecipients = [...selectedEvent.recipients];
    selectedStudents.forEach((student) => {
      student.parents.forEach((parent) => {
        const key = `${student.id}:${parent.id}`;
        if (!existingKeys.has(key)) {
          nextRecipients.push(createRecipientFromStudentParent(student, parent));
        }
      });
    });
    updateEvent({ recipients: nextRecipients });
    savePermissionRecipients(selectedEvent.id, nextRecipients).catch((error) =>
      setSyncStatus(`Prepared locally. Supabase recipient save failed: ${error.message}`)
    );
  }

  function importRosterCsv() {
    const grade = rosterGrade.trim();
    if (!grade) {
      setRosterMessage("Enter a grade before importing.");
      return;
    }
    const importedStudents = parseRosterCsv(rosterCsv, grade);
    if (!importedStudents.length) {
      setRosterMessage("No students were found. Check the CSV header and rows.");
      return;
    }
    persist((current) => ({
      ...current,
      rosterStudents: [
        ...(current.rosterStudents || []).filter((student) => student.grade !== grade),
        ...importedStudents,
      ].sort((a, b) => Number(a.grade) - Number(b.grade) || a.studentName.localeCompare(b.studentName)),
    }));
    replacePermissionRosterGrade(grade, importedStudents).catch((error) =>
      setRosterMessage(`Imported locally. Supabase roster save failed: ${error.message}`)
    );
    setActiveRosterGrade(grade);
    setRosterMessage(`Imported ${importedStudents.length} student${importedStudents.length === 1 ? "" : "s"} for grade ${grade}.`);
  }

  function updateRosterStudent(studentId, patch) {
    const existingStudent = rosterStudents.find((student) => student.id === studentId);
    const nextStudent = existingStudent ? { ...existingStudent, ...patch } : null;
    persist((current) => ({
      ...current,
      rosterStudents: (current.rosterStudents || []).map((student) =>
        student.id === studentId ? { ...student, ...patch } : student
      ),
    }));
    if (nextStudent) {
      savePermissionRosterStudent(nextStudent).catch((error) =>
        setRosterMessage(`Saved locally. Supabase roster save failed: ${error.message}`)
      );
    }
  }

  function updateRosterParent(studentId, parentIndex, patch) {
    let nextStudent = null;
    persist((current) => ({
      ...current,
      rosterStudents: (current.rosterStudents || []).map((student) => {
        if (student.id !== studentId) return student;
        const parents = [...student.parents];
        const existingParent = parents[parentIndex] || {
          id: `${student.id}-parent-${parentIndex + 1}`,
          parentName: "",
          parentEmail: "",
          parentPhone: "",
        };
        parents[parentIndex] = { ...existingParent, ...patch };
        nextStudent = {
          ...student,
          parents: parents.filter((parent) => parent.parentName || parent.parentEmail || parent.parentPhone),
        };
        return nextStudent;
      }),
    }));
    if (nextStudent) {
      savePermissionRosterStudent(nextStudent).catch((error) =>
        setRosterMessage(`Saved locally. Supabase parent save failed: ${error.message}`)
      );
    }
  }

  function deleteRosterStudent(studentId) {
    const student = rosterStudents.find((item) => item.id === studentId);
    if (!window.confirm(`Delete ${student?.studentName || "this student"} from the roster? This cannot be undone.`)) return;
    persist((current) => ({
      ...current,
      rosterStudents: (current.rosterStudents || []).filter((student) => student.id !== studentId),
      events: current.events.map((event) => ({
        ...event,
        selectedStudentIds: (event.selectedStudentIds || []).filter((id) => id !== studentId),
      })),
    }));
    deletePermissionRosterStudent(studentId).catch((error) =>
      setRosterMessage(`Deleted locally. Supabase roster delete failed: ${error.message}`)
    );
  }

  function addManualRosterStudent() {
    const grade = manualRosterStudent.grade.trim();
    const studentName = manualRosterStudent.studentName.trim();
    if (!grade || !studentName) {
      setRosterMessage("Enter a grade and student name before adding manually.");
      return;
    }
    const studentId = `grade-${grade}-${studentName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || crypto.randomUUID()}`;
    const parents = [
      {
        id: `${studentId}-parent-1`,
        parentName: manualRosterStudent.parent1Name.trim(),
        parentEmail: manualRosterStudent.parent1Email.trim(),
        parentPhone: manualRosterStudent.parent1Phone.trim(),
      },
      {
        id: `${studentId}-parent-2`,
        parentName: manualRosterStudent.parent2Name.trim(),
        parentEmail: manualRosterStudent.parent2Email.trim(),
        parentPhone: manualRosterStudent.parent2Phone.trim(),
      },
    ].filter((parent) => parent.parentName || parent.parentEmail || parent.parentPhone);

    const newStudent = { id: studentId, grade, studentName, parents };
    persist((current) => ({
      ...current,
      rosterStudents: [
        ...(current.rosterStudents || []).filter((student) => student.id !== studentId),
        newStudent,
      ].sort((a, b) => Number(a.grade) - Number(b.grade) || a.studentName.localeCompare(b.studentName)),
    }));
    savePermissionRosterStudent(newStudent).catch((error) =>
      setRosterMessage(`Added locally. Supabase roster save failed: ${error.message}`)
    );
    setActiveRosterGrade(grade);
    setManualRosterStudent({
      grade,
      studentName: "",
      parent1Name: "",
      parent1Email: "",
      parent1Phone: "",
      parent2Name: "",
      parent2Email: "",
      parent2Phone: "",
    });
    setRosterMessage(`Added ${studentName} to grade ${grade}.`);
  }

  function handleRosterFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRosterCsv(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function sendToCheckedStudents() {
    if (isSendingCheckedStudents) return;
    const selectedStudents = rosterStudents.filter((student) => selectedStudentIds.includes(student.id));
    if (!selectedStudents.length) {
      setSyncStatus("Select at least one student before sending.");
      return;
    }
    setIsSendingCheckedStudents(true);
    const existingKeys = new Set(
      selectedEvent.recipients.map((recipient) => `${recipient.studentId || recipient.studentName}:${recipient.parentContactId || recipient.parentEmail || recipient.parentName}`)
    );
    const now = new Date().toISOString();
    const nextRecipients = [...selectedEvent.recipients];
    const emailRecipientsToSend = [];
    const smsRecipientsToSend = [];
    selectedStudents.forEach((student) => {
      student.parents.forEach((parent) => {
        const key = `${student.id}:${parent.id}`;
        const existingIndex = nextRecipients.findIndex((recipient) => `${recipient.studentId || recipient.studentName}:${recipient.parentContactId || recipient.parentEmail || recipient.parentName}` === key);
        if (existingIndex >= 0) {
          nextRecipients[existingIndex] = {
            ...nextRecipients[existingIndex],
            status: parent.parentEmail && parent.parentPhone ? "Email + SMS Queued" : parent.parentEmail ? "Email Queued" : "SMS Queued",
            sentAt: now,
            emailedAt: parent.parentEmail ? now : nextRecipients[existingIndex].emailedAt || "",
            smsStatus: parent.parentPhone ? "Queued" : nextRecipients[existingIndex].smsStatus || "",
            smsQueuedAt: parent.parentPhone ? now : nextRecipients[existingIndex].smsQueuedAt || "",
          };
          if (parent.parentEmail) emailRecipientsToSend.push(nextRecipients[existingIndex]);
          if (parent.parentPhone) smsRecipientsToSend.push(nextRecipients[existingIndex]);
        } else if (!existingKeys.has(key)) {
          const newRecipient = {
            ...createRecipientFromStudentParent(student, parent),
            status: parent.parentEmail && parent.parentPhone ? "Email + SMS Queued" : parent.parentEmail ? "Email Queued" : "SMS Queued",
            sentAt: now,
            emailedAt: parent.parentEmail ? now : "",
            smsStatus: parent.parentPhone ? "Queued" : "",
            smsQueuedAt: parent.parentPhone ? now : "",
          };
          nextRecipients.push(newRecipient);
          if (parent.parentEmail) emailRecipientsToSend.push(newRecipient);
          if (parent.parentPhone) smsRecipientsToSend.push(newRecipient);
        }
      });
    });
    updateEvent({ recipients: nextRecipients });
    if (!emailRecipientsToSend.length && !smsRecipientsToSend.length) {
      setSyncStatus("No checked students have parent email addresses or phone numbers.");
      updateEvent({ recipients: nextRecipients, selectedStudentIds: [] });
      setIsSendingCheckedStudents(false);
      return;
    }
    try {
      setSyncStatus(`Sending permission links to ${emailRecipientsToSend.length + smsRecipientsToSend.length} parent contact${emailRecipientsToSend.length + smsRecipientsToSend.length === 1 ? "" : "s"}...`);
      setLastSendResult(null);
      await savePermissionRecipients(selectedEvent.id, nextRecipients);
      const signingBaseUrl = `${window.location.origin}${window.location.pathname}`;
      const [emailResult, smsResult] = await Promise.all([
        emailRecipientsToSend.length
          ? sendPermissionSigningRequestEmail({
              eventId: selectedEvent.id,
              recipientIds: emailRecipientsToSend.map((recipient) => recipient.id),
              signingBaseUrl,
            })
          : Promise.resolve({ messages: [], skipped: [], failed: [] }),
        smsRecipientsToSend.length
          ? sendPermissionSigningRequestSms({
              eventId: selectedEvent.id,
              recipientIds: smsRecipientsToSend.map((recipient) => recipient.id),
              signingBaseUrl,
            })
          : Promise.resolve({ messages: [], skipped: [], failed: [], smsEnabled: false }),
      ]);
      const sentIds = new Set((emailResult.messages || []).map((message) => message.recipientId));
      const sentAtById = Object.fromEntries((emailResult.messages || []).map((message) => [message.recipientId, message.sentAt]));
      const smsIds = new Set((smsResult.messages || []).map((message) => message.recipientId));
      const smsAtById = Object.fromEntries((smsResult.messages || []).map((message) => [message.recipientId, message.sentAt]));
      const updatedRecipients = nextRecipients.map((recipient) =>
        sentIds.has(recipient.id)
          ? {
              ...recipient,
              status: smsIds.has(recipient.id) ? "Email + SMS Sent" : "Email Sent",
              deliveryChannel: smsIds.has(recipient.id) ? "email+sms" : "email",
              sentAt: sentAtById[recipient.id] || smsAtById[recipient.id] || now,
              emailedAt: sentAtById[recipient.id] || now,
              smsStatus: smsIds.has(recipient.id) ? (smsResult.smsEnabled ? "Sent" : "Previewed") : recipient.smsStatus || "",
              smsSentAt: smsResult.smsEnabled && smsIds.has(recipient.id) ? smsAtById[recipient.id] || now : recipient.smsSentAt || "",
              smsQueuedAt: !smsResult.smsEnabled && smsIds.has(recipient.id) ? smsAtById[recipient.id] || now : recipient.smsQueuedAt || "",
            }
          : smsIds.has(recipient.id)
            ? {
                ...recipient,
                status: smsResult.smsEnabled ? "SMS Sent" : "SMS Previewed",
                deliveryChannel: "sms",
                sentAt: smsAtById[recipient.id] || now,
                smsStatus: smsResult.smsEnabled ? "Sent" : "Previewed",
                smsSentAt: smsResult.smsEnabled ? smsAtById[recipient.id] || now : recipient.smsSentAt || "",
                smsQueuedAt: !smsResult.smsEnabled ? smsAtById[recipient.id] || now : recipient.smsQueuedAt || "",
              }
            : recipient
      );
      persist((current) => ({
        ...current,
        events: current.events.map((event) =>
          event.id === selectedEvent.id ? { ...event, recipients: updatedRecipients, selectedStudentIds: [] } : event
        ),
      }));
      setLastSendResult({
        sent: [...(emailResult.messages || []), ...(smsResult.messages || [])],
        skipped: [...(emailResult.skipped || []), ...(smsResult.skipped || [])],
        failed: [...(emailResult.failed || []), ...(smsResult.failed || [])],
        sentAt: new Date().toISOString(),
      });
      const skippedCount = (emailResult.skipped?.length || 0) + (smsResult.skipped?.length || 0);
      const failedCount = (emailResult.failed?.length || 0) + (smsResult.failed?.length || 0);
      const smsLabel = smsResult.messages?.length ? (smsResult.smsEnabled ? "SMS sent" : "SMS previewed") : "no SMS";
      setSyncStatus(`Email sent: ${emailResult.messages?.length || 0}; ${smsLabel}: ${smsResult.messages?.length || 0}${skippedCount ? `; ${skippedCount} skipped` : ""}${failedCount ? `; ${failedCount} failed` : ""}.`);
    } catch (error) {
      updateEvent({ recipients: nextRecipients, selectedStudentIds: [] });
      setLastSendResult({
        sent: [],
        skipped: [],
        failed: [...emailRecipientsToSend, ...smsRecipientsToSend].map((recipient) => ({
          recipientId: recipient.id,
          recipientEmail: recipient.parentEmail,
          parentPhone: recipient.parentPhone,
          studentName: recipient.studentName,
          reason: error.message,
        })),
        sentAt: new Date().toISOString(),
      });
      setSyncStatus(`Queued locally, but sending failed: ${error.message}`);
    } finally {
      setIsSendingCheckedStudents(false);
    }
  }

  async function resendPermissionEmail(recipient) {
    if (!recipient.parentEmail || sendingRecipientIds.includes(recipient.id)) return;
    setSendingRecipientIds((current) => [...current, recipient.id]);
    try {
      await savePermissionRecipients(selectedEvent.id, [recipient]);
      const result = await sendPermissionSigningRequestEmail({
        eventId: selectedEvent.id,
        recipientIds: [recipient.id],
        signingBaseUrl: `${window.location.origin}${window.location.pathname}`,
      });
      const message = result.messages?.[0];
      if (message) {
        updateRecipient(recipient.id, {
          status: "Email Sent",
          deliveryChannel: "email",
          sentAt: message.sentAt || new Date().toISOString(),
          emailedAt: message.sentAt || new Date().toISOString(),
        });
        setSyncStatus(`Resent permission email to ${recipient.parentEmail}.`);
      } else {
        setSyncStatus(result.skipped?.[0]?.reason || `No email sent to ${recipient.parentEmail}.`);
      }
    } catch (error) {
      setSyncStatus(`Resend failed for ${recipient.parentEmail}: ${error.message}`);
    } finally {
      setSendingRecipientIds((current) => current.filter((id) => id !== recipient.id));
    }
  }

  async function sendPermissionSms(recipient) {
    if (!recipient.parentPhone || sendingRecipientIds.includes(recipient.id)) return;
    setSendingRecipientIds((current) => [...current, recipient.id]);
    try {
      await savePermissionRecipients(selectedEvent.id, [recipient]);
      const result = await sendPermissionSigningRequestSms({
        eventId: selectedEvent.id,
        recipientIds: [recipient.id],
        signingBaseUrl: `${window.location.origin}${window.location.pathname}`,
      });
      const message = result.messages?.[0];
      if (message) {
        updateRecipient(recipient.id, {
          status: result.smsEnabled ? "SMS Sent" : "SMS Previewed",
          deliveryChannel: recipient.deliveryChannel === "email" ? "email+sms" : "sms",
          sentAt: message.sentAt || new Date().toISOString(),
          smsStatus: result.smsEnabled ? "Sent" : "Previewed",
          smsQueuedAt: result.smsEnabled ? recipient.smsQueuedAt || "" : message.sentAt || new Date().toISOString(),
          smsSentAt: result.smsEnabled ? message.sentAt || new Date().toISOString() : recipient.smsSentAt || "",
          smsError: "",
          twilioMessageSid: message.twilioMessageSid || "",
        });
        setSyncStatus(result.smsEnabled ? `Sent permission SMS to ${recipient.parentPhone}.` : `SMS preview recorded for ${recipient.parentPhone}. Twilio sending is disabled until A2P is approved.`);
      } else {
        setSyncStatus(result.skipped?.[0]?.reason || `No SMS prepared for ${recipient.parentPhone}.`);
      }
    } catch (error) {
      updateRecipient(recipient.id, { smsStatus: "Failed", smsError: error.message });
      setSyncStatus(`SMS failed for ${recipient.parentPhone}: ${error.message}`);
    } finally {
      setSendingRecipientIds((current) => current.filter((id) => id !== recipient.id));
    }
  }

  function updateRecipient(recipientId, patch) {
    const nextRecipient = selectedEvent.recipients.find((recipient) => recipient.id === recipientId);
    const updatedRecipient = nextRecipient ? { ...nextRecipient, ...patch } : null;
    updateEvent({
      recipients: selectedEvent.recipients.map((recipient) => (recipient.id === recipientId ? { ...recipient, ...patch } : recipient)),
    });
    if (updatedRecipient) {
      savePermissionRecipients(selectedEvent.id, [updatedRecipient]).catch((error) =>
        setSyncStatus(`Saved locally. Supabase recipient save failed: ${error.message}`)
      );
    }
  }

  function deleteRecipient(recipientId) {
    const recipient = selectedEvent.recipients.find((item) => item.id === recipientId);
    const label = [recipient?.studentName, recipient?.parentName].filter(Boolean).join(" / ") || "this parent signing link";
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
    updateEvent({ recipients: selectedEvent.recipients.filter((recipient) => recipient.id !== recipientId) });
    deletePermissionRecipient(recipientId).catch((error) =>
      setSyncStatus(`Deleted locally. Supabase recipient delete failed: ${error.message}`)
    );
  }

  function markSmsReady(recipientId) {
    updateRecipient(recipientId, { status: "Link Created", sentAt: new Date().toISOString() });
  }

  async function copyLink(recipient) {
    const url = getSigningUrl(recipient.token);
    await navigator.clipboard.writeText(url);
    setCopiedToken(recipient.token);
    markSmsReady(recipient.id);
    window.setTimeout(() => setCopiedToken(""), 1800);
  }

  function openEmail(recipient) {
    markSmsReady(recipient.id);
    window.location.href = getPermissionEmail({ event: selectedEvent, recipient }).mailto;
  }

  async function downloadSignedPdf(submission) {
    const recipient = selectedEvent.recipients.find((item) => item.id === submission.recipientId);
    await downloadSignedPermissionPdf({ event: selectedEvent, recipient, submission });
  }

  function toggleSubmissionPreview(submissionId) {
    setExpandedSubmissionIds((current) =>
      current.includes(submissionId)
        ? current.filter((id) => id !== submissionId)
        : [...current, submissionId]
    );
  }

  function openSignedParentEmail(submission) {
    const recipient = selectedEvent.recipients.find((item) => item.id === submission.recipientId);
    if (!recipient?.parentEmail) return;
    const updatedSubmission = {
      ...submission,
      parentCopyEmailStatus: "Sending...",
      parentCopyEmailPreparedAt: new Date().toISOString(),
    };
    persist((current) => ({
      ...current,
      submissions: current.submissions.map((item) =>
        item.id === submission.id ? updatedSubmission : item
      ),
    }));
    savePermissionSubmission(updatedSubmission)
      .then(() => sendPermissionParentCopyEmail({ submissionId: submission.id }))
      .then((result) => {
        const sentSubmission = {
          ...updatedSubmission,
          parentCopyEmailStatus: result.sent ? "Sent" : result.reason || "Not sent",
          parentCopyEmailSentAt: result.sentAt || "",
        };
        persist((current) => ({
          ...current,
          submissions: current.submissions.map((item) => (item.id === submission.id ? sentSubmission : item)),
        }));
      })
      .catch((error) => {
        window.location.href = getSignedParentEmail({ event: selectedEvent, recipient, submission }).mailto;
        setSyncStatus(`Automatic parent email failed, opened a draft instead: ${error.message}`);
      });
  }

  if (!selectedEvent) {
    return (
      <section className="min-h-[680px] bg-slate-950 px-5 py-6 text-slate-100">
        <button type="button" onClick={addEvent} className="rounded-lg bg-sky-500 px-4 py-3 text-sm font-bold text-white">
          Create Permission Slip
        </button>
      </section>
    );
  }

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">Permission Slips</div>
            <h1 className="mt-2 text-3xl font-bold text-white">Mobile Parent Signatures</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Build a field trip permission slip, generate parent signing links, and capture electronic signatures with an audit record.
            </p>
          </div>
          <button
            type="button"
            onClick={addEvent}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-400"
          >
            <Plus size={18} />
            New Slip
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["slips", "Permission Slips", FileSignature],
            ["rosters", "Student Rosters", Users],
          ].map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveWorkspace(id)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold transition ${
                activeWorkspace === id
                  ? "border-sky-400 bg-sky-500 text-white"
                  : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
              }`}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
        </div>
        {syncStatus && (
          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-400">
            {syncStatus}
          </div>
        )}

        {activeWorkspace === "rosters" && (
          <div className="mt-6 rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex items-center gap-2 text-lg font-bold text-white">
                  <Users size={18} />
                  Grade Rosters
                </div>
                <p className="mt-1 max-w-3xl text-sm text-slate-400">
                  Import, add, and edit student/parent roster records here. Permission slip creation and sending stay in the Permission Slips workspace.
                </p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-400">
                {rosterStudents.length} roster student{rosterStudents.length === 1 ? "" : "s"} loaded
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[130px_minmax(0,1fr)_190px] lg:items-end">
              <label className="text-sm font-semibold text-slate-300">
                Grade
                <input
                  value={rosterGrade}
                  onChange={(event) => setRosterGrade(event.target.value)}
                  placeholder="5"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400"
                />
              </label>
              <label className="text-sm font-semibold text-slate-300">
                CSV file
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={handleRosterFile}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300 file:mr-3 file:rounded-md file:border-0 file:bg-sky-500 file:px-3 file:py-1.5 file:text-sm file:font-bold file:text-white"
                />
              </label>
              <button
                type="button"
                onClick={importRosterCsv}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-400"
              >
                <Save size={16} />
                Import Grade Roster
              </button>
            </div>

            <div className="mt-3 rounded-lg border border-slate-800 bg-slate-950 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Required CSV Header</div>
              <div className="mt-2 overflow-x-auto whitespace-nowrap font-mono text-xs text-slate-300">
                Student-FN, Student-LN, Parent-1-FN, Parent-1-LN, EMAIL-1, Parent-1-#, Parent-2-FN, Parent-2-LN, Parent-2-#, EMAIL-2
              </div>
            </div>

            <label className="mt-3 block text-sm font-semibold text-slate-300">
              Paste CSV
              <textarea
                rows={5}
                value={rosterCsv}
                onChange={(event) => setRosterCsv(event.target.value)}
                placeholder="Student-FN,Student-LN,Parent-1-FN,Parent-1-LN,EMAIL-1,Parent-1-#,Parent-2-FN,Parent-2-LN,Parent-2-#,EMAIL-2"
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-xs text-white outline-none focus:border-sky-400"
              />
            </label>

            {rosterMessage && (
              <div className="mt-3 rounded-lg border border-sky-400/30 bg-sky-500/10 p-3 text-sm font-semibold text-sky-100">
                {rosterMessage}
              </div>
            )}

            <div className="mt-5 rounded-lg border border-slate-800 bg-slate-950 p-4">
              <div className="mb-3 text-sm font-bold text-white">Manual Student Entry</div>
              <div className="grid gap-3 lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_150px]">
                <input
                  value={manualRosterStudent.grade}
                  onChange={(event) => setManualRosterStudent((current) => ({ ...current, grade: event.target.value }))}
                  placeholder="Grade"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
                <input
                  value={manualRosterStudent.studentName}
                  onChange={(event) => setManualRosterStudent((current) => ({ ...current, studentName: event.target.value }))}
                  placeholder="Student name"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
                <input
                  value={manualRosterStudent.parent1Name}
                  onChange={(event) => setManualRosterStudent((current) => ({ ...current, parent1Name: event.target.value }))}
                  placeholder="Parent 1 name"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
                <input
                  value={manualRosterStudent.parent1Email}
                  onChange={(event) => setManualRosterStudent((current) => ({ ...current, parent1Email: event.target.value }))}
                  placeholder="Parent 1 email"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
                <input
                  value={manualRosterStudent.parent1Phone}
                  onChange={(event) => setManualRosterStudent((current) => ({ ...current, parent1Phone: event.target.value }))}
                  placeholder="Parent 1 phone"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
                <div className="hidden lg:block" />
                <div className="hidden lg:block" />
                <input
                  value={manualRosterStudent.parent2Name}
                  onChange={(event) => setManualRosterStudent((current) => ({ ...current, parent2Name: event.target.value }))}
                  placeholder="Parent 2 name"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
                <input
                  value={manualRosterStudent.parent2Email}
                  onChange={(event) => setManualRosterStudent((current) => ({ ...current, parent2Email: event.target.value }))}
                  placeholder="Parent 2 email"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
                <input
                  value={manualRosterStudent.parent2Phone}
                  onChange={(event) => setManualRosterStudent((current) => ({ ...current, parent2Phone: event.target.value }))}
                  placeholder="Parent 2 phone"
                  className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
              </div>
              <button
                type="button"
                onClick={addManualRosterStudent}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-bold text-emerald-100 transition hover:bg-emerald-500/20"
              >
                <Plus size={16} />
                Add Student to Roster
              </button>
            </div>

            <div className="mt-5">
              {rosterStudentsByGrade.length ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    {rosterStudentsByGrade.map(({ grade, students }) => (
                      <button
                        key={grade}
                        type="button"
                        onClick={() => setActiveRosterGrade(grade)}
                        className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition ${
                          selectedRosterGrade === grade
                            ? "border-sky-400 bg-sky-500 text-white"
                            : "border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800"
                        }`}
                      >
                        Grade {grade}
                        <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px]">{students.length}</span>
                      </button>
                    ))}
                  </div>

                  <div className="mt-3 overflow-hidden rounded-lg border border-slate-800">
                    <div className="flex items-center justify-between bg-slate-950 px-3 py-2">
                      <div className="text-sm font-bold text-white">Grade {selectedRosterGrade}</div>
                      <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                        {activeRosterStudents.length} student{activeRosterStudents.length === 1 ? "" : "s"}
                      </div>
                    </div>
                    <div className="grid grid-cols-[64px_minmax(150px,0.9fr)_minmax(180px,1.1fr)_minmax(180px,1.1fr)_40px] gap-2 border-t border-slate-800 bg-slate-950 px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500">
                      <div>Grade</div>
                      <div>Student</div>
                      <div>Parent 1</div>
                      <div>Parent 2</div>
                      <div />
                    </div>
                    {activeRosterStudents.map((student) => {
                      const parent1 = student.parents[0] || {};
                      const parent2 = student.parents[1] || {};
                      const compactInputClass = "rounded-md border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white outline-none focus:border-sky-400";
                      return (
                        <div key={student.id} className="grid grid-cols-[64px_minmax(150px,0.9fr)_minmax(180px,1.1fr)_minmax(180px,1.1fr)_40px] gap-2 border-t border-slate-800 bg-slate-950 px-2 py-2">
                          <input
                            value={student.grade}
                            onChange={(event) => updateRosterStudent(student.id, { grade: event.target.value })}
                            className={compactInputClass}
                          />
                          <input
                            value={student.studentName}
                            onChange={(event) => updateRosterStudent(student.id, { studentName: event.target.value })}
                            className={compactInputClass}
                          />
                          <div className="grid gap-1">
                            <input
                              value={parent1.parentName || ""}
                              onChange={(event) => updateRosterParent(student.id, 0, { parentName: event.target.value })}
                              placeholder="Name"
                              className={compactInputClass}
                            />
                            <input
                              value={parent1.parentEmail || ""}
                              onChange={(event) => updateRosterParent(student.id, 0, { parentEmail: event.target.value })}
                              placeholder="Email"
                              className={compactInputClass}
                            />
                            <input
                              value={parent1.parentPhone || ""}
                              onChange={(event) => updateRosterParent(student.id, 0, { parentPhone: event.target.value })}
                              placeholder="Phone"
                              className={compactInputClass}
                            />
                          </div>
                          <div className="grid gap-1">
                            <input
                              value={parent2.parentName || ""}
                              onChange={(event) => updateRosterParent(student.id, 1, { parentName: event.target.value })}
                              placeholder="Name"
                              className={compactInputClass}
                            />
                            <input
                              value={parent2.parentEmail || ""}
                              onChange={(event) => updateRosterParent(student.id, 1, { parentEmail: event.target.value })}
                              placeholder="Email"
                              className={compactInputClass}
                            />
                            <input
                              value={parent2.parentPhone || ""}
                              onChange={(event) => updateRosterParent(student.id, 1, { parentPhone: event.target.value })}
                              placeholder="Phone"
                              className={compactInputClass}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteRosterStudent(student.id)}
                            className="flex h-8 items-center justify-center rounded-md border border-rose-500/40 bg-rose-500/10 text-rose-100"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">
                  No roster students yet. Import a CSV or add a student manually.
                </div>
              )}
            </div>
          </div>
        )}

        {activeWorkspace === "slips" && (
        <div className="mt-6 grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-lg border border-slate-800 bg-slate-900 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-white">
              <ClipboardList size={17} />
              Field Trips
            </div>
            <div className="grid gap-2">
              {state.events.map((event) => {
                const isSelected = event.id === selectedEvent.id;
                const eventSigned = new Set(state.submissions.filter((submission) => submission.eventId === event.id).map((submission) => getStudentKey(submission))).size;
                const eventStudentCount = event.selectedStudentIds?.length || event.recipients.length;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedEventId(event.id)}
                    className={`rounded-lg border p-3 text-left transition ${
                      isSelected ? "border-sky-400 bg-sky-500/15" : "border-slate-800 bg-slate-950 hover:border-slate-600"
                    }`}
                  >
                    <div className="font-semibold text-white">{event.title || "Untitled slip"}</div>
                    <div className="mt-1 text-xs text-slate-400">{formatDate(event.eventDate)}</div>
                    <div className="mt-2 text-xs font-semibold text-sky-200">{eventSigned}/{eventStudentCount} students signed</div>
                  </button>
                );
              })}
            </div>
          </aside>

          <div className="grid gap-4">
            <div className="grid gap-4 lg:grid-cols-4">
              {[
                ["Recipients", selectedEvent.recipients.length],
                ["Signed Students", signedCount],
                ["Viewed", selectedEvent.recipients.filter((recipient) => recipient.viewedAt).length],
                ["Audit Records", submissionsForEvent.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
                  <div className="mt-2 text-2xl font-bold text-white">{value}</div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
                <Save size={18} />
                Slip Details
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <label className="text-sm font-semibold text-slate-300">
                  Field trip title
                  <input value={selectedEvent.title} onChange={(event) => updateEvent({ title: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400" />
                </label>
                <label className="text-sm font-semibold text-slate-300">
                  Event date
                  <input type="date" value={selectedEvent.eventDate} onChange={(event) => updateEvent({ eventDate: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400" />
                </label>
                <label className="text-sm font-semibold text-slate-300">
                  Destination
                  <input value={selectedEvent.destination} onChange={(event) => updateEvent({ destination: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400" />
                </label>
                <label className="text-sm font-semibold text-slate-300">
                  Transportation
                  <input value={selectedEvent.transportation} onChange={(event) => updateEvent({ transportation: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400" />
                </label>
                <label className="text-sm font-semibold text-slate-300 lg:col-span-2">
                  Parent intro
                  <textarea rows={5} value={selectedEvent.parentIntro || defaultParentIntro} onChange={(event) => updateEvent({ parentIntro: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400" />
                </label>
                <label className="text-sm font-semibold text-slate-300 lg:col-span-2">
                  Trip information
                  <textarea rows={3} value={selectedEvent.description} onChange={(event) => updateEvent({ description: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400" />
                </label>
                <label className="text-sm font-semibold text-slate-300 lg:col-span-2">
                  Emergency instructions / notes
                  <textarea rows={2} value={selectedEvent.emergencyInstructions} onChange={(event) => updateEvent({ emergencyInstructions: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400" />
                </label>
                <label className="text-sm font-semibold text-slate-300 lg:col-span-2">
                  Permission / medical release text
                  <textarea rows={5} value={selectedEvent.medicalRelease || defaultMedicalRelease} onChange={(event) => updateEvent({ medicalRelease: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-sky-400" />
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-lg font-bold text-white">
                  <FileSignature size={18} />
                  Fillable Fields
                </div>
                <button type="button" onClick={addField} className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition active:scale-[0.98] ${addedFieldId ? "border-emerald-400 bg-emerald-500 text-white shadow-lg shadow-emerald-950/40" : "border-slate-700 bg-slate-950 text-slate-100 hover:border-sky-400 hover:bg-slate-900"}`}>
                  <Plus size={16} />
                  {addedFieldId ? "Field Added" : "Add Field"}
                </button>
              </div>
              <div className="grid gap-3">
                {selectedEvent.fields.map((field, fieldIndex) => (
                  <div
                    key={field.id}
                    draggable
                    onDragStart={() => setDraggedFieldId(field.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      moveField(draggedFieldId, field.id);
                      setDraggedFieldId("");
                    }}
                    onDragEnd={() => setDraggedFieldId("")}
                    className={`rounded-lg border bg-slate-950 p-3 transition ${draggedFieldId === field.id ? "border-sky-400 opacity-70" : addedFieldId === field.id ? "border-emerald-400 shadow-lg shadow-emerald-950/40" : "border-slate-800"}`}
                  >
                    <div className="grid gap-3 lg:grid-cols-[34px_minmax(0,1fr)_180px_120px_44px] lg:items-end">
                      <div className="flex h-10 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-500" title="Drag to reorder">
                        <GripVertical size={16} />
                      </div>
                      <label className="text-sm font-semibold text-slate-300">
                        Label <span className="text-xs font-normal text-slate-500">#{fieldIndex + 1}</span>
                        <input value={field.label} onChange={(event) => updateField(field.id, { label: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-sky-400" />
                      </label>
                      <label className="text-sm font-semibold text-slate-300">
                        Type
                        <select value={field.type} onChange={(event) => updateField(field.id, { type: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-sky-400">
                          {fieldTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-300">
                        <input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} />
                        Required
                      </label>
                      <button type="button" onClick={() => deleteField(field.id)} className="flex h-10 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-100">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {field.type === "choice" && (
                      <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <div className="text-sm font-semibold text-slate-300">Choices</div>
                          <button type="button" onClick={() => addChoiceOption(field)} className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-sky-400">
                            <Plus size={13} />
                            Add Choice
                          </button>
                        </div>
                        <div className="grid gap-2">
                          {(field.options?.length ? field.options : [""]).map((option, optionIndex) => (
                            <div key={`${field.id}-option-${optionIndex}`} className="grid gap-2 sm:grid-cols-[1fr_40px]">
                              <input
                                value={option}
                                onChange={(event) => updateChoiceOption(field, optionIndex, event.target.value)}
                                placeholder={`Choice ${optionIndex + 1}`}
                                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                              />
                              <button type="button" onClick={() => removeChoiceOption(field, optionIndex)} className="flex h-10 items-center justify-center rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-100 transition hover:bg-rose-500/20">
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-lg font-bold text-white">
                    <Users size={18} />
                    Grade and Student Selection
                  </div>
                  <p className="mt-1 text-sm text-slate-400">
                    Choose grades, check students, then send the current permission slip to all checked students with one action.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={prepareSelectedRecipients}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
                  >
                    <Link2 size={16} />
                    Build Links Only
                  </button>
                  <button
                    type="button"
                    onClick={sendToCheckedStudents}
                    disabled={isSendingCheckedStudents || !selectedStudentIds.length}
                    className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send size={16} className={isSendingCheckedStudents ? "animate-pulse" : ""} />
                    {isSendingCheckedStudents ? "Sending..." : `Send to Checked Students${selectedStudentIds.length ? ` (${selectedStudentIds.length})` : ""}`}
                  </button>
                </div>
              </div>

              {lastSendResult && (
                <div className="mb-4 rounded-lg border border-slate-800 bg-slate-950 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="font-bold text-white">Last Send</div>
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-100">
                      {lastSendResult.sent.length} sent or previewed
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-100">
                      {lastSendResult.skipped.length} skipped
                    </span>
                    <span className="rounded-full bg-rose-500/15 px-2.5 py-1 text-xs font-bold text-rose-100">
                      {lastSendResult.failed.length} failed
                    </span>
                    <span className="text-xs text-slate-500">{new Date(lastSendResult.sentAt).toLocaleString()}</span>
                  </div>
                  {(lastSendResult.skipped.length > 0 || lastSendResult.failed.length > 0) && (
                    <div className="mt-3 grid gap-2">
                      {[...lastSendResult.skipped, ...lastSendResult.failed].map((item) => {
                        const recipient = selectedEvent.recipients.find((entry) => entry.id === item.recipientId);
                        return (
                          <div key={`${item.recipientId}-${item.reason}`} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-xs text-slate-300">
                            <span className="font-bold text-white">{recipient?.studentName || item.studentName || "Student"}</span>
                            <span>{item.recipientEmail || recipient?.parentEmail || item.parentPhone || recipient?.parentPhone || "No email or phone"}</span>
                            <span className="text-slate-500">{item.reason}</span>
                            {recipient && (
                              <button type="button" onClick={() => copyLink(recipient)} className="ml-auto rounded-md border border-slate-700 px-2 py-1 font-bold text-slate-100">
                                Copy Link
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {availableGrades.map((grade) => (
                  <label
                    key={grade}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${
                      selectedGrades.includes(grade)
                        ? "border-sky-400 bg-sky-500/20 text-sky-100"
                        : "border-slate-700 bg-slate-950 text-slate-300"
                    }`}
                  >
                    <input type="checkbox" checked={selectedGrades.includes(grade)} onChange={() => toggleGrade(grade)} />
                    Grade {grade}
                  </label>
                ))}
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
                <input
                  value={studentSearch}
                  onChange={(event) => setStudentSearch(event.target.value)}
                  placeholder="Search students"
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                />
                <select
                  value={studentStatusFilter}
                  onChange={(event) => setStudentStatusFilter(event.target.value)}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
                >
                  <option value="all">All students</option>
                  <option value="not-sent">Not sent</option>
                  <option value="sent-not-viewed">Sent, not viewed</option>
                  <option value="viewed-unsigned">Viewed, unsigned</option>
                  <option value="unsigned">Unsigned</option>
                  <option value="signed">Signed</option>
                </select>
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-800">
                <div className="grid grid-cols-[44px_90px_minmax(0,1fr)_160px_150px] gap-3 bg-slate-950 px-3 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                  <label className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={filteredVisibleStudents.length > 0 && filteredVisibleStudents.every((student) => selectedStudentIds.includes(student.id))}
                      onChange={(event) => setAllVisibleStudents(event.target.checked)}
                    />
                  </label>
                  <div>Grade</div>
                  <div>Student</div>
                  <div>Status</div>
                  <div>Signed PDFs</div>
                </div>
                {filteredVisibleStudents.length ? (
                  filteredVisibleStudents.map((student) => {
                    const studentSubmissions = getStudentSubmissions(submissionsForEvent, selectedEvent.id, student.id);
                    const studentRecipients = selectedEvent.recipients.filter((recipient) => recipient.studentId === student.id || recipient.studentName === student.studentName);
                    const signedParents = studentSubmissions.length;
                    const sentParents = studentRecipients.filter((recipient) =>
                      ["Email Sent", "Email + SMS Sent", "SMS Sent", "SMS Previewed", "Viewed", "Signed"].includes(recipient.status)
                    ).length;
                    const viewedParents = studentRecipients.filter((recipient) => recipient.viewedAt).length;
                    const isSigned = studentSubmissions.length > 0;
                    const statusLabel = isSigned
                      ? `${signedParents} parent${signedParents === 1 ? "" : "s"} signed`
                      : viewedParents
                        ? "Viewed, unsigned"
                        : sentParents
                          ? "Sent, not viewed"
                          : "Not sent";
                    return (
                      <div
                        key={student.id}
                        className={`grid grid-cols-[44px_90px_minmax(0,1fr)_160px_150px] gap-3 border-t border-slate-800 px-3 py-3 text-sm ${
                          isSigned ? "bg-emerald-500/10" : "bg-rose-500/10"
                        }`}
                      >
                        <label className="flex items-center justify-center">
                          <input type="checkbox" checked={selectedStudentIds.includes(student.id)} onChange={() => toggleStudent(student.id)} />
                        </label>
                        <div className="font-semibold text-slate-200">Grade {student.grade}</div>
                        <div>
                          <div className="font-bold text-white">{student.studentName}</div>
                          <div className="mt-1 text-xs text-slate-400">{student.parents.length} parent contact{student.parents.length === 1 ? "" : "s"}</div>
                        </div>
                        <div>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${
                              isSigned ? "bg-emerald-500 text-white" : sentParents ? "bg-amber-500 text-white" : "bg-rose-500 text-white"
                            }`}
                          >
                            {statusLabel}
                          </span>
                          <div className="mt-1 text-xs text-slate-400">
                            Sent {sentParents}/{student.parents.length} · Viewed {viewedParents}/{student.parents.length}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {studentSubmissions.length ? (
                            studentSubmissions.map((submission, index) => (
                              <button
                                key={submission.id}
                                type="button"
                                onClick={() => downloadSignedPdf(submission)}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/50 bg-emerald-500/15 px-2 py-1 text-xs font-bold text-emerald-100"
                              >
                                <Download size={13} />
                                PDF {index + 1}
                              </button>
                            ))
                          ) : (
                            <span className="text-xs text-slate-500">None</span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="border-t border-slate-800 bg-slate-950 p-5 text-sm text-slate-400">
                    {visibleStudents.length ? "No students match the current search/filter." : "Select one or more grades to show students."}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-lg font-bold text-white">
                    <MessageSquareText size={18} />
                    Parent SMS and Email Links
                  </div>
                  <p className="mt-1 text-sm text-slate-400">Send email links now and preview SMS delivery while Twilio A2P approval is pending.</p>
                </div>
                <button type="button" onClick={addRecipient} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-semibold text-slate-100">
                  <Plus size={16} />
                  Add Manual Recipient
                </button>
              </div>
              <div className="grid gap-3">
                {selectedEvent.recipients.map((recipient) => (
                  <div key={recipient.id} className="rounded-lg border border-slate-800 bg-slate-950 p-3">
                    <div className="grid gap-3 lg:grid-cols-[90px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                      <input placeholder="Grade" value={recipient.grade || ""} onChange={(event) => updateRecipient(recipient.id, { grade: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" />
                      <input placeholder="Student name" value={recipient.studentName} onChange={(event) => updateRecipient(recipient.id, { studentName: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" />
                      <input placeholder="Parent name" value={recipient.parentName} onChange={(event) => updateRecipient(recipient.id, { parentName: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" />
                      <input placeholder="Parent phone" value={recipient.parentPhone} onChange={(event) => updateRecipient(recipient.id, { parentPhone: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" />
                      <input placeholder="Parent email" value={recipient.parentEmail} onChange={(event) => updateRecipient(recipient.id, { parentEmail: event.target.value })} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" onClick={() => copyLink(recipient)} className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-sky-400">
                        <Copy size={15} />
                        {copiedToken === recipient.token ? "Copied" : "Copy Signing Link"}
                      </button>
                      <a href={getSigningUrl(recipient.token)} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-200">
                        <Link2 size={15} />
                        Open
                      </a>
                      <button type="button" onClick={() => openEmail(recipient)} className="inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm font-semibold text-blue-100">
                        <Mail size={15} />
                        Email Draft
                      </button>
                      <button
                        type="button"
                        onClick={() => resendPermissionEmail(recipient)}
                        disabled={!recipient.parentEmail || sendingRecipientIds.includes(recipient.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm font-semibold text-sky-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send size={15} className={sendingRecipientIds.includes(recipient.id) ? "animate-pulse" : ""} />
                        {sendingRecipientIds.includes(recipient.id) ? "Sending..." : "Resend Email"}
                      </button>
                      <button
                        type="button"
                        onClick={() => sendPermissionSms(recipient)}
                        disabled={!recipient.parentPhone || sendingRecipientIds.includes(recipient.id)}
                        className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Send size={15} className={sendingRecipientIds.includes(recipient.id) ? "animate-pulse" : ""} />
                        {sendingRecipientIds.includes(recipient.id) ? "Preparing..." : "Preview SMS"}
                      </button>
                      <button type="button" onClick={() => deleteRecipient(recipient.id)} className="ml-auto inline-flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-100">
                        <Trash2 size={15} />
                        Remove
                      </button>
                      <span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-bold text-slate-300">{recipient.status}</span>
                      {recipient.smsStatus && (
                        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-100">
                          SMS {recipient.smsStatus}
                        </span>
                      )}
                      {recipient.smsError && (
                        <span className="rounded-full border border-rose-500/30 bg-rose-500/10 px-2.5 py-1 text-xs font-bold text-rose-100">
                          SMS Error
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <div className="mb-4 flex items-center gap-2 text-lg font-bold text-white">
                <ShieldCheck size={18} />
                Signed Submissions
              </div>
              {submissionsForEvent.length ? (
                <div className="grid gap-4">
                  {submissionsForEvent.map((submission) => {
                    const recipient = selectedEvent.recipients.find((item) => item.id === submission.recipientId);
                    const isExpanded = expandedSubmissionIds.includes(submission.id);
                    return (
                      <div key={submission.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                        <div>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="text-lg font-bold text-white">{recipient?.studentName || "Student"}</div>
                              <div className="mt-1 text-sm text-slate-400">Signed by {submission.signerName} on {new Date(submission.signedAt).toLocaleString()}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleSubmissionPreview(submission.id)}
                              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-bold text-slate-100 transition hover:bg-slate-800"
                            >
                              <FileSignature size={15} />
                              {isExpanded ? "Hide Preview" : "View Preview"}
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => downloadSignedPdf(submission)}
                            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-white transition hover:bg-emerald-400"
                          >
                            <Download size={15} />
                            Download Signed PDF
                          </button>
                          <button
                            type="button"
                            onClick={() => openSignedParentEmail(submission)}
                            disabled={!recipient?.parentEmail}
                            className="mt-3 ml-2 inline-flex items-center gap-2 rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 text-sm font-bold text-blue-100 transition hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Mail size={15} />
                            Email Parent Copy
                          </button>
                          <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3 text-xs leading-5 text-slate-300">
                            <div><strong>Phone:</strong> {submission.audit.parentPhone || "Not recorded"}</div>
                            <div><strong>Parent copy email:</strong> {submission.parentCopyEmailStatus || "Ready to send"}</div>
                            <div><strong>Timezone:</strong> {submission.audit.timezone}</div>
                            <div><strong>Device:</strong> {submission.audit.userAgent}</div>
                            <div><strong>Prepared by:</strong> {currentUserEmail || "WVCS staff"}</div>
                          </div>
                        </div>
                        {isExpanded && (
                          <div className="mt-4">
                            <PermissionPreview event={selectedEvent} recipient={recipient} submission={submission} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-sm text-slate-400">
                  No signed submissions yet. Open or copy a parent signing link to test the mobile flow.
                </div>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
    </section>
  );
}
