import { useCallback, useEffect, useRef, useState } from "react";
import { getMyChatSummaries } from "@/lib/chat";
import { supabase } from "@/lib/supabaseClient";

function sortChats(chats) {
  return [...chats].sort((a, b) => {
    const aDate = a.last_message_obj?.created_at || a.updated_at || 0;
    const bDate = b.last_message_obj?.created_at || b.updated_at || 0;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
}

function applyMessageChange(chats, message, eventType) {
  if (!message?.id || !message.chat_id) return chats;

  if (eventType === "INSERT") {
    return sortChats(
      chats.map((chat) =>
        chat.id === message.chat_id
          ? { ...chat, updated_at: message.created_at, last_message_obj: message }
          : chat
      )
    );
  }

  if (eventType === "UPDATE") {
    return chats.map((chat) =>
      chat.id === message.chat_id && chat.last_message_obj?.id === message.id
        ? { ...chat, last_message_obj: { ...chat.last_message_obj, ...message } }
        : chat
    );
  }

  return chats;
}

export function useChatList(userId) {
  const [chats, setChats] = useState([]);
  const [unreadMap, setUnreadMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const chatIdsRef = useRef(new Set());
  const requestSequence = useRef(0);

  const fetchChats = useCallback(
    async (showLoading = true) => {
      if (!userId) {
        setChats([]);
        setUnreadMap({});
        setLoading(false);
        return;
      }

      const requestId = ++requestSequence.current;
      if (showLoading) setLoading(true);

      try {
        const rows = await getMyChatSummaries();
        if (requestId !== requestSequence.current) return;

        chatIdsRef.current = new Set(rows.map((chat) => chat.id));
        setChats(rows);
        setUnreadMap(
          Object.fromEntries(
            rows.filter((chat) => chat.unread_count > 0).map((chat) => [chat.id, chat.unread_count])
          )
        );
        setError(null);
      } catch (fetchError) {
        if (requestId !== requestSequence.current) return;
        console.error("Unable to load conversations:", fetchError);
        setChats([]);
        setUnreadMap({});
        setError("Unable to load conversations. Please try again.");
      } finally {
        if (requestId === requestSequence.current) setLoading(false);
      }
    },
    [userId]
  );

  useEffect(() => {
    if (!userId) {
      fetchChats();
      return;
    }

    fetchChats();

    const handleMessage = (payload) => {
      const message = payload.new;
      if (!message?.chat_id) return;

      if (!chatIdsRef.current.has(message.chat_id)) {
        fetchChats(false);
        return;
      }

      setChats((previous) => applyMessageChange(previous, message, payload.eventType));

      if (message.sender_id === userId) return;

      if (payload.eventType === "INSERT") {
        setUnreadMap((previous) => ({
          ...previous,
          [message.chat_id]: Number(previous[message.chat_id] || 0) + 1,
        }));
      } else if (payload.eventType === "UPDATE" && message.read_at) {
        setUnreadMap((previous) => {
          const nextCount = Math.max(0, Number(previous[message.chat_id] || 0) - 1);
          const next = { ...previous };
          if (nextCount) next[message.chat_id] = nextCount;
          else delete next[message.chat_id];
          return next;
        });
      }
    };

    const channel = supabase
      .channel(`chat-list:${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        handleMessage
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages" },
        handleMessage
      )
      .subscribe();

    const handleChatRead = (event) => {
      const chatId = event.detail;
      if (!chatId) return;
      setUnreadMap((previous) => {
        const next = { ...previous };
        delete next[chatId];
        return next;
      });
    };
    window.addEventListener("chat-read", handleChatRead);

    return () => {
      requestSequence.current += 1;
      window.removeEventListener("chat-read", handleChatRead);
      supabase.removeChannel(channel);
    };
  }, [fetchChats, userId]);

  return { chats, unreadMap, loading, error, retry: fetchChats };
}
