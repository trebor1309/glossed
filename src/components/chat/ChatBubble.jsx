// 📄 src/components/chat/ChatBubble.jsx
export default function ChatBubble({ msg, isOwn, onImageClick }) {
  const isImage = !!msg.attachment_url;
  const createdAt = msg.created_at ? new Date(msg.created_at) : null;

  const timeLabel = createdAt
    ? createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const isRead = !!msg.read_at;

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`
          max-w-[75%] rounded-2xl px-4 py-2 shadow 
          ${
            isOwn
              ? "bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-br-none"
              : "bg-gray-100 text-gray-800 rounded-bl-none"
          }
        `}
      >
        {/* IMAGE */}
        {isImage && (
          <img
            src={msg.attachment_url}
            alt="Attachment"
            onClick={() => onImageClick?.(msg.attachment_url)}
            className="rounded-xl shadow-md max-h-64 mb-2 object-cover cursor-pointer hover:opacity-90 transition"
          />
        )}

        {/* TEXTE */}
        {msg.content && <p className="whitespace-pre-line">{msg.content}</p>}

        {/* Heure + statut */}
        <p className="text-[10px] mt-1 opacity-80 flex items-center justify-end gap-1">
          {timeLabel && <span>{timeLabel}</span>}

          {isOwn && (
            <span className={isRead ? "text-rose-200" : "text-gray-300"}>
              {isRead ? "✓✓" : "✓"}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
