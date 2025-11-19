import { motion } from "framer-motion";

export default function ChatList({ chats, onOpenChat, userRole }) {
  const isClient = userRole === "client";

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {chats.map((chat) => {
          const name = isClient
            ? chat.pro?.business_name ||
              `${chat.pro?.first_name || ""} ${chat.pro?.last_name || ""}`
            : `${chat.client?.first_name || ""} ${chat.client?.last_name || ""}`;

          const avatar = isClient ? chat.pro?.profile_photo : chat.client?.profile_photo;
          const service = isClient ? chat.missions?.service : null;

          // Dernier message
          const lastMessage = chat.last_message || "Image";

          // Non lu
          const unread = chat.unread_count > 0;

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
                <p
                  className={`font-semibold text-gray-800 ${unread ? "font-bold" : "font-medium"}`}
                >
                  {name}
                </p>

                {service && <p className="text-sm text-gray-500">{service}</p>}

                <p
                  className={`text-xs truncate mt-1 ${
                    unread ? "text-gray-900 font-semibold" : "text-gray-400"
                  }`}
                >
                  {lastMessage}
                </p>
              </div>

              {/* Badge non lu */}
              {unread && <div className="w-3 h-3 rounded-full bg-rose-500"></div>}

              {/* Timestamp */}
              <div className="text-xs text-gray-400 whitespace-nowrap ml-2">
                {new Date(chat.updated_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
