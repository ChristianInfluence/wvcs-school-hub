import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

export const DEFAULT_MEETING_ADMINISTRATORS = [
  {
    id: "matt-conniry",
    name: "Matt Conniry",
    role: "Principal",
    email: "mconniry@wvcs.org",
    active: true,
    bookingUrl: "",
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
    bookingUrl: "",
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
    bookingUrl: "",
    recurringSlots: [
      { id: "lm-mon-1115", weekday: 1, start: "11:15", end: "11:45", active: true },
      { id: "lm-fri-0900", weekday: 5, start: "09:00", end: "09:30", active: true },
    ],
    blockedSlots: [],
  },
];

function normalizeAdministrator(admin) {
  return {
    ...admin,
    bookingUrl: admin.bookingUrl || "",
    recurringSlots: admin.recurringSlots || [],
    blockedSlots: admin.blockedSlots || [],
    slots: admin.slots || [],
  };
}

function mapAdministratorToDatabase(admin) {
  return {
    id: admin.id,
    name: admin.name,
    role: admin.role,
    email: admin.email,
    active: admin.active !== false,
    booking_url: admin.bookingUrl || "",
    recurring_slots: admin.recurringSlots || [],
    blocked_slots: admin.blockedSlots || [],
    slots: admin.slots || [],
    updated_at: new Date().toISOString(),
  };
}

function mapAdministratorFromDatabase(row) {
  return normalizeAdministrator({
    id: row.id,
    name: row.name,
    role: row.role,
    email: row.email,
    active: row.active,
    bookingUrl: row.booking_url || "",
    recurringSlots: row.recurring_slots || [],
    blockedSlots: row.blocked_slots || [],
    slots: row.slots || [],
  });
}

function trimTime(value) {
  return String(value || "").slice(0, 5);
}

function mapMeetingRequestFromDatabase(row) {
  return {
    id: row.id,
    administratorId: row.administrator_id,
    administratorName: row.administrator_name,
    administratorRole: row.administrator_role || "",
    administratorEmail: row.administrator_email,
    recurringSlotId: row.recurring_slot_id,
    slotId: `${row.slot_date}-${row.recurring_slot_id || `${trimTime(row.slot_start)}-${trimTime(row.slot_end)}`}`,
    date: row.slot_date,
    start: trimTime(row.slot_start),
    end: trimTime(row.slot_end),
    teacherName: row.teacher_name,
    teacherEmail: row.teacher_email,
    topic: row.topic,
    notes: row.notes || "",
    status: row.status,
    inviteStatus: row.invite_status,
    requestedAt: row.requested_at,
    declineNote: row.decline_note || "",
    cancelNote: row.cancel_note || "",
    releasesSlot: row.releases_slot,
  };
}

export async function fetchMeetingState() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured." };
  }

  const [{ data: administrators, error: adminError }, { data: requests, error: requestError }] = await Promise.all([
    supabase.from("meeting_administrators").select("*").order("name"),
    supabase.from("meeting_requests").select("*").order("requested_at", { ascending: false }),
  ]);

  if (adminError) throw adminError;
  if (requestError) throw requestError;

  return {
    loaded: true,
    state: {
      administrators: administrators?.length
        ? administrators.map(mapAdministratorFromDatabase)
        : DEFAULT_MEETING_ADMINISTRATORS,
      requests: (requests || []).map(mapMeetingRequestFromDatabase),
    },
  };
}

export async function saveMeetingAdministrator(administrator) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("meeting_administrators")
    .upsert(mapAdministratorToDatabase(administrator), { onConflict: "id" });

  if (error) throw error;
  return { saved: true };
}
