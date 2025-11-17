// src/components/chat/ChatList.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { MessageSquare, User as UserIcon, Briefcase } from "lucide-react";

export default function ChatList({ user }) {
  const [chats, setChats] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const isPro = user?.active_role === "pro";

  useEffect(() => {
    if (!user) return;

    const loadChats = async () => {
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
        .or(`pro_id.eq.${user.id},client_id.eq.${user.id}`)
        .order("updated_at", { ascending: false });

      if (error) {
        console.error("Error loading chats:", error);
        setLoading(false);
        return;
      }

      // filtrer les chats cachés selon la side
      const filtered = (data || []).filter((chat) => {
        if (isPro) return !chat.hidden_for_pro;
        return !chat.hidden_for_client;
      });

      setChats(filtered);
      setLoading(false);
    };

    loadChats();
  }, [user, isPro]);

  const handleOpenChat = (chatId) => {
    navigate(`/chat/${chatId}`);
  };

  if (loading) {
    return <p className="text-gray-500">Loading your conversations...</p>;
  }

  if (chats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="h-12 w-12 rounded-full bg-rose-100 flex items-center justify-center mb-4">
          <MessageSquare className="text-rose-500" />
        </div>
        <p className="text-gray-700 font-medium mb-1">No conversations yet</p>
        <p className="text-sm text-gray-500 max-w-xs">
          Once a mission is confirmed, you&apos;ll see your conversations with your pros/clients
          here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {chats.map((chat) => {
        const isProSide = user.id === chat.pro_id;
        const pro = chat.pro;
        const client = chat.client;
        const mission = chat.mission;

        const counterpart = isProSide ? client : pro;

        const title = isProSide
          ? `${client?.first_name || ""} ${client?.last_name || ""}`.trim() || "Client"
          : pro?.business_name ||
            `${pro?.first_name || ""} ${pro?.last_name || ""}`.trim() ||
            "Professional";

        const subtitle = isProSide
          ? mission?.service
          : mission?.service
            ? `${mission.service}`
            : null;

        const lastMessage = chat.last_message || "No messages yet";

        const updatedLabel = chat.updated_at
          ? new Date(chat.updated_at).toLocaleString(undefined, {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

        return (
          <button
            key={chat.id}
            onClick={() => handleOpenChat(chat.id)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white border border-gray-100 hover:border-rose-200 hover:shadow-md transition-all text-left"
          >
            <div className="flex-shrink-0">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-rose-500 to-red-500 text-white flex items-center justify-center shadow-sm">
                {counterpart?.profile_photo ? (
                  <img
                    src={counterpart.profile_photo}
                    alt={title}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                ) : (
                  <UserIcon size={18} />
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-gray-900 truncate">{title}</p>
                {updatedLabel && (
                  <span className="text-[11px] text-gray-400 flex-shrink-0">{updatedLabel}</span>
                )}
              </div>

              {subtitle && (
                <div className="text-[11px] text-gray-500 flex items-center gap-1 mt-0.5">
                  <Briefcase size={11} className="text-rose-400" />
                  <span className="truncate">{subtitle}</span>
                </div>
              )}

              <p className="text-xs text-gray-500 truncate mt-1">{lastMessage}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
