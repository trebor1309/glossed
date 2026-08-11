import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useIsMobile } from "@/hooks/useIsMobile";
import UserAvatar from "./UserAvatar";

export default function ChatHeader({ onBack, partner, service }) {
  const isMobile = useIsMobile(768);
  const navigate = useNavigate();
  const hasProfile = Boolean(partner?.id);
  const displayName =
    partner?.business_name ||
    partner?.username ||
    `${partner?.first_name || ""} ${partner?.last_name || ""}`.trim() ||
    "Glossed user";

  const profile = (
    <span className="flex min-w-0 items-center gap-3 sm:gap-4">
      <UserAvatar src={partner?.profile_photo} name={displayName} />
      <span className="min-w-0 text-left">
        <span className="block truncate font-semibold text-gray-800">{displayName}</span>
        {service && <span className="block truncate text-xs text-gray-500">{service}</span>}
      </span>
    </span>
  );

  return (
    <header className="sticky top-0 z-20 flex w-full min-w-0 max-w-full items-center gap-2 border-b bg-white p-3 shadow-sm sm:gap-3 sm:p-4">
      {isMobile && (
        <button
          type="button"
          onClick={onBack}
          className="shrink-0 rounded-full p-2 text-gray-600 hover:bg-gray-100"
          aria-label="Back to conversations"
        >
          <ArrowLeft size={22} aria-hidden="true" />
        </button>
      )}

      {hasProfile ? (
        <button
          type="button"
          onClick={() => navigate(`/profile/${partner.id}`)}
          className="min-w-0 flex-1 rounded-xl px-2 py-1 text-left hover:bg-gray-50"
          title="View public profile"
        >
          {profile}
        </button>
      ) : (
        <span className="min-w-0 flex-1 px-2 py-1">{profile}</span>
      )}
    </header>
  );
}
