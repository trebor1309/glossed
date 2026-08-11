// src/components/modals/ProProposalModal.jsx
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";

export default function ProProposalModal({ booking, onClose, onSuccess }) {
  // 🧠 Extract "HH:mm" from a slot like "Afternoon (13–18)" → "13:00"
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

  const handleSubmit = async () => {
    if (!form.service_price || !form.date || !form.time) {
      setToast({ message: "❌ Please fill all required fields", type: "error" });
      return;
    }

    const servicePrice = parseFloat(form.service_price || 0);
    const travelFee = parseFloat(form.travel_fee || 0);

    setLoading(true);
    try {
      const { data, error: missionError } = await supabase.rpc("create_mission_proposal", {
        p_booking_id: booking.id,
        p_service_price: servicePrice,
        p_travel_fee: travelFee,
        p_date: form.date,
        p_time: form.time,
        p_note: form.note || null,
      });
      if (missionError) throw missionError;
      const created = Array.isArray(data) ? data[0] : data;

      setToast({ message: "✅ Proposal sent successfully!", type: "success" });
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
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold mb-4 text-center">Propose Your Offer</h2>

        <div className="space-y-3">
          <div>
            <label htmlFor="proposal-service-price" className="text-sm font-medium">
              Service price (€)
            </label>
            <input
              id="proposal-service-price"
              type="number"
              inputMode="decimal"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
              value={form.service_price}
              onChange={(e) => setForm({ ...form, service_price: e.target.value })}
            />
          </div>

          <div>
            <label htmlFor="proposal-travel-fee" className="text-sm font-medium">
              Travel fee (€)
            </label>
            <input
              id="proposal-travel-fee"
              type="number"
              inputMode="decimal"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
              value={form.travel_fee}
              onChange={(e) => setForm({ ...form, travel_fee: e.target.value })}
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label htmlFor="proposal-date" className="text-sm font-medium">
                Date
              </label>
              <input
                id="proposal-date"
                type="date"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>

            <div className="flex-1">
              <label htmlFor="proposal-time" className="text-sm font-medium">
                Time
              </label>
              <input
                id="proposal-time"
                type="time"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label htmlFor="proposal-remark" className="text-sm font-medium">
              Remark
            </label>
            <textarea
              id="proposal-remark"
              rows="2"
              className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              placeholder="Optional note…"
            />
          </div>
        </div>

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
            className="px-5 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold hover:scale-[1.02] transition disabled:opacity-60"
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
