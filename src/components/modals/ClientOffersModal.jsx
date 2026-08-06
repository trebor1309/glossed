import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";
import { motion } from "framer-motion";
import { X, CreditCard, User } from "lucide-react";

export default function ClientOffersModal({ booking, onClose, onPay }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // ------------------------------------------------------------
  // 🔹 Charger les offres liées à une réservation
  // ------------------------------------------------------------
  useEffect(() => {
    if (!booking) return;

    const fetchOffers = async () => {
      try {
        setLoading(true);
        console.log("🎯 Fetching offers for:", booking.id, "client:", booking.client_id);

        const { data: missionRows, error } = await supabase
          .from("missions")
          .select("*")
          .eq("client_id", booking.client_id)
          .eq("booking_id", booking.id)
          .order("created_at", { ascending: true });

        if (error) throw error;
        const profileEntries = await Promise.all(
          [...new Set((missionRows || []).map((mission) => mission.pro_id))].map(async (proId) => {
            const { data } = await supabase.rpc("get_user_summary", { p_user_id: proId });
            return [proId, data?.[0] || null];
          })
        );
        const profiles = new Map(profileEntries);
        setOffers(
          (missionRows || []).map((mission) => ({
            ...mission,
            pro: profiles.get(mission.pro_id),
          }))
        );
      } catch (err) {
        console.error("❌ Error loading offers:", err);
        setToast({
          type: "error",
          message: "Error while loading offers. Please try again.",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchOffers();
  }, [booking]);

  // ------------------------------------------------------------
  // 💳 Paiement et confirmation
  // ------------------------------------------------------------
  const handlePayAndConfirm = async (offer) => {
    try {
      console.log("💳 Creating payment session for mission:", offer.id);
      const { data: result, error } = await supabase.functions.invoke("create-checkout-session", {
        body: { mission_id: offer.id },
      });
      console.log("📦 Payment intent response:", result);

      if (error || !result?.url) {
        alert(
          result?.error ||
            error?.message ||
            result?.message ||
            "Impossible de démarrer le paiement, réessayez plus tard."
        );
        return;
      }

      window.location.href = result.url;
    } catch (err) {
      console.error("❌ Payment error:", err);
      alert("Erreur lors du paiement, veuillez réessayer.");
    }
  };

  // ------------------------------------------------------------
  // 🎨 Rendu principal (Glossed style)
  // ------------------------------------------------------------
  return (
    <motion.div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-3xl shadow-2xl w-11/12 max-w-md p-6 relative"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* ✖ Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition"
        >
          <X size={22} />
        </button>

        <h2 className="text-xl font-bold mb-5 text-gray-800 flex items-center gap-2">
          <CreditCard className="text-rose-500" size={20} /> Offers for your request
        </h2>

        {loading ? (
          <p className="text-center text-gray-500">Loading...</p>
        ) : offers.length === 0 ? (
          <p className="text-center text-gray-400">No offers yet</p>
        ) : (
          <motion.div
            className="space-y-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.08 },
              },
            }}
          >
            {offers.map((o, i) => {
              const totalPrice = (Number(o.price) * 1.1).toFixed(2);
              const proName =
                [o.pro?.first_name, o.pro?.last_name].filter(Boolean).join(" ") || "Professional";

              return (
                <motion.div
                  key={o.id || i}
                  variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
                  className="border border-gray-100 rounded-2xl p-5 bg-gradient-to-r from-pink-50 to-rose-50 shadow-sm hover:shadow-md transition"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={o.pro?.profile_photo || "/placeholder-user.jpg"}
                      alt="pro"
                      className="w-12 h-12 rounded-full object-cover border border-rose-100 shadow-sm"
                    />
                    <div>
                      <p className="font-semibold text-gray-800 flex items-center gap-1">
                        <User size={14} className="text-rose-500" /> {proName}
                      </p>
                      <p className="text-sm text-gray-500">{o.service || "Service"}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-base font-semibold text-gray-800">{totalPrice} €</p>
                      <p className="text-xs text-gray-500">(incl. fees)</p>
                    </div>
                  </div>

                  {o.description && (
                    <p className="text-gray-600 text-sm mt-3 bg-white/60 rounded-xl p-2 shadow-inner">
                      {o.description}
                    </p>
                  )}

                  <div className="mt-5 flex justify-between items-center">
                    <p className="text-[11px] text-gray-400 leading-tight max-w-[70%]">
                      By confirming this payment, you agree to the{" "}
                      <a
                        href="https://glossed.be/terms"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline text-rose-500 hover:text-rose-600"
                      >
                        Glossed Terms of Service
                      </a>
                      .
                    </p>

                    <button
                      onClick={() => handlePayAndConfirm(o)}
                      className="bg-gradient-to-r from-rose-600 to-red-600 hover:scale-[1.03] text-white text-sm font-semibold px-5 py-2 rounded-full shadow-sm transition"
                    >
                      Pay & Confirm
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}

        {toast && (
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        )}
      </motion.div>
    </motion.div>
  );
}
