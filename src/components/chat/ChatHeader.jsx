// 📄 src/components/chat/ChatHeader.jsx
import { ArrowLeft } from "lucide-react";

export default function ChatHeader({ onBack, partner, service }) {
  const displayName =
    partner?.business_name || `${partner?.first_name || ""} ${partner?.last_name || ""}`.trim();

  const avatar = partner?.profile_photo || "/default-avatar.png";

  return (
    <div className="flex items-center gap-4 p-4 border-b bg-white shadow-sm">
      {/* Mobile: Back button */}
      <button
        onClick={onBack}
        className="md:hidden p-2 rounded-full hover:bg-gray-100 text-gray-600"
      >
        <ArrowLeft size={22} />
      </button>

      {/* Avatar */}
      <img
        src={avatar}
        alt={displayName}
        className="w-10 h-10 rounded-full object-cover bg-gray-100"
      />

      <div className="flex flex-col">
        <span className="font-semibold text-gray-800">{displayName}</span>

        {service && <span className="text-xs text-gray-500">{service}</span>}
      </div>
    </div>
  );
}
