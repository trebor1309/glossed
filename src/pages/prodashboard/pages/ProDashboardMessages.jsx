// 📄 src/pages/prodashboard/pages/ProDashboardMessages.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";

import ChatList from "@/components/chat/ChatList";
import ChatEmptyState from "@/components/chat/ChatEmptyState";

export default function ProDashboardMessages() {
  const { session } = useUser();
  const proId = session?.user?.id;
  const navigate = useNavigate();

  const [chats, setChats] = useState([]);
  const [unreadMap, setUnreadMap] = useState({});
  const [loading, setLoading] = useState(true);

  // 🔢 Non lus côté pro
  const fetchUnreadMap = async (chatRows) => {
    const ids = chatRows.map((c) => c.id);
    if (!ids.length || !proId) {
      setUnreadMap({});
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .select("chat_id")
      .in("chat_id", ids)
      .neq("sender_id", proId)
      .is("read_at", null);

    if (error) {
      console.error("Unread fetch error (pro):", error);
      return;
    }

    const map = {};
    for (const row of data || []) {
      map[row.chat_id] = true;
    }
    setUnreadMap(map);
  };

  // 📌 Charger toutes les conversations du pro
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
        missions:mission_id ( service ),
        client:client_id (
          first_name,
          last_name,
          profile_photo
        )
      `
      )
      .eq("pro_id", proId)
      .order("updated_at", { ascending: false });

    if (!error) {
      const rows = data || [];
      setChats(rows);
      await fetchUnreadMap(rows);
    } else {
      console.error("Chats fetch error (pro):", error);
      setChats([]);
      setUnreadMap({});
    }

    setLoading(false);
  };

  useEffect(() => {
    if (!proId) return;
    fetchChats();

    const channel = supabase
      .channel("realtime:chats_pro")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chats", filter: `pro_id=eq.${proId}` },
        () => fetchChats()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proId]);

  // 📌 Ouvrir le chat
  const openChat = (chat) => {
    navigate(`/prodashboard/messages/${chat.id}`);
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Messages</h1>

      {loading && <p className="text-gray-500 text-sm">Loading conversations...</p>}

      {!loading && chats.length === 0 && <ChatEmptyState />}

      {!loading && chats.length > 0 && (
        <ChatList chats={chats} onOpenChat={openChat} userRole="pro" unreadMap={unreadMap} />
      )}
    </div>
  );
}
