// src/components/modals/ClientOffersModal.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";

export default function ClientOffersModal({ booking, onClose, onPay }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // ------------------------------------------------------------
  // 🔹 Charger les offres liées à une réservation
  // ------------------------------------------------------------
  const fetchOffers = async () => {
    if (!booking) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("missions")
      // ✅ correction du champ full_name → first_name / last_name
      .select("*, pro:users!missions_pro_id_fkey(first_name, last_name, avatar_url)")
      .eq("client_id", booking.client_id)
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("❌ Error loading offers:", error);
      setToast({
        type: "error",
        message: "Error while loading offers. Please try again.",
      });
    } else {
      setOffers(data || []);
    }
    setLoading(false);
  };

  // ------------------------------------------------------------
  // 🧠 Chargement initial + écoute en temps réel des nouvelles offres
  // ------------------------------------------------------------
  useEffect(() => {
    if (!booking) return;
    fetchOffers();

    // 🔁 Listener Realtime : si une nouvelle mission est ajoutée pour cette réservation
    const channel = supabase
      .channel(`client_offers_${booking.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "missions",
          filter: `booking_id=eq.${booking.id}`,
        },
        (payload) => {
          console.log("📩 New offer received:", payload.new);
          setToast({
            type: "info",
            message: "✨ A new offer has just arrived for your booking!",
          });
          fetchOffers(); // recharge les offres automatiquement
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [booking]);

  // ------------------------------------------------------------
  // 💳 Paiement et confirmation
  // ------------------------------------------------------------
  const handlePayAndConfirm = (offer) => {
    if (onPay) onPay(offer);
  };

  // ------------------------------------------------------------
  // 🎨 Rendu principal
  // ------------------------------------------------------------
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-5 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>

        <h2 className="text-lg font-bold mb-4 text-gray-800">Offers for your request</h2>

        {loading ? (
          <p className="text-center text-gray-500">Loading...</p>
        ) : offers.length === 0 ? (
          <p className="text-center text-gray-400">No offers yet</p>
        ) : (
          <div className="space-y-3">
            {offers.map((o) => {
              const totalPrice = (Number(o.price) * 1.1).toFixed(2); // 💰 prix client = pro + 10%
              const proName =
                [o.pro?.first_name, o.pro?.last_name].filter(Boolean).join(" ") || "Professional";

              return (
                <div
                  key={o.id}
                  className="border border-gray-200 rounded-xl p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={o.pro?.avatar_url || "/placeholder-user.jpg"}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                    />
                    <div>
                      <p className="font-semibold text-gray-800">{proName}</p>
                      <p className="text-sm text-gray-500">{o.service || "Service"}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-semibold text-gray-800">{totalPrice} €</p>
                      <p className="text-xs text-gray-500">(incl. fees)</p>
                    </div>
                  </div>

                  {o.description && <p className="text-gray-600 text-sm mt-3">{o.description}</p>}

                  <div className="mt-4 flex justify-between items-center">
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
                      className="bg-rose-500 hover:bg-rose-600 text-white text-sm font-medium px-4 py-2 rounded-xl transition"
                    >
                      Pay & Confirm
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {toast && (
          <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
        )}
      </div>
    </div>
  );
}
