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

  // ------------------------------------------------------
  // 🔥 FONCTION : Marquer messages comme lus
  // ------------------------------------------------------
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

  // ------------------------------------------------------
  // 📌 Charger messages
  // ------------------------------------------------------
  const loadMessages = async () => {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: true });

    setMessages(data || []);
  };

  // ------------------------------------------------------
  // 📌 Initialisation + realtime
  // ------------------------------------------------------
  useEffect(() => {
    loadMessages();
    markAsRead(); // marquer comme lu directement

    // --- REALTIME : nouveaux messages ---
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

          // Si c’est un message reçu → marqué comme lu
          if (payload.new.sender_id !== user.id) {
            markAsRead();
          }
        }
      )
      .subscribe();

    // --- REALTIME : typing indicator ---
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

  // ------------------------------------------------------
  // 📌 Marquer comme lus dès que la liste change
  // ------------------------------------------------------
  useEffect(() => {
    if (messages.length > 0) {
      markAsRead();
    }
  }, [messages]);

  // ------------------------------------------------------
  // 📌 Auto scroll vers le bas
  // ------------------------------------------------------
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUser]);

  return (
    <div className="relative flex flex-col w-full h-full bg-white overflow-hidden">
      {/* Zone messages */}
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

      {/* Input fixé */}
      <div className="absolute bottom-0 left-0 w-full bg-white border-t z-10">
        <ChatInput chatId={chatId} user={user} />
      </div>

      {/* Viewer image */}
      {viewerUrl && <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
    </div>
  );
}
