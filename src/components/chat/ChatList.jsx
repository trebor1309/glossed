// 📄 src/components/chat/ChatList.jsx
import { motion } from "framer-motion";

export default function ChatList({ chats, onOpenChat, userRole, unreadMap }) {
  const isClient = userRole === "client";

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {chats.map((chat) => {
          // --- Rôle courant : le client voit le pro, le pro voit le client ---
          const partner = isClient ? chat.pro : chat.client;

          // 🧾 Nom affiché : business_name > username > first+last
          const name =
            partner?.business_name ||
            partner?.username ||
            `${partner?.first_name || ""} ${partner?.last_name || ""}`.trim() ||
            "Glossed user";

          const avatar = partner?.profile_photo || "/default-avatar.png";

          // Service seulement côté client
          const service = isClient ? chat.missions?.service : null;

          // Dernier message objet
          const last = chat.last_message_obj || null;

          let previewText = "No messages yet";
          if (last) {
            if (last.attachment_url && !last.content) {
              previewText = "📷 Photo";
            } else if (last.content && last.content.trim().length > 0) {
              previewText = last.content;
            } else if (last.attachment_url) {
              previewText = "📷 Photo";
            }
          }

          // Heure = celle du dernier message, fallback sur updated_at
          let timestamp = "";
          const tsSource = last?.created_at || chat.updated_at;
          if (tsSource) {
            const d = new Date(tsSource);
            timestamp = d.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
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
              <img
                src={avatar}
                alt={name}
                className="w-12 h-12 rounded-full object-cover bg-gray-100 flex-shrink-0"
              />

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{name}</p>

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
