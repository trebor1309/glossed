import { Star } from "lucide-react";

export default function ProfileReviews({ reviews }) {
  if (!reviews || reviews.length === 0) {
    return <p className="text-sm text-gray-500 italic">No reviews yet.</p>;
  }

  return (
    <div className="space-y-4">
      {reviews.map((r) => (
        <div key={r.id} className="p-4 border rounded-xl bg-white shadow-sm flex gap-3">
          <img
            src={r.reviewer?.profile_photo || "/default-avatar.png"}
            className="w-12 h-12 rounded-full object-cover"
            alt=""
          />

          <div className="flex-1">
            <p className="font-medium">{r.reviewer?.username}</p>

            <div className="flex items-center gap-1 text-yellow-500 text-sm">
              {Array.from({ length: r.rating }).map((_, i) => (
                <Star key={i} size={14} fill="gold" />
              ))}
            </div>

            <p className="text-gray-700 mt-1">{r.comment}</p>

            <p className="text-xs text-gray-400 mt-1">
              {new Date(r.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
