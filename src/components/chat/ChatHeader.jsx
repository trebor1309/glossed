// 📄 src/components/chat/ChatHeader.jsx
import { ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useNavigate } from "react-router-dom";

export default function ChatHeader({ onBack, partner, service }) {
  const isMobile = useIsMobile(768);
  const navigate = useNavigate();

  const displayName =
    partner?.business_name ||
    `${partner?.first_name || ""} ${partner?.last_name || ""}`.trim() ||
    "Unknown";

  const avatar = partner?.profile_photo || "/default-avatar.png";

  const openProfile = () => {
    if (partner?.id) navigate(`/profile/${partner.id}`);
  };

  return (
    <div className="flex items-center gap-4 p-4 border-b bg-white shadow-sm sticky top-0 z-20">
      {isMobile && (
        <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 text-gray-600">
          <ArrowLeft size={22} />
        </button>
      )}

      <img
        src={avatar}
        alt={displayName}
        onClick={openProfile}
        className="w-10 h-10 rounded-full object-cover bg-gray-100 cursor-pointer"
      />

      <div className="flex flex-col cursor-pointer" onClick={openProfile}>
        <span className="font-semibold text-gray-800 hover:underline">{displayName}</span>
        {service && <span className="text-xs text-gray-500">{service}</span>}
      </div>
    </div>
  );
}
