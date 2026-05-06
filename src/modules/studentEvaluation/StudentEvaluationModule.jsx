import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  RefreshCw,
  Send,
  UserRoundCheck,
} from "lucide-react";

const CORS_PROXY = "https://comments.javajireh.org/";
const STUDENT_FETCH_URL =
  "https://script.google.com/macros/s/AKfycbx3cin8FE2bnGTt7L4lc_nAjI8_MHTsO7h6HhWbqtiCn-BPTH0avHLHjMbiIlDvoaJV/exec";
const SUBMIT_DATA_URL =
  "https://script.google.com/macros/s/AKfycbyXpsGjiDzqSGtnwDFXC4ROKG1lMN03DFJiOTZmMYoRTZwSxnZXFv6ZIfnoNobNFN26eA/exec";
const RECENT_STORE_KEY = "wvcs-student-evaluation-recent-v1";

const ratingFields = [
  {
    id: "academics",
    label: "Academics",
    description: "Classwork, assessment readiness, and academic follow-through.",
  },
  {
    id: "integration",
    label: "Integration",
    description: "Connection with peers, routines, and classroom expectations.",
  },
  {
    id: "behavior",
    label: "Behavior",
    description: "Respect, self-control, redirection, and school citizenship.",
  },
  {
    id: "attendance",
    label: "Attendance",
    description: "Presence, punctuality, and participation consistency.",
  },
];

const defaultRatings = ratingFields.reduce((ratings, field) => {
  ratings[field.id] = 5;
  return ratings;
}, {});

function getScoreTone(score) {
  if (score <= 3) return "text-rose-300";
  if (score <= 5) return "text-amber-300";
  if (score <= 7) return "text-lime-300";
  return "text-emerald-300";
}

