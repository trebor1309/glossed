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

  // --------------------------------------------------------------------
  // 🔢 Charger les messages non-lus pour les conversations du pro
  // --------------------------------------------------------------------
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

  // --------------------------------------------------------------------
  // 📌 Charger les chats AVEC leur vrai dernier message
  // --------------------------------------------------------------------
  const fetchChats = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("chats")
      .select(`
        id,
        mission_id,
        pro_id,
        client_id,
        updated_at,
        missions:mission_id ( service ),
        client:client_id (
          first_name,
          last_name,
          profile_photo
        ),
        last_msg:messages!messages_chat_id_fkey (
          content,
          attachment_url,
          created_at
        )
      `)
      .eq("pro_id", proId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Chats fetch error (pro):", error);
      setChats([]);
      setUnreadMap({});
      setLoading(false);
      return;
    }

    // ⚠️ last_msg est un tableau — on en extrait le dernier message
    const normalized = data.map((chat) => {
      const msgs = chat.last_msg || [];
      const lastMessage = msgs.length ? msgs[msgs.length - 1] : null;

      return {
        ...chat,
        last_message_obj: lastMessage,
      };
    });

    setChats(normalized);
    await fetchUnreadMap(normalized);
    setLoading(false);
  };

  // --------------------------------------------------------------------
  // 📡 Realtime basé sur les messages (et non sur chats)
  // --------------------------------------------------------------------
  useEffect(() => {
    if (!proId) return;

    fetchChats();

    const channel = supabase
      .channel("realtime:messages_pro")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        () => fetchChats()
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [proId]);

  // --------------------------------------------------------------------
  // 🔗 Ouvrir un chat
  // --------------------------------------------------------------------
  const openChat = (chat) => navigate(`/prodashboard/messages/${chat.id}`);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Messages</h1>

      {loading && <p className="text-gray-500 text-sm">Loading conversations...</p>}

      {!loading && chats.length === 0 && <ChatEmptyState />}

      {!loading && chats.length > 0 && (
        <ChatList
          chats={chats}
          onOpenChat={openChat}
          userRole="pro"
          unreadMap={unreadMap}
        />
      )}
    </div>
  );
}
