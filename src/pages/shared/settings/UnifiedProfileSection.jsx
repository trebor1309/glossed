// 📄 src/pages/shared/settings/UnifiedProfileSection.jsx
import { useUser } from "@/context/UserContext";
import { CheckCircle2, Star } from "lucide-react";

export default function UnifiedProfileSection() {
  const { user, isPro } = useUser();

  if (!user) return null;

  const firstLetter =
    user.first_name?.[0]?.toUpperCase() ||
    user.last_name?.[0]?.toUpperCase() ||
    user.username?.[0]?.toUpperCase() ||
    "?";

  const profilePhoto = user.profile_photo || null;

  const verificationStatus = user.verification_status || "verified"; // default: verified
  const portfolio = Array.isArray(user.portfolio) ? user.portfolio : [];

  return (
    <section className="bg-white rounded-2xl shadow-md p-6 border border-gray-200">
      {/* HEADER */}
      <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
        Profile
        {verificationStatus === "verified" && (
          <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            <CheckCircle2 size={14} />
            Verified
          </span>
        )}
      </h3>

      {/* PROFILE HEADER */}
      <div className="flex items-center gap-5">
        {/* Avatar */}
        <div className="relative">
          {profilePhoto ? (
            <img
              src={profilePhoto}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border shadow-md"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-r from-rose-600 to-red-600 flex items-center justify-center text-white text-3xl font-bold shadow-md">
              {firstLetter}
            </div>
          )}
        </div>

        {/* Name + Email */}
        <div className="flex flex-col">
          <p className="text-xl font-semibold text-gray-800">
            {user.first_name} {user.last_name}
          </p>

          <p className="text-gray-500 text-sm">{user.email}</p>

          {isPro && user.business_name && (
            <p className="text-gray-500 text-sm italic">{user.business_name}</p>
          )}
        </div>
      </div>

      {/* PORTFOLIO PREVIEW (pro only) */}
      {isPro && portfolio.length > 0 && (
        <div className="mt-6">
          <h4 className="font-medium text-gray-700 mb-2 flex items-center gap-2">
            <Star size={16} className="text-rose-500" />
            Portfolio Preview
          </h4>

          <div className="grid grid-cols-3 gap-3">
            {portfolio.slice(0, 3).map((url, i) => (
              <img
                key={`${url}-${i}`}
                src={url}
                alt="Portfolio item"
                className="w-full h-24 object-cover rounded-lg shadow border"
              />
            ))}

            {portfolio.length > 3 && (
              <div className="w-full h-24 flex items-center justify-center text-sm text-gray-500 border rounded-lg bg-gray-50">
                +{portfolio.length - 3} more
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
