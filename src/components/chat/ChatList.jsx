// 📄 src/components/chat/ChatList.jsx
import { motion } from "framer-motion";

export default function ChatList({ chats, onOpenChat, userRole, unreadMap }) {
  const isClient = userRole === "client";

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {chats.map((chat) => {
          // 📌 Nom affiché
          const name = isClient
            ? chat.pro?.business_name ||
              `${chat.pro?.first_name || ""} ${chat.pro?.last_name || ""}`.trim()
            : `${chat.client?.first_name || ""} ${chat.client?.last_name || ""}`.trim();

          // 📌 Avatar
          const avatar = isClient ? chat.pro?.profile_photo : chat.client?.profile_photo;

          // 📌 Service (uniquement côté client)
          const service = isClient ? chat.missions?.service : null;

          // 📌 Preview du dernier message
          let previewText = "No messages yet";
          if (chat.last_message) {
            previewText = chat.last_message.startsWith("📷")
              ? "📷 Photo"
              : chat.last_message;
          }

          // 📌 Date / heure du dernier update
          let timestamp = "";
          if (chat.updated_at) {
            const d = new Date(chat.updated_at);
            timestamp = d.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
          }

          // 📌 Non-lu ?
          const hasUnread = !!unreadMap?.[chat.id];

          return (
            <motion.li
              key={chat.id}
              className="p-4 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition"
              onClick={() => onOpenChat(chat)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Avatar */}
              <img
                src={avatar || "/default-avatar.png"}
                alt={name || "User"}
                className="w-12 h-12 rounded-full object-cover bg-gray-100 flex-shrink-0"
              />

              {/* Infos principales */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{name || "Unknown user"}</p>

                {/* Service seulement côté client */}
                {isClient && service && (
                  <p className="text-sm text-gray-500 truncate">{service}</p>
                )}

                {/* Dernier message */}
                <p className="text-xs text-gray-400 truncate mt-1">{previewText}</p>
              </div>

              {/* Colonne droite : horaire + badge non lu */}
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {timestamp && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">{timestamp}</span>
                )}

                {hasUnread && (
                  <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" aria-hidden />
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
