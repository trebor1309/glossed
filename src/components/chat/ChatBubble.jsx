import { useEffect, useState } from "react";
import { createSignedStorageUrl } from "@/lib/storageUrls";

export default function ChatBubble({ msg, isOwn, onImageClick }) {
  const isImage = Boolean(msg.attachment_url);
  const [attachmentUrl, setAttachmentUrl] = useState(null);
  const [attachmentError, setAttachmentError] = useState(false);

  useEffect(() => {
    let active = true;
    if (!msg.attachment_url) {
      setAttachmentUrl(null);
      setAttachmentError(false);
      return () => {
        active = false;
      };
    }

    setAttachmentError(false);
    createSignedStorageUrl("chat_attachments", msg.attachment_url)
      .then((url) => {
        if (!active) return;
        setAttachmentUrl(url);
        setAttachmentError(!url);
      })
      .catch((error) => {
        console.error("Unable to sign chat attachment:", error);
        if (active) {
          setAttachmentUrl(null);
          setAttachmentError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [msg.attachment_url]);

  const createdAt = msg.created_at ? new Date(msg.created_at) : null;
  const timeLabel = createdAt
    ? createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "";
  const rawContent = msg.content || "";
  const isSystem = rawContent.startsWith("[system]");
  const displayContent = isSystem ? rawContent.replace(/^\[system\]\s*/, "") : rawContent;

  if (isSystem && !isImage) {
    return (
      <div className="flex min-w-0 justify-center px-3 py-2">
        <div className="max-w-full break-words rounded-full bg-gray-100 px-3 py-1 text-center text-xs text-gray-500 shadow-sm">
          {displayContent}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 ${isOwn ? "justify-end" : "justify-start"}`}>
      <div
        className={`min-w-0 max-w-[85%] overflow-hidden rounded-2xl px-4 py-2 shadow sm:max-w-[75%] ${
          isOwn
            ? "rounded-br-none bg-gradient-to-r from-rose-500 to-red-500 text-white"
            : "rounded-bl-none bg-gray-100 text-gray-800"
        }`}
      >
        {isImage && attachmentUrl && (
          <button
            type="button"
            className="mb-2 block max-w-full cursor-zoom-in overflow-hidden rounded-xl"
            onClick={() => onImageClick?.(attachmentUrl)}
            aria-label="Open image attachment"
          >
            <img
              src={attachmentUrl}
              alt="Attachment"
              className="max-h-64 max-w-full object-contain transition hover:opacity-90"
            />
          </button>
        )}

        {isImage && !attachmentUrl && (
          <p className="text-sm opacity-80">
            {attachmentError ? "Image unavailable" : "Loading image..."}
          </p>
        )}
        {displayContent && <p className="whitespace-pre-wrap break-words">{displayContent}</p>}

        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
          {timeLabel && <span>{timeLabel}</span>}
          {isOwn && (
            <span className={msg.read_at ? "text-rose-200" : "text-gray-300"}>
              {msg.read_at ? "✓✓" : "✓"}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
