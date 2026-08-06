import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { X, Calendar, Clock, MapPin, FileText, User, Trash2, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function ProBookingDetailsModal({ booking, onClose, onMakeProposal, onDelete }) {
  const [client, setClient] = useState(null);

  useEffect(() => {
    if (!booking?.id) return;

    // 🖼️ Charger les photos jointes
    // 👤 Charger les infos du client
    (async () => {
      const { data } = await supabase.rpc("get_user_summary", {
        p_user_id: booking.client_id,
      });
      setClient(data?.[0] || null);
    })();
  }, [booking?.id]);

  if (!booking) return null;

  return (
    <motion.div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-3xl shadow-2xl w-11/12 max-w-lg p-6 relative overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* ✖ Bouton fermeture */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition"
        >
          <X size={22} />
        </button>

        {/* 🧾 Titre */}
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <FileText size={20} className="text-rose-500" /> Booking details
        </h2>

        {/* 💬 Contenu principal */}
        <div className="space-y-3 text-gray-700">
          <p>
            <strong>Service:</strong> {booking.service}
          </p>

          <p className="flex items-center gap-2">
            <Calendar size={16} className="text-rose-500" />
            {booking.date ? new Date(booking.date).toLocaleDateString() : "No date"}
          </p>

          {booking.time_slot && (
            <p className="flex items-center gap-2">
              <Clock size={16} className="text-rose-500" />
              {booking.time_slot}
            </p>
          )}

          {booking.address && (
            <p className="flex items-center gap-2">
              <MapPin size={16} className="text-rose-500" />
              {booking.address}
            </p>
          )}

          {booking.notes && (
            <p className="italic text-sm text-gray-500 bg-gray-50 rounded-lg p-2">
              “{booking.notes}”
            </p>
          )}

          {/* 🧭 Mini carte */}
          {booking.address && (
            <motion.iframe
              title="map"
              className="rounded-2xl mt-3 w-full h-48 border"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              src={`https://www.google.com/maps?q=${encodeURIComponent(
                booking.address
              )}&output=embed`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            ></motion.iframe>
          )}

          {/* 🖼️ Images jointes */}
          {/* 👤 Client */}
          {client && (
            <motion.div
              className="mt-4 flex items-center gap-3 p-3 rounded-2xl bg-gradient-to-r from-pink-50 to-rose-50 border border-rose-100 shadow-sm"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <img
                src={client.profile_photo || "/placeholder-user.jpg"}
                alt=""
                className="w-12 h-12 rounded-full object-cover border border-rose-100"
              />
              <div>
                <p className="font-semibold text-gray-800">
                  {client.first_name} {client.last_name}
                </p>
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <User size={12} /> Client
                </p>
              </div>
            </motion.div>
          )}
        </div>

        {/* ⚙️ Actions */}
        <motion.div
          className="mt-8 flex flex-wrap justify-end gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <button
            onClick={() => onMakeProposal?.(booking)}
            className="px-5 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.03] transition flex items-center gap-2 shadow-sm"
          >
            <Send size={16} /> Make proposal
          </button>

          <button
            onClick={() => onDelete?.(booking)}
            className="px-4 py-2 border border-red-200 text-red-600 rounded-full font-medium hover:bg-red-50 transition flex items-center gap-2"
          >
            <Trash2 size={16} /> Delete
          </button>

          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded-full font-medium hover:bg-gray-100 transition"
          >
            Close
          </button>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}
