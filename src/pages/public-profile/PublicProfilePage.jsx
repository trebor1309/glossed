import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";

import { fetchPublicProfile, fetchReviews } from "./profileHelpers";
import ProProfileView from "./ProProfileView";
import ClientProfileView from "./ClientProfileView";

export default function PublicProfilePage() {
  const { username } = useParams();
  const [profile, setProfile] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!username) return;

    (async () => {
      setLoading(true);

      const data = await fetchPublicProfile(username);
      const rev = await fetchReviews(data.id);

      setProfile(data);
      setReviews(rev);

      setLoading(false);
    })();
  }, [username]);

  if (loading) return <p>Loading...</p>;
  if (!profile) return <p>User not found.</p>;

  return (
    <section className="max-w-4xl mx-auto p-6">
      {profile.role === "pro" ? (
        <ProProfileView profile={profile} reviews={reviews} />
      ) : (
        <ClientProfileView profile={profile} reviews={reviews} />
      )}
    </section>
  );
}
