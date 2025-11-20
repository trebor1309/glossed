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
  const [unreadMap, setUnreadMap] = useState({});
  const [loading, setLoading] = useState(true);

  // 🔍 Non-lus côté client
  const fetchUnreadMap = async (chatRows) => {
    const ids = chatRows.map((c) => c.id);
    if (!ids.length || !userId) {
      setUnreadMap({});
      return;
    }

    const { data, error } = await supabase
      .from("messages")
      .select("chat_id")
      .in("chat_id", ids)
      .neq("sender_id", userId)
      .is("read_at", null);

    if (error) {
      console.error("Unread fetch error (client):", error);
      return;
    }

    const map = {};
    for (const row of data || []) {
      map[row.chat_id] = true;
    }
    setUnreadMap(map);
  };

  // 📌 Charger les conversations + vrai dernier message
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
        updated_at,
        missions:mission_id ( service ),
        pro:pro_id (
          first_name,
          last_name,
          business_name,
          profile_photo
        ),
        last_msg:messages!messages_chat_id_fkey (
          content,
          attachment_url,
          created_at
        )
      `
      )
      .eq("client_id", userId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Chats fetch error (client):", error);
      setChats([]);
      setUnreadMap({});
      setLoading(false);
      return;
    }

    // last_msg est un tableau → on garde le dernier
    const normalized = (data || []).map((chat) => {
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

  // 📡 Realtime : on écoute les messages
  useEffect(() => {
    if (!userId) return;

    fetchChats();

    const channel = supabase
      .channel("realtime:messages_client")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const chatId = payload.new.chat_id;

        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId
              ? { ...c, updated_at: payload.new.created_at, last_message_obj: payload.new }
              : c
          )
        );

        // Met à jour le unreadMap sans refetch
        if (payload.new.sender_id !== userId) {
          setUnreadMap((prev) => ({ ...prev, [chatId]: true }));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [userId]);

  const openChat = (chat) => navigate(`/dashboard/messages/${chat.id}`);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">Messages</h1>

      {loading && <p className="text-gray-500 text-sm">Loading conversations...</p>}

      {!loading && chats.length === 0 && <ChatEmptyState />}

      {!loading && chats.length > 0 && (
        <ChatList chats={chats} onOpenChat={openChat} userRole="client" unreadMap={unreadMap} />
      )}
    </div>
  );
}
