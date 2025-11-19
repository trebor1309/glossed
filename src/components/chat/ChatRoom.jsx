// 📄 src/components/chat/ChatRoom.jsx
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatBubble from "./ChatBubble";
import ChatInput from "./ChatInput";
import ImageViewer from "./ImageViewer";

export default function ChatRoom({ chatId, user }) {
  const [messages, setMessages] = useState([]);
  const [viewerUrl, setViewerUrl] = useState(null);
  const [typingUser, setTypingUser] = useState(null);

  const bottomRef = useRef(null);

  // 🔥 Marquer comme lus
  const markAsRead = async () => {
    try {
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("chat_id", chatId)
        .neq("sender_id", user.id)
        .is("read_at", null);
    } catch (e) {
      console.error("Failed to mark messages as read:", e);
    }
  };

  // 📌 Charger les messages
  const loadMessages = async () => {
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
  };

  // 📌 Init + realtime
  useEffect(() => {
    if (!chatId || !user?.id) return;

    // 1. initial
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
          // INSERT → nouveau message
          if (payload.eventType === "INSERT") {
            setMessages((prev) => [...prev, payload.new]);

            if (payload.new.sender_id !== user.id) {
              markAsRead(); // le lecteur marque directement comme lu
            }
          }

          // UPDATE → read_at vient d’être modifié
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
        if (payload.user_id !== user.id) {
          setTypingUser(payload.name || "Someone");
          setTimeout(() => setTypingUser(null), 2500);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [chatId, user?.id]);

  // 📌 Scroll auto
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  return (
    <div className="relative flex flex-col w-full h-full bg-white overflow-hidden">
      {/* ZONE MESSAGES */}
      <div className="flex-1 overflow-y-auto px-4 py-20 space-y-3">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.sender_id === user.id}
            onImageClick={setViewerUrl}
          />
        ))}

        <div ref={bottomRef} />
      </div>

      {/* TYPING FIXÉ AU-DESSUS DE L’INPUT */}
      {typingUser && (
        <div className="absolute bottom-16 left-4 text-sm italic text-gray-500 z-20 bg-white/80 px-2 py-1 rounded-md">
          {typingUser} is typing…
        </div>
      )}

      {/* INPUT FIXÉ EN BAS */}
      <div className="absolute bottom-0 left-0 w-full bg-white border-t z-10">
        <ChatInput chatId={chatId} user={user} />
      </div>

      {/* VIEWER IMAGE */}
      {viewerUrl && <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
    </div>
  );
}
