import { useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Mail,
  Pencil,
  Plus,
  Trash2,
  UserRound,
} from "lucide-react";
import {
  saveMeetingRequest,
  sendMeetingRequestEmail,
  updateMeetingRequestStatus,
} from "../../lib/meetingNotifications.js";

const STORE_KEY = "wvcs-meeting-scheduler-v1";

const defaultAdministrators = [
  {
    id: "matt-conniry",
    name: "Matt Conniry",
    role: "Principal",
    email: "mconniry@wvcs.org",
    active: true,
    recurringSlots: [
      { id: "mc-mon-0830", weekday: 1, start: "08:30", end: "09:00", active: true },
      { id: "mc-wed-1400", weekday: 3, start: "14:00", end: "14:30", active: true },
    ],
    blockedSlots: [],
  },
  {
    id: "chris-cota",
    name: "Chris Cota",
    role: "Dean of Students",
    email: "ccota@wvcs.org",
    active: true,
    recurringSlots: [
      { id: "cc-tue-1015", weekday: 2, start: "10:15", end: "10:45", active: true },
      { id: "cc-thu-1315", weekday: 4, start: "13:15", end: "13:45", active: true },
    ],
    blockedSlots: [],
  },
  {
    id: "lynne-marks",
    name: "Lynne Marks",
    role: "Instructional Coach",
    email: "lmarks@wvcs.org",
    active: true,
    recurringSlots: [
      { id: "lm-mon-1115", weekday: 1, start: "11:15", end: "11:45", active: true },
      { id: "lm-fri-0900", weekday: 5, start: "09:00", end: "09:30", active: true },
    ],
    blockedSlots: [],
  },
];

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function normalizeAdministrator(admin) {
  if (admin.recurringSlots) {
    return {
      ...admin,
      recurringSlots: admin.recurringSlots,
      blockedSlots: admin.blockedSlots || [],
      slots: admin.slots || [],
    };
  }

  return {
    ...admin,
    recurringSlots: (admin.slots || []).map((slot) => ({
      id: slot.id,
      weekday: new Date(`${slot.date}T12:00:00`).getDay(),
      start: slot.start,
      end: slot.end,
      active: slot.status === "available",
    })),
    blockedSlots: [],
    slots: admin.slots || [],
  };
}

function loadMeetingState() {
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (!saved) return { administrators: defaultAdministrators, requests: [] };
    const parsed = JSON.parse(saved);
    return {
      administrators: parsed.administrators?.length
        ? parsed.administrators.map(normalizeAdministrator)
        : defaultAdministrators,
      requests: parsed.requests || [],
    };
  } catch {
    return { administrators: defaultAdministrators, requests: [] };
  }
}

function saveMeetingState(state) {
  localStorage.setItem(STORE_KEY, JSON.stringify(state));
}

function useMeetingStore() {
  const [state, setState] = useState(loadMeetingState);

  function updateState(updater) {
    setState((current) => {
      const next = updater(current);
      saveMeetingState(next);
      return next;
    });
  }

  return [state, updateState];
}

