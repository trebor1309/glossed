// 📄 src/components/chat/ChatHeader.jsx
import { ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";

export default function ChatHeader({ onBack, partner, service }) {
  const isMobile = useIsMobile(768);

  const displayName =
    partner?.business_name ||
    `${partner?.first_name || ""} ${partner?.last_name || ""}`.trim() ||
    "Unknown";

  const avatar = partner?.profile_photo || "/default-avatar.png";

  return (
    <div className="flex items-center gap-4 p-4 border-b bg-white shadow-sm">
      {/* Back only on mobile */}
      {isMobile && (
        <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 text-gray-600">
          <ArrowLeft size={22} />
        </button>
      )}

      {/* Avatar */}
      <img
        src={avatar}
        alt={displayName}
        className="w-10 h-10 rounded-full object-cover bg-gray-100"
      />

      <div className="flex flex-col">
        <span className="font-semibold text-gray-800">{displayName}</span>

        {/* Show service ONLY for client dashboard */}
        {service && <span className="text-xs text-gray-500">{service}</span>}
      </div>
    </div>
  );
}
