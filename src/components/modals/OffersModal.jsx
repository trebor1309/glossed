import { motion } from "framer-motion";
import { X, Check, User } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function OffersModal({ booking, onClose, onAccept }) {
  if (!booking) return null;

  const offers = booking.offers || [];

  const handleAccept = async (offer) => {
    const { error } = await supabase
      .from("bookings")
      .update({
        status: "confirmed",
        pro_id: offer.pro_id,
        accepted_offer: offer,
      })
      .eq("id", booking.id);

    if (!error) onAccept?.(booking.id, offer);
    onClose();
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[10000]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-xl w-11/12 max-w-lg p-6 relative"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold text-gray-800 mb-2">
          Offers for {booking.service}
        </h2>
        <p className="text-sm text-gray-500 mb-5">
          {booking.date} — {booking.time_slot}
        </p>

        {offers.length ? (
          <ul className="space-y-4 max-h-[50vh] overflow-y-auto">
            {offers.map((offer, i) => (
              <li
                key={i}
                className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition"
              >
                <div className="flex items-center gap-3 mb-2">
                  <User size={18} className="text-rose-500" />
                  <p className="font-medium text-gray-800">{offer.pro_name}</p>
                </div>
                <p className="text-sm text-gray-600 mb-2">{offer.message}</p>
                <div className="flex justify-between items-center">
                  <p className="font-semibold text-rose-600">
                    {offer.price} €
                  </p>
                  <button
                    onClick={() => handleAccept(offer)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white hover:scale-105 transition"
                  >
                    <Check size={14} /> Accept
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-gray-500 text-sm italic">
            No offers have been received yet.
          </p>
        )}
      </motion.div>
    </motion.div>
  );
}
