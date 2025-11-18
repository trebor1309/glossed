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

  // 🔥 MARK AS READ
  const markAsRead = async () => {
    try {
      await supabase
        .from("messages")
        .update({ read_at: new Date().toISOString() })
        .eq("chat_id", chatId)
        .neq("sender_id", user.id)
        .is("read_at", null);
    } catch (e) {
      console.error("Failed to mark as read", e);
    }
  };

  // 📌 Charger messages
  const loadMessages = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    setMessages(data || []);
  };

  useEffect(() => {
    loadMessages();
    markAsRead(); // Lire tout à l’ouverture

    // --- REALTIME : Nouveaux messages ---
    const msgChannel = supabase
      .channel(`realtime:messages:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);

          // Si message reçu de l'autre → le marquer comme lu
          if (payload.new.sender_id !== user.id) {
            markAsRead();
          }
        }
      )
      .subscribe();

    // --- REALTIME : Typing indicator ---
    const typingChannel = supabase
      .channel(`typing:${chatId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user_id !== user.id) {
          setTypingUser(payload.name);
          setTimeout(() => setTypingUser(null), 3000);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [chatId]);

  // Scroll auto
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  return (
    <div className="relative flex flex-col w-full h-full bg-white overflow-hidden">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-20 space-y-3">
        {messages.map((msg) => (
          <ChatBubble
            key={msg.id}
            msg={msg}
            isOwn={msg.sender_id === user.id}
            onImageClick={setViewerUrl}
          />
        ))}

        {/* Typing indicator */}
        {typingUser && (
          <div className="text-sm text-gray-500 italic px-2">{typingUser} is typing…</div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="absolute bottom-0 left-0 w-full bg-white border-t z-10">
        <ChatInput chatId={chatId} user={user} />
      </div>

      {/* Viewer */}
      {viewerUrl && <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
    </div>
  );
}
