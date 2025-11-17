// 📄 src/components/chat/ChatRoom.jsx
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import ChatBubble from "./ChatBubble";
import ChatInput from "./ChatInput";

export default function ChatRoom({ chatId, user }) {
  const [messages, setMessages] = useState([]);
  const bottomRef = useRef(null);

  // 📌 Charger les messages existants
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

    // 📌 Realtime
    const channel = supabase
      .channel("realtime:messages")
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
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [chatId]);

  // 📌 Scroll auto
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col flex-1 bg-white border-x border-gray-100">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => (
          <ChatBubble key={msg.id} msg={msg} isOwn={msg.sender_id === user.id} />
        ))}
        <div ref={bottomRef} />
      </div>

      <ChatInput chatId={chatId} user={user} />
    </div>
  );
}