function loadRecentSubmissions() {
  try {
    const saved = localStorage.getItem(RECENT_STORE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveRecentSubmissions(submissions) {
  localStorage.setItem(RECENT_STORE_KEY, JSON.stringify(submissions.slice(0, 8)));
}

function RatingSlider({ field, value, onChange }) {
  return (
    <label className="block rounded-lg border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-white">{field.label}</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">{field.description}</div>
        </div>
        <div className={`rounded-lg border border-slate-700 bg-slate-900 px-3 py-1 text-lg font-black ${getScoreTone(value)}`}>
          {value}
        </div>
      </div>
      <input
        type="range"
        min="1"
        max="10"
        value={value}
        onChange={(event) => onChange(field.id, Number(event.target.value))}
        className="mt-4 h-2 w-full cursor-pointer accent-sky-400"
      />
      <div className="mt-2 flex justify-between text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
        <span>Not meeting</span>
        <span>Meets</span>
        <span>Exceeds</span>
      </div>
    </label>
  );
}

function RecentSubmission({ submission }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-white">{submission.student}</div>
          <div className="mt-1 text-xs text-slate-500">{submission.email}</div>
        </div>
        <div className="text-xs font-semibold text-slate-400">
          {new Date(submission.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
        {ratingFields.map((field) => (
          <div key={field.id} className="rounded-md border border-slate-800 bg-slate-900 px-2 py-1">
            <div className="text-slate-500">{field.label.slice(0, 3)}</div>
            <div className={`text-sm font-bold ${getScoreTone(submission[field.id])}`}>{submission[field.id]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudentEvaluationModule() {
  const [teacherEmail, setTeacherEmail] = useState("");
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState("");
  const [manualStudent, setManualStudent] = useState("");
  const [ratings, setRatings] = useState(defaultRatings);
  const [feedback, setFeedback] = useState("");
  const [isLoadingStudents, setIsLoadingStudents] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentError, setStudentError] = useState("");
  const [submitMessage, setSubmitMessage] = useState(null);
  const [recentSubmissions, setRecentSubmissions] = useState(loadRecentSubmissions);

  const studentName = useMemo(
    () => (selectedStudent === "__manual" ? manualStudent.trim() : selectedStudent),
    [manualStudent, selectedStudent]
  );

  async function fetchStudents() {
    setIsLoadingStudents(true);
    setStudentError("");
    try {
      const response = await fetch(`${CORS_PROXY}${STUDENT_FETCH_URL}`);
      if (!response.ok) throw new Error(`Student list returned ${response.status}`);
      const text = await response.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error("Student list was not in the expected format.");
      setStudents(data.filter(Boolean));
    } catch (error) {
      setStudentError(error.message || "Unable to load probation students.");
      setStudents([]);
    } finally {
      setIsLoadingStudents(false);
    }
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(fetchStudents, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function updateRating(fieldId, value) {
    setRatings((current) => ({ ...current, [fieldId]: value }));
  }

  function resetForm() {
    setSelectedStudent("");
    setManualStudent("");
    setRatings(defaultRatings);
    setFeedback("");
  }

  async function submitEvaluation(event) {
    event.preventDefault();
    setSubmitMessage(null);

    if (!teacherEmail.trim() || !teacherEmail.includes("@")) {
      setSubmitMessage({ type: "error", text: "Enter the teacher email before submitting." });
      return;
    }

    if (!studentName) {
      setSubmitMessage({ type: "error", text: "Select or enter the student being evaluated." });
      return;
    }

    if (!feedback.trim()) {
      setSubmitMessage({ type: "error", text: "Teacher feedback is required." });
      return;
    }

    const payload = {
      email: teacherEmail.trim(),
      student: studentName,
      academics: ratings.academics,
      integration: ratings.integration,
      behavior: ratings.behavior,
      attendance: ratings.attendance,
      feedback: feedback.trim(),
    };

    setIsSubmitting(true);
    try {
      const response = await fetch(`${CORS_PROXY}${SUBMIT_DATA_URL}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.text();
      if (!response.ok) throw new Error(result || `Submission returned ${response.status}`);

      const nextRecent = [{ ...payload, submittedAt: new Date().toISOString() }, ...recentSubmissions].slice(0, 8);
      setRecentSubmissions(nextRecent);
      saveRecentSubmissions(nextRecent);
      setSubmitMessage({ type: "success", text: result || "Evaluation submitted successfully." });
      resetForm();
    } catch (error) {
      setSubmitMessage({ type: "error", text: error.message || "Unable to submit the evaluation." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">
              <UserRoundCheck size={14} />
              6 Week Probation
            </div>
            <h1 className="mt-3 text-3xl font-bold text-white">Student Evaluation</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Submit a teacher evaluation for new students currently being reviewed during the probation window.
            </p>
          </div>

          <button
            type="button"
            onClick={fetchStudents}
            disabled={isLoadingStudents}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoadingStudents ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Refresh Student List
          </button>
        </div>

        <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
          <form onSubmit={submitEvaluation} className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Teacher email</span>
                <input
                  type="email"
                  value={teacherEmail}
                  onChange={(event) => setTeacherEmail(event.target.value)}
                  placeholder="teacher@wvcs.org"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                />
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-200">Student</span>
                <select
                  value={selectedStudent}
                  onChange={(event) => setSelectedStudent(event.target.value)}
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition focus:border-cyan-400"
                >
                  <option value="">Select a probation student</option>
                  {students.map((student) => (
                    <option key={student} value={student}>
                      {student}
                    </option>
                  ))}
                  <option value="__manual">Enter student manually</option>
                </select>
              </label>
            </div>

            {selectedStudent === "__manual" && (
              <label className="mt-4 block">
                <span className="text-sm font-semibold text-slate-200">Student name</span>
                <input
                  type="text"
                  value={manualStudent}
                  onChange={(event) => setManualStudent(event.target.value)}
                  placeholder="Student full name"
                  className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
                />
              </label>
            )}

            {studentError && (
              <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 p-3 text-sm text-amber-100">
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                <div>
                  Student list could not be loaded. You can still enter the student manually.
                  <div className="mt-1 text-xs text-amber-200/80">{studentError}</div>
                </div>
              </div>
            )}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              {ratingFields.map((field) => (
                <RatingSlider key={field.id} field={field} value={ratings[field.id]} onChange={updateRating} />
              ))}
            </div>

            <label className="mt-5 block">
              <span className="text-sm font-semibold text-slate-200">Teacher feedback</span>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="Add details that will help administration understand the student's probation progress."
                rows={6}
                className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm leading-6 text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400"
              />
            </label>

            {submitMessage && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${
                  submitMessage.type === "success"
                    ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                    : "border-rose-400/30 bg-rose-500/10 text-rose-100"
                }`}
              >
                {submitMessage.type === "success" ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}
                {submitMessage.text}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-500 px-4 py-2 text-sm font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Submit Evaluation
              </button>
            </div>
          </form>

          <aside className="space-y-5">
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-200">
                <ClipboardCheck size={16} />
                Scoring Guide
              </div>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <div className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-3">
                  <span className="font-bold text-rose-200">1-3</span> Not meeting expectations
                </div>
                <div className="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3">
                  <span className="font-bold text-amber-200">4-5</span> Approaching or meeting expectations
                </div>
                <div className="rounded-lg border border-lime-400/20 bg-lime-500/10 p-3">
                  <span className="font-bold text-lime-200">6-7</span> Consistently meeting expectations
                </div>
                <div className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 p-3">
                  <span className="font-bold text-emerald-200">8-10</span> Exceeding expectations
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900 p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-300">
                  Recent Submissions
                </div>
                <span className="text-xs font-semibold text-slate-500">{recentSubmissions.length}</span>
              </div>
              <div className="mt-4 space-y-3">
                {recentSubmissions.length ? (
                  recentSubmissions.map((submission) => (
                    <RecentSubmission key={`${submission.student}-${submission.submittedAt}`} submission={submission} />
                  ))
                ) : (
                  <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-500">
                    Submitted evaluations from this browser will appear here.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>
  );
}
