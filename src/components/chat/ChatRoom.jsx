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
  // 🔥 Mark messages as read
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
  // 📌 Load messages
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
  // 📌 Init + realtime
  // ------------------------------------------------------
  useEffect(() => {
    loadMessages().then(() => markAsRead());

    // --- REALTIME : New messages ---
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

          // Only mark as read if received message
          if (payload.new.sender_id !== user.id) markAsRead();
        }
      )
      .subscribe();

    // --- REALTIME : typing indicator ---
    const typingChannel = supabase
      .channel(`typing:${chatId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (payload.user_id !== user.id) {
          setTypingUser(payload.name);
          setTimeout(() => setTypingUser(null), 2500);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(msgChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [chatId]);

  // ------------------------------------------------------
  // 📌 Scroll down when messages or typing change
  // ------------------------------------------------------
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

      {/* TYPING INDICATOR — fixé au-dessus de l'input */}
      {typingUser && (
        <div className="absolute bottom-16 left-4 text-sm italic text-gray-500 z-20 bg-white/80 px-2 py-1 rounded-md">
          {typingUser} is typing…
        </div>
      )}

      {/* INPUT FIXÉ */}
      <div className="absolute bottom-0 left-0 w-full bg-white border-t z-10">
        <ChatInput chatId={chatId} user={user} />
      </div>

      {/* IMAGE VIEWER */}
      {viewerUrl && <ImageViewer url={viewerUrl} onClose={() => setViewerUrl(null)} />}
    </div>
  );
}
