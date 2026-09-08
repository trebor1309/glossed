export default function ClientProfileView({ profile }) {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <img
          src={profile.profile_photo || "/default-avatar.png"}
          alt={profile.username || "Glossed client"}
          className="mx-auto h-24 w-24 rounded-full object-cover"
        />

        <h1 className="mt-3 text-2xl font-bold">{profile.username}</h1>

        {profile.city && profile.country && (
          <p className="text-gray-500">
            {profile.city}, {profile.country}
          </p>
        )}
      </div>
    </div>
  );
}
