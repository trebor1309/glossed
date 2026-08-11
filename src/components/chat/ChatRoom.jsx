import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatBubble from "./ChatBubble";
import ChatInput from "./ChatInput";
import ImageViewer from "./ImageViewer";

function mergeMessage(messages, message) {
  const existingIndex = messages.findIndex((item) => item.id === message.id);
  if (existingIndex >= 0) {
    return messages.map((item) => (item.id === message.id ? { ...item, ...message } : item));
  }

  return [...messages, message].sort((a, b) => {
    const dateDifference = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return dateDifference || a.id.localeCompare(b.id);
  });
}

export default function ChatRoom({ chatId, user }) {
  const userId = user?.id;
  const [messages, setMessages] = useState([]);
  const [messageError, setMessageError] = useState(null);
  const [reloadSequence, setReloadSequence] = useState(0);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [typingUser, setTypingUser] = useState(null);
  const bottomRef = useRef(null);
  const typingChannelRef = useRef(null);
  const typingTimerRef = useRef(null);

  const markAsRead = useCallback(async () => {
    if (!chatId || !userId) return;

    const { error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("chat_id", chatId)
      .neq("sender_id", userId)
      .is("read_at", null);

    if (error) {
      console.error("Failed to mark messages as read:", error);
      return;
    }

    window.dispatchEvent(new CustomEvent("chat-read", { detail: chatId }));
  }, [chatId, userId]);

  const broadcastTyping = useCallback(() => {
    const channel = typingChannelRef.current;
    if (!channel || !userId) return;

    channel
      .send({
        type: "broadcast",
        event: "typing",
        payload: {
          user_id: userId,
          name: user?.business_name || user?.first_name || "Someone",
        },
      })
      .catch((error) => console.error("Unable to send typing indicator:", error));
  }, [user?.business_name, user?.first_name, userId]);

  useEffect(() => {
    if (!chatId || !userId) return;
    let active = true;
    setMessages([]);
    setMessageError(null);
    window.dispatchEvent(new CustomEvent("chat-open", { detail: chatId }));

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (!active) return;
      if (error) {
        console.error("Messages fetch error:", error);
        setMessages([]);
        setMessageError("Unable to load messages. Please try again.");
        return;
      }

      setMessageError(null);
      setMessages((realtimeMessages) =>
        realtimeMessages.reduce(
          (mergedMessages, message) => mergeMessage(mergedMessages, message),
          data || []
        )
      );
      await markAsRead();
    };

    const messageChannel = supabase
      .channel(`chat-messages:${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((previous) => mergeMessage(previous, payload.new));
          if (payload.new.sender_id !== userId) markAsRead();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => setMessages((previous) => mergeMessage(previous, payload.new))
      )
      .subscribe();

    const typingChannel = supabase
      .channel(`typing:${chatId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user_id === userId) return;
        setTypingUser(payload.name || "Someone");
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setTypingUser(null), 2500);
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    loadMessages();

    return () => {
      active = false;
      window.dispatchEvent(new CustomEvent("chat-open", { detail: null }));
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      if (typingChannelRef.current === typingChannel) typingChannelRef.current = null;
      supabase.removeChannel(messageChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [chatId, markAsRead, reloadSequence, userId]);

  useEffect(() => {
    const timer = setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 0);
    return () => clearTimeout(timer);
  }, [messages]);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="min-w-0 flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-3 py-4 sm:px-4">
        {messageError && (
          <div
            className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
            role="alert"
          >
            <p>{messageError}</p>
            <button
              type="button"
              onClick={() => setReloadSequence((value) => value + 1)}
              className="mt-2 font-semibold underline"
            >
              Try again
            </button>
          </div>
        )}
        {messages.map((message) => (
          <ChatBubble
            key={message.id}
            msg={message}
            isOwn={message.sender_id === userId}
            onImageClick={setViewerUrl}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {typingUser && (
        <div className="shrink-0 px-4 py-1 text-sm italic text-gray-500" aria-live="polite">
          {typingUser} is typing...
        </div>
      )}

      <ChatInput chatId={chatId} user={user} onTyping={broadcastTyping} />
      {viewerUrl && <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
    </div>
  );
}
