// 📄 src/components/chat/ChatList.jsx
import { motion } from "framer-motion";

export default function ChatList({ chats, onOpenChat, userRole, unreadMap }) {
  const isClient = userRole === "client";

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {chats.map((chat) => {
          const name = isClient
            ? chat.pro?.business_name ||
              `${chat.pro?.first_name || ""} ${chat.pro?.last_name || ""}`.trim()
            : `${chat.client?.first_name || ""} ${chat.client?.last_name || ""}`.trim();

          const avatar = isClient ? chat.pro?.profile_photo : chat.client?.profile_photo;
          const service = isClient ? chat.missions?.service : null;

          // --- PREVIEW MESSAGE ---
          let previewText = "No messages yet";

          if (chat.last_message) {
            if (chat.last_message.startsWith("📷")) previewText = "📷 Photo";
            else previewText = chat.last_message;
          }

          // --- TIMESTAMP FORMAT ---
          let timestamp = "";
          if (chat.updated_at) {
            const d = new Date(chat.updated_at);

            const now = new Date();
            const isToday = d.toDateString() === now.toDateString();

            const yesterday = new Date();
            yesterday.setDate(now.getDate() - 1);
            const isYesterday = d.toDateString() === yesterday.toDateString();

            if (isToday) {
              timestamp = d.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });
            } else if (isYesterday) {
              timestamp = "Yesterday";
            } else {
              timestamp = d.toLocaleDateString();
            }
          }

          // --- UNREAD LOGIC ---
          const hasUnread = unreadMap?.[chat.id] === true;

          return (
            <motion.li
              key={chat.id}
              className="p-4 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition"
              onClick={() => onOpenChat(chat)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <img
                src={avatar || "/default-avatar.png"}
                alt={name || "User"}
                className="w-12 h-12 rounded-full object-cover bg-gray-100 flex-shrink-0"
              />

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-800 truncate">{name || "Unknown user"}</p>

                {isClient && service && (
                  <p className="text-sm text-gray-500 truncate">{service}</p>
                )}

                <p className="text-xs text-gray-400 truncate mt-1">{previewText}</p>
              </div>

              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                {timestamp && (
                  <span className="text-xs text-gray-400 whitespace-nowrap">{timestamp}</span>
                )}

                {hasUnread && (
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                )}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
