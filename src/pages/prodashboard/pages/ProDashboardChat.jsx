// 📄 src/pages/prodashboard/pages/ProDashboardChat.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";

import ChatHeader from "@/components/chat/ChatHeader";
import ChatRoom from "@/components/chat/ChatRoom";

export default function ProDashboardChat() {
  const { chat_id } = useParams();
  const { session } = useUser();
  const navigate = useNavigate();
  const proId = session?.user?.id;

  const [chatInfo, setChatInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // 📌 Charger infos de la conversation
  const fetchChatInfo = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("chats")
      .select(
        `
        id,
        mission_id,
        pro_id,
        client_id,
        missions:mission_id (
          service
        ),
        partner:client_id (
          first_name,
          last_name
        )
      `
      )
      .eq("id", chat_id)
      .single();

    if (!error) setChatInfo(data);

    setLoading(false);
  };

  useEffect(() => {
    if (!chat_id) return;
    fetchChatInfo();
  }, [chat_id]);

  if (loading) return <p className="p-6 text-gray-500">Loading chat...</p>;

  if (!chatInfo) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-600">Chat not found.</p>
        <button
          onClick={() => navigate(-1)}
          className="mt-4 px-4 py-2 rounded-full bg-rose-600 text-white"
        >
          Go back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto h-[calc(100vh-6rem)] flex flex-col">
      <ChatHeader
        onBack={() => navigate("/prodashboard/messages")}
        partner={chatInfo.partner}
        service={chatInfo.missions?.service}
      />

      <ChatRoom chatId={chat_id} user={session.user} />
    </div>
  );
}
