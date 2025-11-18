// 📄 src/pages/dashboard/pages/DashboardMessages.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";

import ChatList from "@/components/chat/ChatList";
import ChatEmptyState from "@/components/chat/ChatEmptyState";

export default function DashboardMessages() {
  const { session } = useUser();
  const userId = session?.user?.id;
  const navigate = useNavigate();

  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);

  // 📌 Charger toutes les conversations du client
  const fetchChats = async () => {
    setLoading(true);

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
        missions:mission_id (
          service
        ),
        pro:pro_id (
          first_name,
          last_name,
          business_name,
          profile_photo
        )

      `
      )
      .eq("client_id", userId)
      .order("updated_at", { ascending: false });

    if (!error) {
      setChats(data || []);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!userId) return;
    fetchChats();

    // 🟢 Supabase realtime
    const channel = supabase
      .channel("realtime:chats_client")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chats", filter: `client_id=eq.${userId}` },
        () => fetchChats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // 📌 Open chat
  const openChat = (chat) => {
    navigate(`/dashboard/chat/${chat.id}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Messages</h1>

      {/* 📌 Loading */}
      {loading && <p className="text-gray-500 text-sm">Loading conversations...</p>}

      {/* 📌 Empty */}
      {!loading && chats.length === 0 && <ChatEmptyState />}

      {/* 📌 List */}
      {!loading && chats.length > 0 && (
        <ChatList chats={chats} onOpenChat={openChat} userRole="client" />
      )}
    </div>
  );
}
