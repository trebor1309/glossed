// 📄 src/components/chat/ChatBubble.jsx
import { useEffect, useState } from "react";
import { createSignedStorageUrl } from "@/lib/storageUrls";

export default function ChatBubble({ msg, isOwn, onImageClick }) {
  const isImage = !!msg.attachment_url;
  const [attachmentUrl, setAttachmentUrl] = useState(null);

  useEffect(() => {
    let active = true;

    if (!msg.attachment_url) {
      setAttachmentUrl(null);
      return () => {
        active = false;
      };
    }

    createSignedStorageUrl("chat_attachments", msg.attachment_url)
      .then((url) => {
        if (active) setAttachmentUrl(url);
      })
      .catch((error) => {
        console.error("Unable to sign chat attachment:", error);
        if (active) setAttachmentUrl(null);
      });

    return () => {
      active = false;
    };
  }, [msg.attachment_url]);

  const createdAt = msg.created_at ? new Date(msg.created_at) : null;
  const timeLabel = createdAt
    ? createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";

  const isRead = !!msg.read_at;

  const rawContent = msg.content || "";
  const isSystem = rawContent.startsWith("[system]");
  const displayContent = isSystem ? rawContent.replace(/^\[system\]\s*/, "") : rawContent;

  // 🎛 Rendu spécial pour messages "system"
  if (isSystem && !isImage) {
    return (
      <div className="flex justify-center my-2 px-3">
        <div className="px-3 py-1 rounded-full bg-gray-100 text-gray-500 text-xs text-center shadow-sm">
          {displayContent}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 shadow
        ${
          isOwn
            ? "bg-gradient-to-r from-rose-500 to-red-500 text-white rounded-br-none"
            : "bg-gray-100 text-gray-800 rounded-bl-none"
        }`}
      >
        {/* IMAGE */}
        {isImage && attachmentUrl && (
          <img
            src={attachmentUrl}
            alt="Attachment"
            onClick={() => onImageClick?.(attachmentUrl)}
            className="rounded-xl shadow-md max-h-64 mb-2 object-cover cursor-pointer hover:opacity-90 transition"
          />
        )}

        {/* TEXTE */}
        {displayContent && <p className="whitespace-pre-line">{displayContent}</p>}

        {/* HEURE + STATUT */}
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
