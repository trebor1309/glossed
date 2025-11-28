// 📄 src/components/chat/ChatHeader.jsx
import { ArrowLeft } from "lucide-react";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useNavigate } from "react-router-dom";

export default function ChatHeader({ onBack, partner, service }) {
  const isMobile = useIsMobile(768);
  const navigate = useNavigate();

  const hasProfile = !!partner?.id;

  const displayName =
    partner?.business_name ||
    partner?.username ||
    `${partner?.first_name || ""} ${partner?.last_name || ""}`.trim() ||
    "Unknown user";

  const avatar = partner?.profile_photo || "/default-avatar.png";

  const handleOpenProfile = () => {
    if (!hasProfile) return;
    navigate(`/u/${partner.id}`);
  };

  const AvatarAndName = (
    <div className="flex items-center gap-4">
      {/* Avatar */}
      <img
        src={avatar}
        alt={displayName}
        className="w-10 h-10 rounded-full object-cover bg-gray-100"
      />

      <div className="flex flex-col items-start">
        <span className="font-semibold text-gray-800">{displayName}</span>
        {service && <span className="text-xs text-gray-500">{service}</span>}
      </div>
    </div>
  );

  return (
    <div className="flex items-center gap-3 p-4 border-b bg-white shadow-sm sticky top-0 z-20">
      {/* Back only on mobile */}
      {isMobile && (
        <button onClick={onBack} className="p-2 rounded-full hover:bg-gray-100 text-gray-600">
          <ArrowLeft size={22} />
        </button>
      )}

      {hasProfile ? (
        <button
          type="button"
          onClick={handleOpenProfile}
          className="flex items-center gap-4 text-left hover:bg-gray-50 px-2 py-1 rounded-xl flex-1"
          title="View public profile"
        >
          {AvatarAndName}
        </button>
      ) : (
        <div className="flex-1">{AvatarAndName}</div>
      )}
    </div>
  );
}
