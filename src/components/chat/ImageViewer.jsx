import { useEffect } from "react";
import { X } from "lucide-react";

export default function ImageViewer({ url, onClose }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!url) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Image attachment"
    >
      <div className="relative max-h-full max-w-full" onClick={(event) => event.stopPropagation()}>
        <img
          src={url}
          className="max-h-[90dvh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
          alt="Attachment"
        />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-2 top-2 rounded-full bg-white p-2 shadow"
          aria-label="Close image"
        >
          <X size={20} className="text-gray-700" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
