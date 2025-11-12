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
      .select("*, pro:users!missions_pro_id_fkey(first_name, last_name, profile_photo)")
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

    const fetchOffers = async () => {
      try {
        setLoading(true);
        console.log("🎯 Fetching offers for:", booking.id, "client:", booking.client_id);

        const { data, error } = await supabase
          .from("missions")
          .select("*, pro:users!missions_pro_id_fkey(first_name, last_name, profile_photo)")
          .eq("client_id", booking.client_id)
          .or(`booking_id.eq.${booking.id},id.eq.${booking.id}`) // ✅ supporte booking ou mission
          .order("created_at", { ascending: true });

        if (error) {
          console.error("❌ Error loading offers:", error);
          return;
        }

        console.log("📦 Offers fetched:", data);
        setOffers(data || []);
      } catch (err) {
        console.error("💥 Unexpected error fetching offers:", err);
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
      const response = await fetch(
        "https://cdcnylgokphyltkctymi.supabase.co/functions/v1/create-payment-intent",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mission_id: offer.id,
            client_id: offer.client_id,
          }),
        }
      );

      const result = await response.json();

      // ⬇️ C’est ici qu’on ajoute notre log
      console.log("📦 Payment intent response:", result);

      if (!result?.url) {
        alert("Unable to start payment. Please try again later.");
        return;
      }

      // ✅ Redirection Stripe
      window.location.href = result.url;
    } catch (err) {
      console.error("❌ Payment error:", err);
      alert("Payment could not be initiated. Please try again.");
    }
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
                      src={o.pro?.profile_photo || "/placeholder-user.jpg"}
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
