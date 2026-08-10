// 📄 src/components/chat/ChatRoom.jsx
import { useCallback, useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatBubble from "./ChatBubble";
import ChatInput from "./ChatInput";
import ImageViewer from "./ImageViewer";

export default function ChatRoom({ chatId, user }) {
  const userId = user?.id;
  const [messages, setMessages] = useState([]);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [typingUser, setTypingUser] = useState(null);

  const bottomRef = useRef(null);

  // ------------------------------------------------------
  // 🔥 Mark as read
  // ------------------------------------------------------
  const markAsRead = useCallback(async () => {
    if (!chatId || !userId) return;

    try {
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("chat_id", chatId)
        .neq("sender_id", userId)
        .is("read_at", null);
    } catch (e) {
      console.error("Failed to mark messages as read:", e);
    }
  }, [chatId, userId]);

  // ------------------------------------------------------
  // 📌 Load messages
  // ------------------------------------------------------
  const loadMessages = useCallback(async () => {
    if (!chatId) return;

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Messages fetch error:", error);
      setMessages([]);
      return;
    }

    setMessages(data || []);
  }, [chatId]);

  // ------------------------------------------------------
  // 📌 Init + realtime
  // ------------------------------------------------------
  useEffect(() => {
    if (!chatId || !userId) return;

    // 🔔 Signale que ce chat est ouvert
    window.dispatchEvent(new CustomEvent("chat-open", { detail: chatId }));

    // 1. initial load
    loadMessages().then(() => markAsRead());

    // 2. realtime messages
    const msgChannel = supabase
      .channel(`realtime:messages:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((prev) => [...prev, payload.new]);

            // si message reçu → marquer direct comme lu
            if (payload.new.sender_id !== userId) {
              markAsRead();
            }
          }

          if (payload.eventType === "UPDATE") {
            setMessages((prev) => prev.map((m) => (m.id === payload.new.id ? payload.new : m)));
          }
        }
      )
      .subscribe();

    // 3. typing indicator
    const typingChannel = supabase
      .channel(`typing:${chatId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user_id !== userId) {
          setTypingUser(payload.name || "Someone");
          setTimeout(() => setTypingUser(null), 2500);
        }
      })
      .subscribe();

    // Cleanup → signale chat fermé
    return () => {
      window.dispatchEvent(new CustomEvent("chat-open", { detail: null }));
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [chatId, loadMessages, markAsRead, userId]);

  // ------------------------------------------------------
  // 📌 Auto scroll
  // ------------------------------------------------------
  useEffect(() => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 0);
  }, [messages]);

  return (
    <div className="relative flex flex-col w-full h-full bg-white overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-20 space-y-3">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.sender_id === userId}
            onImageClick={setViewerUrl}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Typing indicator */}
      {typingUser && (
        <div className="absolute bottom-16 left-4 text-sm italic text-gray-500 z-20 bg-white/80 px-2 py-1 rounded-md">
          {typingUser} is typing…
        </div>
      )}

      {/* Input */}
      <div className="absolute bottom-0 left-0 w-full bg-white border-t z-10">
        <ChatInput chatId={chatId} user={user} />
      </div>

      {viewerUrl && <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
    </div>
  );
}
