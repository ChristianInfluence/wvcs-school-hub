import { isSupabaseConfigured, supabase } from "./supabaseClient.js";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function mapThread(row, currentUserEmail = "") {
  const currentEmail = normalizeEmail(currentUserEmail);
  const participants = row.hub_message_participants || [];
  const posts = [...(row.hub_message_posts || [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  const participant = participants.find((item) => normalizeEmail(item.email) === currentEmail);
  const latestPost = posts[0] || null;
  return {
    id: row.id,
    subject: row.subject,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestPostAt: row.latest_post_at || row.created_at,
    participant,
    participants,
    posts: posts.map(mapPost),
    latestPost: latestPost ? mapPost(latestPost) : null,
    unread: Boolean(
      participant &&
        latestPost &&
        normalizeEmail(latestPost.sender_email) !== currentEmail &&
        (!participant.read_at || new Date(participant.read_at).getTime() < new Date(latestPost.created_at).getTime())
    ),
  };
}

function mapPost(row) {
  return {
    id: row.id,
    threadId: row.thread_id,
    senderEmail: row.sender_email,
    senderName: row.sender_name || row.sender_email,
    body: row.body,
    source: row.source,
    createdAt: row.created_at,
  };
}

export async function fetchHubMessageRecipients() {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", recipients: [] };
  }

  const { data, error } = await supabase.rpc("list_hub_message_recipients");
  if (error) throw error;
  return {
    loaded: true,
    recipients: (data || []).map((row) => ({
      email: row.email,
      name: row.name || row.email,
      label: row.name || row.email,
    })),
  };
}

export async function fetchHubMessageThreads(currentUserEmail) {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", threads: [] };
  }

  const { data, error } = await supabase
    .from("hub_message_threads")
    .select(`
      *,
      hub_message_participants(*),
      hub_message_posts(*)
    `)
    .order("latest_post_at", { ascending: false });

  if (error) throw error;
  return {
    loaded: true,
    threads: (data || []).map((row) => mapThread(row, currentUserEmail)),
  };
}

export async function fetchHubMessagePosts(threadId) {
  if (!isSupabaseConfigured) {
    return { loaded: false, reason: "Supabase is not configured.", posts: [] };
  }

  const { data, error } = await supabase
    .from("hub_message_posts")
    .select("*")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return { loaded: true, posts: (data || []).map(mapPost) };
}

export async function createHubMessageThread({ subject, body, senderEmail, senderName, recipients }) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const threadId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sender = normalizeEmail(senderEmail);
  const uniqueRecipients = Array.from(new Set((recipients || []).map(normalizeEmail).filter(Boolean)));
  const participantEmails = Array.from(new Set([sender, ...uniqueRecipients]));

  const { error: threadError } = await supabase.from("hub_message_threads").insert({
    id: threadId,
    subject: subject.trim(),
    created_by_email: sender,
    latest_post_at: now,
  });
  if (threadError) throw threadError;

  const { error: participantsError } = await supabase.from("hub_message_participants").insert(
    participantEmails.map((email) => ({
      thread_id: threadId,
      email,
      role: email === sender ? "sender" : "recipient",
      read_at: email === sender ? now : null,
    }))
  );
  if (participantsError) throw participantsError;

  const { data: post, error: postError } = await supabase
    .from("hub_message_posts")
    .insert({
      thread_id: threadId,
      sender_email: sender,
      sender_name: senderName || sender,
      body: body.trim(),
      source: "hub",
    })
    .select("*")
    .single();
  if (postError) throw postError;

  return { saved: true, threadId, post: mapPost(post), recipientEmails: uniqueRecipients };
}

export async function replyToHubMessageThread({ threadId, body, senderEmail, senderName }) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { data: post, error } = await supabase
    .from("hub_message_posts")
    .insert({
      thread_id: threadId,
      sender_email: normalizeEmail(senderEmail),
      sender_name: senderName || senderEmail,
      body: body.trim(),
      source: "hub",
    })
    .select("*")
    .single();

  if (error) throw error;
  await markHubMessageThreadRead(threadId);
  return { saved: true, post: mapPost(post) };
}

export async function markHubMessageThreadRead(threadId) {
  if (!isSupabaseConfigured) return { saved: false, reason: "Supabase is not configured." };

  const { error } = await supabase
    .from("hub_message_participants")
    .update({ read_at: new Date().toISOString() })
    .eq("thread_id", threadId);

  if (error) throw error;
  return { saved: true };
}

export async function sendHubMessageEmail({ thread, post, recipients, hubUrl }) {
  if (!isSupabaseConfigured) return { sent: false, reason: "Supabase is not configured." };

  const { data, error } = await supabase.functions.invoke("send-hub-message-email", {
    body: { thread, post, recipients, hubUrl },
  });

  if (error) throw error;
  return data || { sent: true };
}
