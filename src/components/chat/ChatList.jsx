// 📄 src/components/chat/ChatList.jsx
import { motion } from "framer-motion";

export default function ChatList({ chats, onOpenChat, userRole }) {
  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {chats.map((chat) => {
          const name =
            userRole === "client"
              ? chat.pro?.business_name ||
                `${chat.pro?.first_name || ""} ${chat.pro?.last_name || ""}`
              : `${chat.client?.first_name || ""} ${chat.client?.last_name || ""}`;

          const service = chat.missions?.service || "Service";

          return (
            <motion.li
              key={chat.id}
              className="p-4 flex items-center gap-4 hover:bg-gray-50 cursor-pointer transition"
              onClick={() => onOpenChat(chat)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              {/* Avatar */}
              <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center font-semibold uppercase">
                {name?.charAt(0)}
              </div>

              {/* Infos */}
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{name}</p>
                <p className="text-sm text-gray-500">{service}</p>

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
