// 📄 src/components/chat/ChatList.jsx
import { motion } from "framer-motion";

export default function ChatList({ chats, onOpenChat, userRole }) {
  const isClient = userRole === "client";

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {chats.map((chat) => {
          // 📌 Nom affiché
          const name = isClient
            ? chat.pro?.business_name ||
              `${chat.pro?.first_name || ""} ${chat.pro?.last_name || ""}`
            : `${chat.client?.first_name || ""} ${chat.client?.last_name || ""}`;

          // 📌 Avatar
          const avatar = isClient ? chat.pro?.profile_photo : chat.client?.profile_photo;

          // 📌 Service (uniquement pour client)
          const service = chat.missions?.service || null;

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
                alt={name}
                className="w-12 h-12 rounded-full object-cover bg-gray-100"
              />

              {/* Infos */}
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{name}</p>

                {/* Afficher le service UNIQUEMENT côté client */}
                {isClient && service && <p className="text-sm text-gray-500">{service}</p>}

                {/* Dernier message */}
                <p className="text-xs text-gray-400 truncate mt-1">
                  {chat.last_message || "No messages yet"}
                </p>
              </div>

              {/* Timestamp */}
              <div className="text-xs text-gray-400">
                {new Date(chat.updated_at).toLocaleDateString()}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
