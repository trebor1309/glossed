// src/components/chat/ChatRoom.jsx
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { ArrowLeft, User as UserIcon, Briefcase } from "lucide-react";
import ChatBubble from "./ChatBubble";
import ChatInput from "./ChatInput";

function ChatHeader({ chat, mission, counterpart, isProSide, onBack }) {
  const title = isProSide
    ? `${counterpart?.first_name || ""} ${counterpart?.last_name || ""}`.trim() || "Client"
    : counterpart?.business_name ||
      `${counterpart?.first_name || ""} ${counterpart?.last_name || ""}`.trim() ||
      "Professional";

  const subtitle = isProSide ? mission?.service : mission?.service ? `${mission.service}` : null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b bg-white/80 backdrop-blur-sm">
      <button
        onClick={onBack}
        className="md:hidden p-2 rounded-full hover:bg-gray-100 text-gray-600"
      >
        <ArrowLeft size={20} />
      </button>

      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-gradient-to-br from-rose-500 to-red-500 text-white font-semibold shadow-sm">
        {counterpart?.profile_photo ? (
          // si tu as un vrai avatar plus tard
          <img
            src={counterpart.profile_photo}
            alt={title}
            className="h-10 w-10 rounded-full object-cover"
          />
        ) : (
          <UserIcon size={20} />
        )}
      </div>

      <div className="flex flex-col">
        <span className="font-semibold text-gray-900">{title}</span>
        {subtitle && (
          <span className="text-xs text-gray-500 flex items-center gap-1">
            <Briefcase size={12} /> {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ChatRoom({ chatId, user }) {
  const [chat, setChat] = useState(null);
  const [mission, setMission] = useState(null);
  const [proUser, setProUser] = useState(null);
  const [clientUser, setClientUser] = useState(null);
  const [messages, setMessages] = useState([]);

  const bottomRef = useRef(null);
  const navigate = useNavigate();

  const isProSide = user?.active_role === "pro";

  // Charger le chat + mission + users
  useEffect(() => {
    if (!chatId || !user) return;

    const loadChat = async () => {
      const { data, error } = await supabase
        .from("chats")
        .select(
          `
          id,
          mission_id,
          pro_id,
          client_id,
          last_message,
          updated_at,
          created_at,
          mission:missions (
            id,
            service
          ),
          pro:users!chats_pro_id_fkey (
            id,
            first_name,
            last_name,
            business_name,
            profile_photo
          ),
          client:users!chats_client_id_fkey (
            id,
            first_name,
            last_name,
            profile_photo
          )
        `
        )
        .eq("id", chatId)
        .single();

      if (error) {
        console.error("Error loading chat:", error);
        return;
      }

      setChat(data);
      setMission(data.mission || null);
      setProUser(data.pro || null);
      setClientUser(data.client || null);
    };

    loadChat();
  }, [chatId, user]);

  // Charger les messages existants + realtime
  useEffect(() => {
    if (!chatId || !user) return;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error loading messages:", error);
        return;
      }

      setMessages(data);
    };

    loadMessages();

    const channel = supabase
      .channel(`realtime:chat_messages:${chatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_messages",
          filter: `chat_id=eq.${chatId}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatId, user]);

  // Marquer comme lus pour le côté courant
  useEffect(() => {
    if (!chatId || !user || messages.length === 0) return;

    const markAsRead = async () => {
      try {
        if (isProSide) {
          await supabase
            .from("chat_messages")
            .update({ read_by_pro: true })
            .eq("chat_id", chatId)
            .eq("read_by_pro", false);
        } else {
          await supabase
            .from("chat_messages")
            .update({ read_by_client: true })
            .eq("chat_id", chatId)
            .eq("read_by_client", false);
        }
      } catch (err) {
        console.error("Error marking messages as read:", err);
      }
    };

    markAsRead();
  }, [chatId, user, messages, isProSide]);

  // Scroll auto en bas
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!chat) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-gray-500">Loading conversation...</p>
      </div>
    );
  }

  const counterpart = isProSide ? clientUser : proUser;

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-3xl mx-auto bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      <ChatHeader
        chat={chat}
        mission={mission}
        counterpart={counterpart}
        isProSide={isProSide}
        onBack={() => navigate("/chat")}
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gradient-to-b from-rose-50/40 to-white">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-gray-400 text-sm">
            No messages yet. Start the conversation ✨
          </div>
        )}

        {messages.map((msg) => (
          <ChatBubble key={msg.id} msg={msg} isOwn={msg.sender_id === user.id} />
        ))}
        <div ref={bottomRef} />
      </div>

      <ChatInput chatId={chatId} user={user} />
    </div>
  );
}
