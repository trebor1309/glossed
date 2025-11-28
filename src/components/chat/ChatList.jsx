// 📄 src/components/chat/ChatList.jsx
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";

export default function ChatList({ chats, onOpenChat, userRole, unreadMap }) {
  const navigate = useNavigate();
  const isClient = userRole === "client";

  const openProfile = (id, e) => {
    e.stopPropagation(); // 🛑 Empêche l’ouverture du chat
    navigate(`/profile/${id}`);
  };

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {chats.map((chat) => {
          const partner = isClient ? chat.pro : chat.client;
          const name =
            partner?.business_name ||
            `${partner?.first_name || ""} ${partner?.last_name || ""}`.trim();

          const avatar = partner?.profile_photo;
          const partnerId = partner?.id;

          const service = isClient ? chat.missions?.service : null;

          const last = chat.last_message_obj || null;

          let previewText = "No messages yet";
          if (last) {
            if (last.attachment_url && !last.content) previewText = "📷 Photo";
            else if (last.content?.trim()) previewText = last.content;
          }

          let timestamp = "";
          const tsSource = last?.created_at || chat.updated_at;
          if (tsSource) {
            const d = new Date(tsSource);
            timestamp = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          }

          const hasUnread = !!unreadMap?.[chat.id];

          return (
            <motion.li
              key={chat.id}
              className="p-4 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition"
              onClick={() => onOpenChat(chat)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* --- AVATAR CLICKABLE PROFILE LINK --- */}
              <img
                src={avatar || "/default-avatar.png"}
                alt={name || "User"}
                className="w-12 h-12 rounded-full object-cover bg-gray-100 flex-shrink-0 cursor-pointer"
                onClick={(e) => openProfile(partnerId, e)}
              />

              <div className="flex-1 min-w-0">
                {/* --- NAME CLICKABLE PROFILE LINK --- */}
                <p
                  className="font-semibold text-gray-800 truncate cursor-pointer hover:underline"
                  onClick={(e) => openProfile(partnerId, e)}
                >
                  {name || "Unknown user"}
                </p>

                {isClient && service && <p className="text-sm text-gray-500 truncate">{service}</p>}

                <p className="text-xs text-gray-400 truncate mt-1">{previewText}</p>
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {timestamp && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">{timestamp}</span>
                )}

                {hasUnread && <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
