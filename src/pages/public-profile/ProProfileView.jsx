import { Briefcase, MapPin, MessageCircle, Calendar } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import useStartChat from "@/components/chat/hooks/useStartChat";

import ProfilePortfolio from "./ProfilePortfolio";
import ProfileReviews from "./ProfileReviews";
import ProfileMap from "./ProfileMap";

export default function ProProfileView({ profile, reviews }) {
  const navigate = useNavigate();
  const startChat = useStartChat();
  const { user, isClient, isPro } = useUser();

  /* -------------------------------------------------------------
     CONTACT BUTTON
     - client -> pro seulement
     - pro ne peut PAS contacter un autre pro
  ------------------------------------------------------------- */
  const handleContact = async () => {
    if (!user) return navigate("/login");

    if (isPro) {
      alert("Pros cannot contact other pros.");
      return;
    }

    await startChat({
      proId: profile.id,
      clientId: user.id,
      missionId: null,
    });
  };

  /* -------------------------------------------------------------
     BOOK A SERVICE
     - on envoie vers DashboardNew avec ?pro=ID
     - DashboardNew devra filtrer les services proposés par ce pro
  ------------------------------------------------------------- */
  const handleBooking = () => {
    if (!user) return navigate("/login");

    navigate(`/dashboard/new?pro=${profile.id}`);
  };

  return (
    <div className="space-y-10">
      {/* HEADER */}
      <div className="text-center space-y-3">
        <img
          src={profile.profile_photo || "/default-avatar.png"}
          className="w-28 h-28 rounded-full mx-auto object-cover"
        />

        <h1 className="text-2xl font-bold">{profile.business_name || profile.username}</h1>

        {profile.description && (
          <p className="text-gray-600 max-w-xl mx-auto">{profile.description}</p>
        )}

        <div className="flex justify-center gap-2 mt-3 flex-wrap">
          {profile.services?.map((s, i) => (
            <span key={i} className="px-3 py-1 rounded-full bg-rose-100 text-rose-600 text-sm">
              {s}
            </span>
          ))}
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-4 mt-4">
          {/* CONTACT */}
          <button
            onClick={handleContact}
            className="px-5 py-2 bg-rose-600 text-white rounded-full flex items-center gap-2"
          >
            <MessageCircle size={18} /> Contact
          </button>

          {/* BOOK SERVICE */}
          <button
            onClick={handleBooking}
            className="px-5 py-2 bg-gray-100 rounded-full flex items-center gap-2"
          >
            <Calendar size={18} /> Book a Service
          </button>
        </div>
      </div>

      {/* Portfolio */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Portfolio</h2>
        <ProfilePortfolio portfolio={profile.portfolio} />
      </div>

      {/* Working Area Map */}
      {profile.latitude && profile.longitude && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Working Area</h2>
          <ProfileMap
            lat={profile.latitude}
            lng={profile.longitude}
            radius={profile.radius_km || 10}
          />
        </div>
      )}

      {/* Reviews */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Reviews</h2>
        <ProfileReviews reviews={reviews} />
      </div>
    </div>
  );
}