function formatDate(dateValue) {
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(timeValue) {
  const [hour, minute] = timeValue.split(":").map(Number);
  return new Date(2026, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatSlot(slot) {
  return `${formatDate(slot.date)} • ${formatTime(slot.start)}-${formatTime(slot.end)}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateKey(date) {
  return date.toISOString().slice(0, 10);
}

function makeGeneratedSlot(date, recurringSlot) {
  return {
    id: `${date}-${recurringSlot.id}`,
    recurringSlotId: recurringSlot.id,
    date,
    start: recurringSlot.start,
    end: recurringSlot.end,
  };
}

function isSlotBlocked(admin, slot) {
  return (admin.blockedSlots || []).some(
    (block) =>
      block.date === slot.date &&
      (block.allDay || (block.start === slot.start && block.end === slot.end))
  );
}

function isSlotRequested(requests, adminId, slot) {
  return requests.some(
    (request) =>
      request.administratorId === adminId &&
      request.date === slot.date &&
      request.start === slot.start &&
      request.end === slot.end &&
      request.status !== "cancelled"
  );
}

function buildAvailableCalendar(admin, requests, startDate, days = 14) {
  if (!admin) return [];
  const dates = Array.from({ length: days }, (_, index) => addDays(startDate, index));
  return dates.map((date) => {
    const key = dateKey(date);
    const slots = (admin.recurringSlots || [])
      .filter((slot) => slot.active && slot.weekday === date.getDay())
      .map((slot) => makeGeneratedSlot(key, slot))
      .filter((slot) => !isSlotBlocked(admin, slot))
      .filter((slot) => !isSlotRequested(requests, admin.id, slot))
      .sort((a, b) => a.start.localeCompare(b.start));

    return { date: key, slots };
  });
}

function icsDate(date, time) {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

function buildCalendarInvite(request, administrator, slot) {
  const confirmed = request.status === "confirmed";
  const subject = `${confirmed ? "Confirmed Meeting" : "Meeting Request"}: ${request.teacherName} with ${administrator.name}`;
  const description = [
    `Requested by: ${request.teacherName} <${request.teacherEmail}>`,
    `Administrator: ${administrator.name}, ${administrator.role}`,
    `Topic: ${request.topic}`,
    "",
    request.notes || "No notes provided.",
  ].join("\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WVCS//School Hub//EN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${request.id}@wvcs-school-hub`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    `DTSTART:${icsDate(slot.date, slot.start)}`,
    `DTEND:${icsDate(slot.date, slot.end)}`,
    `SUMMARY:${subject}`,
    `DESCRIPTION:${description}`,
    `ORGANIZER;CN=${administrator.name}:mailto:${administrator.email}`,
    `ATTENDEE;CN=${administrator.name};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${administrator.email}`,
    `ATTENDEE;CN=${request.teacherName};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${request.teacherEmail}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function downloadInvite(request, administrator, slot) {
  const invite = buildCalendarInvite(request, administrator, slot);
  const blob = new Blob([invite], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${administrator.name.replace(/\s+/g, "-").toLowerCase()}-${slot.date}-${slot.start}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function Shell({ children }) {
  return (
    <section className="min-h-[680px] bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-[1500px] px-5 py-6">{children}</div>
    </section>
  );
}

function AdministratorChoice({ administrator, selected, availableCount, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(administrator.id)}
      className={`rounded-lg border p-4 text-left transition ${
        selected
          ? "border-violet-300 bg-violet-500/20"
          : "border-slate-800 bg-slate-950 hover:border-violet-400"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-white">{administrator.name}</div>
          <div className="mt-1 text-xs text-slate-500">{administrator.role}</div>
        </div>
        <UserRound size={18} className="text-violet-300" />
      </div>
      <div className="mt-4 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100">
        {availableCount} available slot{availableCount === 1 ? "" : "s"}
      </div>
    </button>
  );
}

function MeetingSlotButton({ slot, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(slot.id)}
      className={`rounded-lg border px-4 py-3 text-left text-sm transition ${
        selected
          ? "border-violet-300 bg-violet-500/20 text-white"
          : "border-slate-800 bg-slate-950 text-slate-200 hover:border-violet-400"
      }`}
    >
      <div className="font-semibold">{formatSlot(slot)}</div>
    </button>
  );
}

function MeetingCalendar({ calendarDays, selectedSlotId, onSelectSlot }) {
  return (
    <div className="grid gap-3 lg:grid-cols-7">
      {calendarDays.map((day) => (
        <section key={day.date} className="min-h-36 rounded-lg border border-slate-800 bg-slate-950">
          <div className="border-b border-slate-800 px-3 py-2">
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              {new Date(`${day.date}T12:00:00`).toLocaleDateString([], { weekday: "short" })}
            </div>
            <div className="mt-1 text-sm font-semibold text-white">
              {new Date(`${day.date}T12:00:00`).toLocaleDateString([], { month: "short", day: "numeric" })}
            </div>
          </div>
          <div className="space-y-2 p-2">
            {day.slots.length ? (
              day.slots.map((slot) => (
                <MeetingSlotButton
                  key={slot.id}
                  slot={slot}
                  selected={selectedSlotId === slot.id}
                  onSelect={onSelectSlot}
                />
              ))
            ) : (
              <div className="rounded-md border border-dashed border-slate-800 px-2 py-3 text-center text-xs text-slate-500">
                No times
              </div>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function MeetingsModule() {
  const [state, updateState] = useMeetingStore();
  const [selection, setSelection] = useState({ adminId: "", slotId: "" });
  const [calendarStart, setCalendarStart] = useState(() => new Date());
  const [requester, setRequester] = useState({
    teacherName: "",
    teacherEmail: "",
    topic: "",
    notes: "",
  });
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const activeAdministrators = useMemo(
    () =>
      state.administrators
        .filter((admin) => admin.active)
        .map((admin) => ({
          ...admin,
          availableCount: buildAvailableCalendar(admin, state.requests, new Date()).reduce(
            (count, day) => count + day.slots.length,
            0
          ),
        })),
    [state.administrators, state.requests]
  );
  const selectedAdmin = state.administrators.find((admin) => admin.id === selection.adminId);
  const selectedCalendarDays = useMemo(
    () => buildAvailableCalendar(selectedAdmin, state.requests, calendarStart),
    [selectedAdmin, state.requests, calendarStart]
  );
  const selectedSlot = selectedCalendarDays.flatMap((day) => day.slots).find((slot) => slot.id === selection.slotId);
  const canRequest = selectedAdmin && selectedSlot && requester.teacherName && requester.teacherEmail && requester.topic;

  async function submitRequest() {
    if (!canRequest || isSubmitting) return;
    setIsSubmitting(true);
    const request = {
      id: crypto.randomUUID(),
      administratorId: selectedAdmin.id,
      slotId: selectedSlot.id,
      recurringSlotId: selectedSlot.recurringSlotId,
      date: selectedSlot.date,
      start: selectedSlot.start,
      end: selectedSlot.end,
      teacherName: requester.teacherName.trim(),
      teacherEmail: requester.teacherEmail.trim(),
      topic: requester.topic.trim(),
      notes: requester.notes.trim(),
      status: "requested",
      requestedAt: new Date().toISOString(),
      inviteStatus: "Awaiting administrator confirmation",
    };

    updateState((current) => ({
      ...current,
      requests: [request, ...current.requests],
    }));

    try {
      const saveResult = await saveMeetingRequest(request, selectedAdmin, selectedSlot);

      if (saveResult.saved) {
        setStatus(`Request sent to ${selectedAdmin.name}. The calendar invite will go to both parties when confirmed.`);
      } else {
        downloadInvite(request, selectedAdmin, selectedSlot);
        setStatus(`Request created locally. Calendar invite downloaded until Supabase email is configured.`);
      }

      setSelection({ adminId: "", slotId: "" });
      setRequester({ teacherName: "", teacherEmail: "", topic: "", notes: "" });
    } catch (error) {
      downloadInvite(request, selectedAdmin, selectedSlot);
      setStatus(`Request created locally, but email automation needs attention: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Shell>
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Meeting Requests</div>
        <h1 className="mt-2 text-2xl font-bold text-white">Schedule an Administrator Meeting</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Select an available meeting slot with an administrator. The request creates a calendar invite for the administrator.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        <main className="rounded-lg border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Clock size={16} className="text-violet-300" />
              Select an Administrator
            </div>
          </div>
          <div className="grid gap-3 p-4 md:grid-cols-3">
            {activeAdministrators.map((admin) => (
              <AdministratorChoice
                key={admin.id}
                administrator={admin}
                availableCount={admin.availableCount}
                selected={selection.adminId === admin.id}
                onSelect={(adminId) => setSelection({ adminId, slotId: "" })}
              />
            ))}
          </div>

          <div className="border-t border-slate-800 p-4">
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Clock size={16} className="text-violet-300" />
                Calendar Availability
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setCalendarStart((current) => addDays(current, -7))}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Previous Week
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarStart(new Date())}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarStart((current) => addDays(current, 7))}
                  className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
                >
                  Next Week
                </button>
              </div>
            </div>
            {selectedAdmin ? (
              selectedCalendarDays.some((day) => day.slots.length) ? (
                <MeetingCalendar
                  calendarDays={selectedCalendarDays}
                  selectedSlotId={selection.slotId}
                  onSelectSlot={(slotId) => setSelection((current) => ({ ...current, slotId }))}
                />
              ) : (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-sm text-slate-400">
                  {selectedAdmin.name} does not currently have available meeting times in this date range.
                </div>
              )
            ) : (
              <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-sm text-slate-400">
                Select Matt, Chris, or Lynne to see available times.
              </div>
            )}
          </div>
        </main>

        <aside className="rounded-lg border border-slate-800 bg-slate-900">
          <div className="border-b border-slate-800 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Mail size={16} className="text-violet-300" />
              Request Details
            </div>
          </div>
          <div className="space-y-4 p-4">
            {selectedAdmin && selectedSlot && (
              <div className="rounded-lg border border-violet-400/40 bg-violet-500/15 p-3 text-sm text-violet-100">
                {selectedAdmin.name} • {formatSlot(selectedSlot)}
              </div>
            )}
            <label className="space-y-1 text-sm font-medium text-slate-200">
              Your Name
              <input
                value={requester.teacherName}
                onChange={(event) => setRequester({ ...requester, teacherName: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-200">
              Your Email
              <input
                type="email"
                value={requester.teacherEmail}
                onChange={(event) => setRequester({ ...requester, teacherEmail: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-200">
              Topic
              <input
                value={requester.topic}
                onChange={(event) => setRequester({ ...requester, topic: event.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-200">
              Notes
              <textarea
                value={requester.notes}
                onChange={(event) => setRequester({ ...requester, notes: event.target.value })}
                className="min-h-24 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
            </label>
            {status && <div className="rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-violet-200">{status}</div>}
            <button
              type="button"
              disabled={!canRequest || isSubmitting}
              onClick={submitRequest}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-violet-400 bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CalendarClock size={16} />
              {isSubmitting ? "Creating Request..." : "Request Meeting"}
            </button>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function AdminEditor({ administrator, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => ({
    ...administrator,
    recurringSlots: (administrator.recurringSlots || []).map((slot) => ({ ...slot })),
    blockedSlots: (administrator.blockedSlots || []).map((slot) => ({ ...slot })),
    slots: administrator.slots || [],
  }));

  function updateRecurringSlot(slotId, patch) {
    setDraft((current) => ({
      ...current,
      recurringSlots: current.recurringSlots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)),
    }));
  }

  function addRecurringSlot() {
    setDraft((current) => ({
      ...current,
      recurringSlots: [
        ...current.recurringSlots,
        {
          id: crypto.randomUUID(),
          weekday: 1,
          start: "08:00",
          end: "08:30",
          active: true,
        },
      ],
    }));
  }

  function removeRecurringSlot(slotId) {
    setDraft((current) => ({
      ...current,
      recurringSlots: current.recurringSlots.filter((slot) => slot.id !== slotId),
    }));
  }

  function updateBlockedSlot(slotId, patch) {
    setDraft((current) => ({
      ...current,
      blockedSlots: current.blockedSlots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)),
    }));
  }

  function addBlockedSlot() {
    setDraft((current) => ({
      ...current,
      blockedSlots: [
        ...current.blockedSlots,
        {
          id: crypto.randomUUID(),
          date: new Date().toISOString().slice(0, 10),
          start: "08:00",
          end: "08:30",
          allDay: false,
          reason: "",
        },
      ],
    }));
  }

  function removeBlockedSlot(slotId) {
    setDraft((current) => ({
      ...current,
      blockedSlots: current.blockedSlots.filter((slot) => slot.id !== slotId),
    }));
  }

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Pencil size={16} className="text-violet-300" />
          Edit Administrator Schedule
        </div>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Name
            <input
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Role
            <input
              value={draft.role}
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-200">
            Email
            <input
              type="email"
              value={draft.email}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-violet-400"
            />
          </label>
        </div>

        <label className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm font-medium text-slate-200">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
          />
          Available for teacher scheduling
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Recurring Meeting Times</div>
              <div className="mt-1 text-xs text-slate-500">These times repeat across the calendar each week.</div>
            </div>
            <button
              type="button"
              onClick={addRecurringSlot}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              <Plus size={14} />
              Add Time
            </button>
          </div>
          {draft.recurringSlots.map((slot) => (
            <div key={slot.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 md:grid-cols-[1fr_120px_120px_110px_38px]">
              <select
                value={slot.weekday}
                onChange={(event) => updateRecurringSlot(slot.id, { weekday: Number(event.target.value) })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400"
              >
                {weekdayLabels.map((label, index) => (
                  <option key={label} value={index}>
                    {label}
                  </option>
                ))}
              </select>
              <input
                type="time"
                value={slot.start}
                onChange={(event) => updateRecurringSlot(slot.id, { start: event.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
              <input
                type="time"
                value={slot.end}
                onChange={(event) => updateRecurringSlot(slot.id, { end: event.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
              <label className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">
                <input
                  type="checkbox"
                  checked={slot.active}
                  onChange={(event) => updateRecurringSlot(slot.id, { active: event.target.checked })}
                />
                Active
              </label>
              <button
                type="button"
                onClick={() => removeRecurringSlot(slot.id)}
                className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-200"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-white">Blocked Dates and Times</div>
              <div className="mt-1 text-xs text-slate-500">Blocked days or times are hidden from teachers.</div>
            </div>
            <button
              type="button"
              onClick={addBlockedSlot}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800"
            >
              <Plus size={14} />
              Add Block
            </button>
          </div>
          {draft.blockedSlots.map((slot) => (
            <div key={slot.id} className="grid gap-2 rounded-lg border border-slate-800 bg-slate-950 p-3 md:grid-cols-[150px_100px_120px_120px_1fr_38px]">
              <input
                type="date"
                value={slot.date}
                onChange={(event) => updateBlockedSlot(slot.id, { date: event.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
              <label className="flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200">
                <input
                  type="checkbox"
                  checked={slot.allDay}
                  onChange={(event) => updateBlockedSlot(slot.id, { allDay: event.target.checked })}
                />
                All day
              </label>
              <input
                type="time"
                value={slot.start}
                disabled={slot.allDay}
                onChange={(event) => updateBlockedSlot(slot.id, { start: event.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400 disabled:opacity-40"
              />
              <input
                type="time"
                value={slot.end}
                disabled={slot.allDay}
                onChange={(event) => updateBlockedSlot(slot.id, { end: event.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400 disabled:opacity-40"
              />
              <input
                value={slot.reason}
                placeholder="Reason"
                onChange={(event) => updateBlockedSlot(slot.id, { reason: event.target.value })}
                className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm outline-none focus:border-violet-400"
              />
              <button
                type="button"
                onClick={() => removeBlockedSlot(slot.id)}
                className="rounded-lg border border-slate-700 p-2 text-slate-400 hover:border-rose-400 hover:text-rose-200"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
          {!draft.blockedSlots.length && (
            <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-4 text-sm text-slate-400">
              No blocked times for this administrator.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(draft)}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-400 bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-400"
          >
            <CheckCircle2 size={16} />
            Save Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

export function AdminMeetingsModule() {
  const [state, updateState] = useMeetingStore();
  const [editingId, setEditingId] = useState(state.administrators[0]?.id || "");
  const [confirmingId, setConfirmingId] = useState("");
  const editingAdmin = state.administrators.find((admin) => admin.id === editingId);

  function saveAdministrator(nextAdministrator) {
    updateState((current) => ({
      ...current,
      administrators: current.administrators.map((admin) =>
        admin.id === nextAdministrator.id ? nextAdministrator : admin
      ),
    }));
  }

  function markInviteSent(requestId) {
    updateState((current) => ({
      ...current,
      requests: current.requests.map((request) =>
        request.id === requestId ? { ...request, inviteStatus: "Invite marked sent" } : request
      ),
    }));
  }

  async function confirmAndSendInvite(request, admin, slot) {
    if (!admin || !slot || confirmingId) return;
    setConfirmingId(request.id);
    const confirmedRequest = {
      ...request,
      status: "confirmed",
      inviteStatus: "Confirmed calendar invite sent to both parties",
      confirmedAt: new Date().toISOString(),
    };
    const calendarInvite = buildCalendarInvite(confirmedRequest, admin, slot);

    try {
      await updateMeetingRequestStatus(request.id, {
        status: confirmedRequest.status,
        inviteStatus: confirmedRequest.inviteStatus,
      });
      const sendResult = await sendMeetingRequestEmail({
        request: confirmedRequest,
        administrator: admin,
        slot,
        calendarInvite,
      });

      if (!sendResult.sent) {
        throw new Error(sendResult.reason || "Email function did not send the invite.");
      }

      updateState((current) => ({
        ...current,
        requests: current.requests.map((item) =>
          item.id === request.id ? confirmedRequest : item
        ),
      }));
    } catch (error) {
      downloadInvite(confirmedRequest, admin, slot);
      updateState((current) => ({
        ...current,
        requests: current.requests.map((item) =>
          item.id === request.id
            ? {
                ...item,
                status: "confirmed",
                inviteStatus: `Confirmed locally. Email automation needs attention: ${error.message}`,
              }
            : item
        ),
      }));
    } finally {
      setConfirmingId("");
    }
  }

  return (
    <Shell>
      <div className="mb-5">
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300">Administration</div>
        <h1 className="mt-2 text-2xl font-bold text-white">Meeting Schedules</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Add and edit administrator availability for teacher meeting requests.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4 text-sm font-semibold text-white">
              Administrators
            </div>
            <div className="space-y-2 p-2">
              {state.administrators.map((admin) => (
                <button
                  key={admin.id}
                  type="button"
                  onClick={() => setEditingId(admin.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    editingId === admin.id
                      ? "border-violet-400 bg-violet-500/15"
                      : "border-slate-800 bg-slate-950 hover:border-slate-600"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{admin.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{admin.role}</div>
                    </div>
                    <UserRound size={16} className="text-slate-500" />
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{admin.email}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
            <div className="mb-2 text-sm font-semibold text-white">Meeting Requests</div>
            <div className="text-2xl font-bold text-white">{state.requests.length}</div>
            <div className="mt-1 text-xs text-slate-500">Requests created locally</div>
          </div>
        </aside>

        <main className="space-y-5">
          {editingAdmin && (
            <AdminEditor
              key={editingAdmin.id}
              administrator={editingAdmin}
              onSave={saveAdministrator}
              onCancel={() => setEditingId("")}
            />
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-white">
                <Mail size={16} className="text-violet-300" />
                Recent Meeting Requests
              </div>
            </div>
            <div className="grid gap-3 p-4">
              {state.requests.length ? (
                state.requests.map((request) => {
                  const admin = state.administrators.find((item) => item.id === request.administratorId);
                  const slot = request.date
                    ? { date: request.date, start: request.start, end: request.end }
                    : admin?.slots?.find((item) => item.id === request.slotId);
                  return (
                    <div key={request.id} className="rounded-lg border border-slate-800 bg-slate-950 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="text-sm font-semibold text-white">
                            {request.teacherName} with {admin?.name || "Administrator"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">{slot ? formatSlot(slot) : "Slot unavailable"}</div>
                          <div className={`mt-2 inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${
                            request.status === "confirmed"
                              ? "border-emerald-400/50 bg-emerald-500/15 text-emerald-100"
                              : "border-amber-400/50 bg-amber-500/15 text-amber-100"
                          }`}>
                            {request.status === "confirmed" ? "Confirmed" : "Pending confirmation"}
                          </div>
                          <div className="mt-2 text-sm text-slate-300">{request.topic}</div>
                          {request.notes && <div className="mt-2 text-xs text-slate-400">{request.notes}</div>}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {admin && slot && request.status !== "confirmed" && (
                            <button
                              type="button"
                              disabled={confirmingId === request.id}
                              onClick={() => confirmAndSendInvite(request, admin, slot)}
                              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <CheckCircle2 size={14} />
                              {confirmingId === request.id ? "Sending..." : "Confirm & Send Invite"}
                            </button>
                          )}
                          {admin && slot && (
                            <button
                              type="button"
                              onClick={() => downloadInvite(request, admin, slot)}
                              className="inline-flex items-center gap-2 rounded-lg border border-violet-500/60 bg-violet-500/15 px-3 py-2 text-xs font-semibold text-violet-100 hover:bg-violet-500/25"
                            >
                              <Download size={14} />
                              Invite
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => markInviteSent(request.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/60 bg-emerald-500/15 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/25"
                          >
                            <CheckCircle2 size={14} />
                            Mark Sent
                          </button>
                        </div>
                      </div>
                      <div className="mt-3 text-xs font-semibold text-slate-500">{request.inviteStatus}</div>
                    </div>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-slate-700 bg-slate-950 p-6 text-sm text-slate-400">
                  No teacher meeting requests yet.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </Shell>
  );
}
