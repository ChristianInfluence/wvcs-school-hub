import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

function mapMeetingRequest(request, administrator, slot) {
  return {
    id: request.id,
    administrator_id: request.administratorId,
    administrator_name: administrator.name,
    administrator_role: administrator.role,
    administrator_email: administrator.email,
    recurring_slot_id: request.recurringSlotId,
    slot_date: slot.date,
    slot_start: slot.start,
    slot_end: slot.end,
    teacher_name: request.teacherName,
    teacher_email: request.teacherEmail,
    topic: request.topic,
    notes: request.notes,
    status: request.status,
    invite_status: request.inviteStatus,
    requested_at: request.requestedAt,
  };
}

export async function saveMeetingRequest(request, administrator, slot) {
  if (!isSupabaseConfigured) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from("meeting_requests")
    .insert(mapMeetingRequest(request, administrator, slot));

  if (error) throw error;
  return { saved: true };
}

export async function updateMeetingRequestStatus(requestId, patch) {
  if (!isSupabaseConfigured) {
    return { saved: false, reason: "Supabase is not configured." };
  }

  const update = {
    status: patch.status,
    invite_status: patch.inviteStatus,
    updated_at: new Date().toISOString(),
  };

  if (patch.declineNote !== undefined) {
    update.decline_note = patch.declineNote;
  }

  const { error } = await supabase
    .from("meeting_requests")
    .update(update)
    .eq("id", requestId);

  if (error) throw error;
  return { saved: true };
}

export async function sendMeetingRequestEmail({ request, administrator, slot, calendarInvite }) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-meeting-request", {
    body: {
      request,
      administrator,
      slot,
      calendarInvite,
    },
  });

  if (error) throw error;
  return data || { sent: true };
}

export async function sendMeetingDeclineEmail({ request, administrator, slot, declineNote }) {
  if (!isSupabaseConfigured) {
    return { sent: false, reason: "Supabase is not configured." };
  }

  const { data, error } = await supabase.functions.invoke("send-meeting-request", {
    body: {
      type: "declined",
      request,
      administrator,
      slot,
      declineNote,
    },
  });

  if (error) throw error;
  return data || { sent: true };
}
