// src/components/modals/ProProposalModal.jsx
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";

export default function ProProposalModal({ booking, onClose, onSuccess, session }) {
  // 🧠 Extraire une heure utilisable "HH:mm" depuis le time_slot du client (ex: "Afternoon (13–18)" → "13:00")
  const extractTimeFromSlot = (slot) => {
    if (!slot) return "";
    const match = slot.match(/\((\d{2})[–-](\d{2})\)/);
    return match ? `${match[1]}:00` : "";
  };

  const [form, setForm] = useState({
    service_price: "",
    travel_fee: "",
    date: booking?.date || "",
    time: extractTimeFromSlot(booking?.time_slot),
    note: "",
  });

  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  const requiredOk = () =>
    form.service_price !== "" &&
    !Number.isNaN(parseFloat(form.service_price)) &&
    form.date &&
    form.time;

  // -------------------------------------------------------
  // 📤 Envoi de la proposition du pro
  // -------------------------------------------------------
  const handleSubmit = async () => {
    if (!requiredOk()) {
      setToast({
        message: "❌ Please fill all required fields (price, date, time).",
        type: "error",
      });
      return;
    }

    const service = parseFloat(form.service_price || 0);
    const travel = parseFloat(form.travel_fee || 0);
    const total = Number.isFinite(service + travel) ? service + travel : 0;

    setLoading(true);
    try {
      // 1) créer la mission (statut proposed)
      const { data: created, error: missionError } = await supabase
        .from("missions")
        .insert([
          {
            booking_id: booking.id, // LIEN ENTRE BOOKING ET MISSION
            client_id: booking.client_id,
            pro_id: session.user.id,
            service: booking.service,
            description: form.note || booking.notes || null,
            date: form.date, // DATE (timestamp/timestamptz côté DB)
            time: form.time, // "HH:mm" (time without time zone côté DB)
            duration: 60,
            price: total,
            status: "proposed", // doit exister dans missions_status_check
          },
        ])
        .select()
        .single();

      if (missionError) throw missionError;

      // 2) marquer la demande comme "offers" côté client (sans la lier à ce pro)
      const { error: updateBookingErr } = await supabase
        .from("bookings")
        .update({ status: "offers" }) // on ne met PAS pro_id ici → autres pros peuvent encore proposer
        .eq("id", booking.id);
      if (updateBookingErr) throw updateBookingErr;

      // 3) enlever la notif pour CE pro → la demande sort de “Pending requests” chez lui
      const { error: notifErr } = await supabase
        .from("booking_notifications")
        .delete()
        .eq("booking_id", booking.id)
        .eq("pro_id", session.user.id);
      if (notifErr) throw notifErr;

      setToast({ message: "✅ Proposal sent successfully!", type: "success" });

      // ⚡ remonter la mission créée pour rafraîchir immédiatement “Proposals Sent”
      setTimeout(() => {
        onSuccess?.(created);
        onClose?.();
      }, 600);
    } catch (err) {
      console.error("❌ handleSubmit error:", err);
      setToast({ message: `❌ ${err.message}`, type: "error" });
    } finally {
      setLoading(false);
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
        className="bg-white rounded-2xl shadow-xl w-11/12 max-w-md p-8 relative text-gray-800"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold mb-4 text-center">Propose Your Offer</h2>

        {/* Form */}
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium">Service price (€)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
              value={form.service_price}
              onChange={(e) => setForm({ ...form, service_price: e.target.value })}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Travel fee (€)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
              value={form.travel_fee}
              onChange={(e) => setForm({ ...form, travel_fee: e.target.value })}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium">Date</label>
              <input
                type="date"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium">Time</label>
              <input
                type="time"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium">Remark</label>
            <textarea
              rows="2"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Optional note..."
            />
          </div>

          {/* Rappel adresse (utile pour le pro) */}
          {booking?.address && (
            <p className="text-xs text-gray-500 mt-1">
              <strong>Address:</strong> {booking.address}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-5 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold hover:scale-[1.02] transition"
          >
            {loading ? "Sending..." : "Send proposal"}
          </button>
        </div>

        {toast && (
          <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </motion.div>
    </motion.div>
  );
}
