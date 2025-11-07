// src/components/modals/ClientOffersModal.jsx
import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";

import { motion } from "framer-motion";
import { X, CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";

export default function ClientOffersModal({ booking, onClose, onAccepted }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);
  const { session } = useUser();

  // 🔹 Charger les offres liées à ce booking
  useEffect(() => {
    if (!booking?.id) return;

    (async () => {
      try {
        const { data, error } = await supabase
          .from("missions")
          .select("*")
          .eq("client_id", booking.client_id)
          .eq("status", "proposed")
          .order("created_at", { ascending: false });

        if (error) throw error;
        setOffers(data || []);
      } catch (err) {
        console.error("❌ Error loading offers:", err);
        setToast({ type: "error", message: err.message });
      } finally {
        setLoading(false);
      }
    })();
  }, [booking?.id]);

  // 💳 Lancer le paiement Stripe via la fonction Supabase
  const handlePayAndConfirm = async (offer) => {
    try {
      setSubmitting(true);
      console.log("🚀 Sending payment intent for:", {
        mission_id: offer.id,
        client_id: booking.client_id,
      });

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-payment-intent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`, // ✅ ajoute ce header
          },
          body: JSON.stringify({
            mission_id: offer.id,
            client_id: booking.client_id,
          }),
        }
      );

      const data = await res.json();
      console.log("💳 Stripe response:", data);

      if (!res.ok) throw new Error(data?.error || "Payment creation failed");
      if (!data?.url) throw new Error("No checkout URL returned");

      // ✅ Redirige vers Stripe Checkout
      window.location.href = data.url;
    } catch (err) {
      console.error("❌ Payment error:", err);
      setToast({ type: "error", message: err.message });
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
    >
      <motion.div
        className="bg-white w-11/12 max-w-2xl rounded-2xl shadow-xl p-6 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold mb-2 text-center text-gray-800">
          Offers for “{booking?.service}”
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-600">
            <Loader2 className="animate-spin" />
          </div>
        ) : offers.length === 0 ? (
          <div className="text-center text-gray-500 py-10">No offers yet.</div>
        ) : (
          <ul className="space-y-3">
            {offers.map((o) => (
              <li
                key={o.id}
                className="border rounded-xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center"
              >
                <div>
                  <p className="font-medium text-gray-800">{o.description || "No note"}</p>
                  <p className="text-sm text-gray-600">
                    {new Date(o.date).toLocaleDateString()} — {o.time}
                  </p>
                  <p className="text-sm text-gray-800 font-semibold">{o.price} €</p>
                </div>
                <button
                  onClick={() => handlePayAndConfirm(o)}
                  disabled={submitting}
                  className="mt-3 sm:mt-0 px-4 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold hover:scale-[1.02] transition disabled:opacity-60"
                >
                  <CreditCard size={16} /> {submitting ? "Processing…" : "Pay & Confirm"}
                </button>
              </li>
            ))}
          </ul>
        )}

        {toast && (
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        )}
      </motion.div>
    </motion.div>
  );
}
