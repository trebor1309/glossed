import { motion } from "framer-motion";
import UserAvatar from "./UserAvatar";

export default function ChatList({ chats, onOpenChat, unreadMap }) {
  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
      <ul className="min-w-0 divide-y divide-gray-100">
        {chats.map((chat) => {
          const partner = chat.partner;
          const name =
            partner?.business_name ||
            partner?.username ||
            `${partner?.first_name || ""} ${partner?.last_name || ""}`.trim() ||
            "Glossed user";
          const service = chat.missions?.service;
          const last = chat.last_message_obj;

          let previewText = "No messages yet";
          if (last?.attachment_url && !last.content?.trim()) previewText = "Photo";
          else if (last?.content?.trim()) previewText = last.content;

          const timestamp =
            last?.created_at || chat.updated_at
              ? new Date(last?.created_at || chat.updated_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })
              : "";
          const hasUnread = Boolean(unreadMap?.[chat.id]);

          return (
            <motion.li
              key={chat.id}
              className="min-w-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <button
                type="button"
                className="grid w-full min-w-0 max-w-full grid-cols-[auto,minmax(0,1fr),auto] items-center gap-3 px-3 py-4 text-left transition hover:bg-gray-50 sm:gap-4 sm:px-4"
                onClick={() => onOpenChat(chat)}
              >
                <UserAvatar src={partner?.profile_photo} name={name} className="h-12 w-12" />

                <span className="min-w-0">
                  <span className="block truncate font-semibold text-gray-800">{name}</span>
                  {service && (
                    <span className="block truncate text-sm text-gray-500">{service}</span>
                  )}
                  <span className="mt-1 block truncate text-xs text-gray-400">{previewText}</span>
                </span>

                <span className="flex shrink-0 flex-col items-end gap-1 self-stretch pt-1">
                  {timestamp && (
                    <span className="whitespace-nowrap text-xs text-gray-400">{timestamp}</span>
                  )}
                  {hasUnread && (
                    <span
                      className="inline-block h-2 w-2 rounded-full bg-rose-500"
                      aria-label="Unread messages"
                    />
                  )}
                </span>
              </button>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
