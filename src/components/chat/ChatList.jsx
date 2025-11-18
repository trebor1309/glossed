import { motion } from "framer-motion";

export default function ChatList({ chats, onOpenChat, userRole }) {
  const isClient = userRole === "client";

  return (
    <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
      <ul className="divide-y divide-gray-100">
        {chats.map((chat) => {
          // Nom
          const name = isClient
            ? chat.pro?.business_name ||
              `${chat.pro?.first_name || ""} ${chat.pro?.last_name || ""}`
            : `${chat.client?.first_name || ""} ${chat.client?.last_name || ""}`;

          // Avatar
          const avatar = isClient ? chat.pro?.profile_photo : chat.client?.profile_photo;

          // Service
          const service = isClient ? chat.missions?.service : null;

          // 📌 DÉTERMINATION DU DERNIER MESSAGE
          const last = chat.messages?.[0]; // notre SELECT renvoie un tableau avec 1 élément

          const preview = last
            ? last.attachment_url
              ? "📷 Image"
              : last.content
            : "No messages yet";

          // 📌 Date/heure du dernier message
          const timestamp = last
            ? new Date(last.created_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })
            : "";

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
                alt={name}
                className="w-12 h-12 rounded-full object-cover bg-gray-100"
              />

              <div className="flex-1">
                <p className="font-semibold text-gray-800">{name}</p>

                {service && <p className="text-sm text-gray-500">{service}</p>}

                <p className="text-xs text-gray-400 truncate mt-1">{preview}</p>
              </div>

              <div className="text-xs text-gray-400">{timestamp}</div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
