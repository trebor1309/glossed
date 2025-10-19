import { motion } from "framer-motion";
import { X, Save } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function EditBookingModal({ booking, onClose, onSave }) {
  const [form, setForm] = useState({
    service: booking.service,
    date: booking.date,
    time_slot: booking.time_slot,
    address: booking.address,
    notes: booking.notes || "",
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const { error } = await supabase
      .from("bookings")
      .update(form)
      .eq("id", booking.id);

    setSaving(false);
    if (!error) {
      onSave(booking.id, form);
      onClose();
    } else {
      alert("Error saving changes.");
    }
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

        <h2 className="text-xl font-semibold text-gray-800 mb-5">
          Edit your request
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Service</label>
            <input
              type="text"
              name="service"
              value={form.service}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700">Date</label>
              <input
                type="date"
                name="date"
                value={form.date}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="text-sm font-medium text-gray-700">Time slot</label>
              <input
                type="text"
                name="time_slot"
                value={form.time_slot}
                onChange={handleChange}
                placeholder="e.g. 14:00 - 16:00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Address</label>
            <input
              type="text"
              name="address"
              value={form.address}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Notes</label>
            <textarea
              name="notes"
              rows="3"
              value={form.notes}
              onChange={handleChange}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-rose-500 outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold hover:scale-[1.02] transition disabled:opacity-60"
          >
            <Save size={18} />
            {saving ? "Saving..." : "Save changes"}
          </button>
        </form>
      </motion.div>
    </motion.div>
  );
}
