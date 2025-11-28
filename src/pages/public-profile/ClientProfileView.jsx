export default function ClientProfileView({ profile, reviews }) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <img
          src={profile.profile_photo || "/default-avatar.png"}
          className="w-24 h-24 rounded-full mx-auto object-cover"
        />

        <h1 className="text-2xl font-bold mt-3">{profile.username}</h1>

        {profile.city && profile.country && (
          <p className="text-gray-500">
            {profile.city}, {profile.country}
          </p>
        )}
      </div>

      {/* Reviews */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Reviews</h2>
        <ProfileReviews reviews={reviews} />
      </div>
    </div>
  );
}
