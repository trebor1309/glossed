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

  // -------------------------------------------------------------
  // 🔢 Non-lus côté PRO
  // -------------------------------------------------------------
  const fetchUnreadMap = async (chatRows) => {
    const ids = chatRows.map((c) => c.id);
    if (!ids.length || !proId) return setUnreadMap({});

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
    for (const row of data || []) map[row.chat_id] = true;

    setUnreadMap(map);
  };

  // -------------------------------------------------------------
  // 📌 Charger les chats + dernier message (last_message_obj)
  // -------------------------------------------------------------
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
        client:client_id ( first_name, last_name, profile_photo ),
        last_msg:messages!messages_chat_id_fkey (
          content,
          attachment_url,
          created_at,
          read_at,
          sender_id
        )
      `
      )
      .eq("pro_id", proId)
      .order("updated_at", { ascending: false });

    if (error) {
      console.error("Chats fetch error (pro):", error);
      setChats([]);
      setUnreadMap({});
      setLoading(false);
      return;
    }

    const normalized = (data || []).map((chat) => {
      const msgs = chat.last_msg || [];
      const lastMessage = msgs.length ? msgs[msgs.length - 1] : null;
      return { ...chat, last_message_obj: lastMessage };
    });

    setChats(normalized);
    await fetchUnreadMap(normalized);
    setLoading(false);
  };

  // -------------------------------------------------------------
  // 📡 Realtime : INSERT + UPDATE (read_at)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!proId) return;

    fetchChats();

    const channel = supabase
      .channel("realtime:messages_pro")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        const msg = payload.new;
        const chatId = msg.chat_id;

        // --- Mise à jour du dernier message dans la liste ---
        setChats((prev) =>
          prev.map((chat) =>
            chat.id === chatId
              ? {
                  ...chat,
                  updated_at: msg.created_at,
                  last_message_obj: msg,
                }
              : chat
          )
        );

        // --- INSERT : nouveau message ---
        if (payload.eventType === "INSERT") {
          if (msg.sender_id !== proId) {
            setUnreadMap((prev) => ({ ...prev, [chatId]: true }));
          }
        }

        // --- UPDATE : read_at vient d'être modifié ---
        if (payload.eventType === "UPDATE") {
          if (msg.sender_id !== proId && msg.read_at !== null) {
            setUnreadMap((prev) => {
              const copy = { ...prev };
              delete copy[chatId];
              return copy;
            });
          }
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [proId]);

  const openChat = (chat) => navigate(`/prodashboard/messages/${chat.id}`);

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
