import { useEffect, useMemo, useState } from "react";
import { Inbox, MailPlus, MessageCircle, Reply, Search, Send, X } from "lucide-react";
import {
  createHubMessageThread,
  fetchHubMessagePosts,
  fetchHubMessageRecipients,
  fetchHubMessageThreads,
  markHubMessageThreadRead,
  replyToHubMessageThread,
  sendHubMessageEmail,
} from "../../lib/hubMessagesData.js";

function formatDateTime(value) {
  if (!value) return "";
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function getInitials(email) {
  return String(email || "?").slice(0, 2).toUpperCase();
}

function getRecipientName(recipient) {
  if (recipient?.name) return recipient.name;
  const localPart = String(recipient?.email || "").split("@")[0] || "";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ") || recipient?.email || "";
}

function getMessageLinkThreadId() {
  const match = window.location.hash.match(/[?&]message=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

export default function HubMessages({ currentUserEmail = "", currentUserName = "" }) {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState([]);
  const [posts, setPosts] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [mode, setMode] = useState("inbox");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Loading messages...");
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState({ subject: "", body: "", recipients: [] });
  const [recipientSearch, setRecipientSearch] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const currentEmail = normalizeEmail(currentUserEmail);
  const selectedThread = threads.find((thread) => thread.id === selectedThreadId);
  const unreadCount = threads.filter((thread) => thread.unread).length;
  const filteredThreads = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return threads;
    return threads.filter((thread) => {
      const people = (thread.participants || []).map((participant) => participant.email).join(" ");
      const messageText = (thread.posts || []).map((post) => `${post.senderName} ${post.senderEmail} ${post.body}`).join(" ");
      return `${thread.subject} ${people} ${messageText}`.toLowerCase().includes(needle);
    });
  }, [threads, query]);
  const availableRecipients = recipients.filter((recipient) => normalizeEmail(recipient.email) !== currentEmail);
  const selectedRecipients = draft.recipients
    .map((email) => availableRecipients.find((recipient) => normalizeEmail(recipient.email) === email) || { email })
    .filter(Boolean);
  const searchedRecipients = useMemo(() => {
    const needle = recipientSearch.trim().toLowerCase();
    return availableRecipients
      .filter((recipient) => !draft.recipients.includes(normalizeEmail(recipient.email)))
      .filter((recipient) => {
        if (!needle) return true;
        return `${getRecipientName(recipient)} ${recipient.email}`.toLowerCase().includes(needle);
      })
      .slice(0, 8);
  }, [availableRecipients, draft.recipients, recipientSearch]);

  async function loadThreads({ quiet = false } = {}) {
    try {
      const result = await fetchHubMessageThreads(currentEmail);
      if (!result.loaded) {
        setStatus(result.reason);
        return;
      }
      setThreads(result.threads);
      if (!quiet) setStatus("Messages loaded.");
    } catch (error) {
      setStatus(`Unable to load messages: ${error.message}`);
    }
  }

  async function loadRecipients() {
    try {
      const result = await fetchHubMessageRecipients();
      if (result.loaded) setRecipients(result.recipients);
    } catch (error) {
      setStatus(`Unable to load staff list: ${error.message}`);
    }
  }

  async function openThread(threadId) {
    setSelectedThreadId(threadId);
    setMode("thread");
    setOpen(true);
    try {
      const result = await fetchHubMessagePosts(threadId);
      if (result.loaded) setPosts(result.posts);
      await markHubMessageThreadRead(threadId);
      await loadThreads({ quiet: true });
    } catch (error) {
      setStatus(`Unable to open message: ${error.message}`);
    }
  }

  useEffect(() => {
    loadThreads();
    loadRecipients();
    const interval = window.setInterval(() => loadThreads({ quiet: true }), 30000);
    return () => window.clearInterval(interval);
  }, [currentEmail]);

  useEffect(() => {
    const linkedThreadId = getMessageLinkThreadId();
    if (linkedThreadId) openThread(linkedThreadId);
  }, [threads.length]);

  function addRecipient(email) {
    const normalized = normalizeEmail(email);
    if (!normalized || draft.recipients.includes(normalized)) return;
    setDraft((current) => ({
      ...current,
      recipients: [...current.recipients, normalized],
    }));
    setRecipientSearch("");
  }

  function removeRecipient(email) {
    const normalized = normalizeEmail(email);
    setDraft((current) => ({
      ...current,
      recipients: current.recipients.filter((item) => item !== normalized),
    }));
  }

  function handleRecipientKeyDown(event) {
    if (event.key === "Enter" && searchedRecipients[0]) {
      event.preventDefault();
      addRecipient(searchedRecipients[0].email);
    }
    if (event.key === "Backspace" && !recipientSearch && draft.recipients.length) {
      removeRecipient(draft.recipients[draft.recipients.length - 1]);
    }
  }

  async function sendNewMessage() {
    if (!draft.subject.trim() || !draft.body.trim() || !draft.recipients.length) {
      setStatus("Choose at least one recipient and enter a subject and message.");
      return;
    }

    setSending(true);
    setStatus("Sending message...");
    try {
      const result = await createHubMessageThread({
        subject: draft.subject,
        body: draft.body,
        senderEmail: currentEmail,
        senderName: currentUserName || currentEmail,
        recipients: draft.recipients,
      });
      if (!result.saved) throw new Error(result.reason || "Message could not be saved.");
      const thread = { id: result.threadId, subject: draft.subject };
      await sendHubMessageEmail({
        thread,
        post: result.post,
        recipients: result.recipientEmails,
        hubUrl: `${window.location.origin}${window.location.pathname}`,
      });
      setDraft({ subject: "", body: "", recipients: [] });
      setStatus("Message sent.");
      await loadThreads();
      await openThread(result.threadId);
    } catch (error) {
      setStatus(`Message saved/sent failed: ${error.message}`);
    } finally {
      setSending(false);
    }
  }

  async function sendReply() {
    if (!selectedThread || !replyBody.trim()) return;
    setSending(true);
    setStatus("Sending reply...");
    try {
      const result = await replyToHubMessageThread({
        threadId: selectedThread.id,
        body: replyBody,
        senderEmail: currentEmail,
        senderName: currentUserName || currentEmail,
      });
      if (!result.saved) throw new Error(result.reason || "Reply could not be saved.");
      const notifyRecipients = (selectedThread.participants || [])
        .map((participant) => normalizeEmail(participant.email))
        .filter((email) => email && email !== currentEmail);
      await sendHubMessageEmail({
        thread: { id: selectedThread.id, subject: selectedThread.subject },
        post: result.post,
        recipients: notifyRecipients,
        hubUrl: `${window.location.origin}${window.location.pathname}`,
      });
      setReplyBody("");
      setStatus("Reply sent.");
      await openThread(selectedThread.id);
    } catch (error) {
      setStatus(`Reply failed: ${error.message}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
          unreadCount > 0
            ? "border-sky-300 bg-sky-500/20 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500/30"
            : "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
        }`}
        title="Messages"
      >
        <MessageCircle size={16} />
        Messages
        {unreadCount > 0 && (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border border-slate-950 bg-sky-400 px-1 text-[11px] font-black text-slate-950">
            {unreadCount}
          </span>
        )}
      </button>

      {!open && unreadCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-4 left-4 right-4 z-40 rounded-lg border border-sky-300 bg-slate-900 p-3 text-left shadow-2xl shadow-slate-950/50 transition hover:bg-slate-800 md:absolute md:bottom-auto md:left-auto md:right-0 md:top-full md:mt-2 md:w-72"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-sky-300/50 bg-sky-500/20 text-sky-100">
              <MessageCircle size={18} />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-bold text-white">
                {unreadCount === 1 ? "New Hub message" : `${unreadCount} new Hub messages`}
              </div>
              <div className="mt-1 text-xs leading-5 text-slate-300">
                Open Messages to read and reply.
              </div>
            </div>
          </div>
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex min-h-0 flex-col overflow-hidden border border-slate-700 bg-slate-950 shadow-2xl md:absolute md:inset-auto md:right-0 md:mt-2 md:h-[680px] md:w-[min(94vw,920px)] md:flex-row md:rounded-lg">
          <aside className={`${mode === "inbox" ? "flex" : "hidden"} h-full w-full shrink-0 flex-col border-b border-slate-800 bg-slate-900 md:flex md:w-[340px] md:border-b-0 md:border-r`}>
            <div className="border-b border-slate-800 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-bold text-white">
                  <Inbox size={16} className="text-sky-300" />
                  Hub Messages
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-300 hover:bg-slate-800"
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("compose")}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-3 py-2 text-xs font-bold text-white hover:bg-sky-400"
                >
                  <MailPlus size={14} />
                  New
                </button>
                <button
                  type="button"
                  onClick={() => setMode("inbox")}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800"
                >
                  Inbox
                </button>
              </div>
              <label className="mt-3 flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  className="w-full bg-transparent text-sm outline-none"
                  placeholder="Search messages"
                />
              </label>
            </div>
            <div className="flex-1 overflow-auto p-2">
              {filteredThreads.length ? (
                filteredThreads.map((thread) => (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => openThread(thread.id)}
                    className={`mb-2 w-full rounded-lg border p-3 text-left transition ${
                      selectedThreadId === thread.id
                        ? "border-sky-400 bg-sky-500/15"
                        : "border-slate-800 bg-slate-950 hover:border-slate-600"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-white">{thread.subject}</div>
                        <div className="mt-1 truncate text-xs text-slate-400">
                          {thread.latestPost?.senderName || thread.latestPost?.sender_email || "Message"}
                        </div>
                      </div>
                      {thread.unread && <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-300" />}
                    </div>
                    <div className="mt-2 line-clamp-2 text-xs leading-5 text-slate-400">{thread.latestPost?.body}</div>
                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      {formatDateTime(thread.latestPostAt)}
                    </div>
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">
                  No messages yet.
                </div>
              )}
            </div>
            <div className="border-t border-slate-800 px-3 py-2 text-xs text-slate-500">{status}</div>
          </aside>

          <main className={`${mode === "inbox" ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-1 flex-col bg-slate-950`}>
            <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2 md:hidden">
              <button
                type="button"
                onClick={() => setMode("inbox")}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-200"
              >
                <Inbox size={14} />
                Inbox
              </button>
              <div className="min-w-0 truncate text-sm font-bold text-white">
                {mode === "compose" ? "New Message" : selectedThread?.subject || "Message"}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-300"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
            {mode === "compose" ? (
              <div className="flex h-full flex-col">
                <div className="hidden border-b border-slate-800 p-4 md:block">
                  <div className="text-lg font-bold text-white">New Message</div>
                  <div className="mt-1 text-sm text-slate-400">Send a Hub message and email notification.</div>
                </div>
                <div className="flex-1 overflow-auto p-3 md:p-4">
                  <label className="block text-sm font-semibold text-slate-200">
                    To
                    <div className="mt-1 rounded-lg border border-slate-800 bg-slate-900 p-2 md:mt-2">
                      <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 md:min-h-11 md:gap-2 md:py-2">
                        {selectedRecipients.map((recipient) => (
                          <span
                            key={recipient.email}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-sky-400/50 bg-sky-500/15 px-2 py-1 text-xs font-semibold text-sky-100"
                          >
                            <span className="truncate">{getRecipientName(recipient)}</span>
                            <button
                              type="button"
                              onClick={() => removeRecipient(recipient.email)}
                              className="rounded-full p-0.5 text-sky-100 hover:bg-sky-400/20"
                              title={`Remove ${recipient.email}`}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          value={recipientSearch}
                          onChange={(event) => setRecipientSearch(event.target.value)}
                          onKeyDown={handleRecipientKeyDown}
                          className="min-w-36 flex-1 bg-transparent text-sm text-white outline-none"
                          placeholder={draft.recipients.length ? "Add another person" : "Type a name or email"}
                        />
                      </div>
                      <div className="mt-2 max-h-32 overflow-auto rounded-lg border border-slate-800 bg-slate-950 md:max-h-48">
                        {searchedRecipients.length ? (
                          searchedRecipients.map((recipient) => (
                            <button
                              key={recipient.email}
                              type="button"
                              onClick={() => addRecipient(recipient.email)}
                              className="flex w-full items-center gap-2 border-b border-slate-800 px-3 py-2 text-left text-sm text-slate-200 last:border-b-0 hover:bg-slate-800"
                            >
                              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-[11px] font-bold text-slate-200">
                                {getInitials(recipient.email)}
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate font-semibold text-white">{getRecipientName(recipient)}</span>
                                <span className="block truncate text-xs text-slate-400">{recipient.email}</span>
                              </span>
                            </button>
                          ))
                        ) : (
                          <div className="px-3 py-3 text-sm text-slate-500">No matching Hub users.</div>
                        )}
                      </div>
                    </div>
                  </label>
                  <label className="mt-3 block text-sm font-semibold text-slate-200 md:mt-4">
                    Subject
                    <input
                      value={draft.subject}
                      onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400 md:mt-2"
                      placeholder="What is this about?"
                    />
                  </label>
                  <label className="mt-3 block text-sm font-semibold text-slate-200 md:mt-4">
                    Message
                    <textarea
                      value={draft.body}
                      onChange={(event) => setDraft({ ...draft, body: event.target.value })}
                      className="mt-1 min-h-28 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-sky-400 md:mt-2 md:min-h-48"
                      placeholder="Write your message..."
                    />
                  </label>
                </div>
                <div className="border-t border-slate-800 p-3 md:p-4">
                  <button
                    type="button"
                    onClick={sendNewMessage}
                    disabled={sending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Send size={16} />
                    {sending ? "Sending..." : "Send Message"}
                  </button>
                </div>
              </div>
            ) : selectedThread ? (
              <div className="flex h-full flex-col">
                <div className="hidden border-b border-slate-800 p-4 md:block">
                  <div className="text-lg font-bold text-white">{selectedThread.subject}</div>
                  <div className="mt-1 truncate text-sm text-slate-400">
                    {(selectedThread.participants || []).map((participant) => participant.email).join(", ")}
                  </div>
                </div>
                <div className="flex-1 space-y-3 overflow-auto p-3 md:p-4">
                  {posts.map((post) => {
                    const mine = normalizeEmail(post.senderEmail) === currentEmail;
                    return (
                      <div key={post.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] rounded-lg border px-4 py-3 ${
                          mine
                            ? "border-sky-400/50 bg-sky-500/20"
                            : "border-slate-800 bg-slate-900"
                        }`}>
                          <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                            {post.senderName || post.senderEmail}
                          </div>
                          <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-white">{post.body}</div>
                          <div className="mt-2 text-[11px] font-semibold text-slate-500">{formatDateTime(post.createdAt)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t border-slate-800 p-3 md:p-4">
                  <label className="block text-sm font-semibold text-slate-200">
                    Reply
                    <textarea
                      value={replyBody}
                      onChange={(event) => setReplyBody(event.target.value)}
                      className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm leading-6 text-white outline-none focus:border-sky-400 md:mt-2 md:min-h-24"
                      placeholder="Write a reply..."
                    />
                  </label>
                  <button
                    type="button"
                    onClick={sendReply}
                    disabled={sending || !replyBody.trim()}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-sky-400 bg-sky-500 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Reply size={16} />
                    {sending ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center p-8 text-center">
                <div>
                  <MessageCircle size={34} className="mx-auto text-sky-300" />
                  <h2 className="mt-3 text-xl font-bold text-white">Select a message</h2>
                  <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400">
                    Open a thread from the inbox or start a new message to notify Hub users by email.
                  </p>
                </div>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
