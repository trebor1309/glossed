import { motion } from "framer-motion";
import { X, Star } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

/* ---------------------------------------------------------
   ⭐ Modal d'évaluation client (Pro)
--------------------------------------------------------- */
export default function ProEvaluationModal({ booking, onClose, onSuccess }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!booking) return null;

  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      // ✅ insertion dans table reviews
      const { error } = await supabase.from("reviews").insert([
        {
          booking_id: booking.id,
          pro_id: booking.pro_id,
          client_id: booking.client_id,
          rating,
          comment,
        },
      ]);

      if (error) throw error;

      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      console.error("❌ Error submitting review:", err.message);
      alert("Error submitting review: " + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-xl w-11/12 max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* ❌ Fermer */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 transition"
        >
          <X size={22} />
        </button>

        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <Star size={20} className="text-amber-500" /> Rate your client
        </h2>

        <p className="text-gray-600 text-sm mb-4">How was your experience with this client?</p>

        {/* ⭐ Notation */}
        <div className="flex justify-center gap-2 mb-6">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              onMouseEnter={() => setHover(star)}
              onMouseLeave={() => setHover(0)}
              className="focus:outline-none"
            >
              <Star
                size={32}
                className={`transition ${
                  (hover || rating) >= star ? "text-amber-400 fill-amber-400" : "text-gray-300"
                }`}
              />
            </button>
          ))}
        </div>

        {/* 💬 Commentaire */}
        <textarea
          placeholder="Leave a comment (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows="3"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-rose-500 focus:outline-none"
        />

        {/* ✅ Actions */}
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded-full font-medium hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || submitting}
            className="px-5 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.03] transition disabled:opacity-60"
          >
            {submitting ? "Submitting..." : "Submit Review"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
