// 📄 src/components/chat/ImageViewer.jsx
import { X } from "lucide-react";

export default function ImageViewer({ url, onClose }) {
  if (!url) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn"
    >
      <div className="relative max-w-[90%] max-h-[90%]">
        <img
          src={url}
          className="rounded-xl shadow-2xl object-contain max-h-[90vh] max-w-[90vw]"
          alt="Attachment"
        />
        <button
          onClick={onClose}
          className="absolute -top-4 -right-4 bg-white p-2 rounded-full shadow"
        >
          <X size={20} className="text-gray-700" />
        </button>
      </div>
    </div>
  );
}
