// src/components/chat/ChatBubble.jsx
import { motion } from "framer-motion";

export default function ChatBubble({ msg, isOwn }) {
  const createdAt = msg.created_at ? new Date(msg.created_at) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOwn ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`px-4 py-2 rounded-2xl max-w-[75%] text-sm leading-relaxed ${
          isOwn
            ? "bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-br-none shadow-sm"
            : "bg-gray-100 text-gray-800 rounded-bl-none shadow-sm"
        }`}
      >
        <div>{msg.message}</div>

        {createdAt && (
          <div className="text-[10px] opacity-70 mt-1 text-right">
            {createdAt.toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
