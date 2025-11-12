import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function ClientOffersModal({ booking, onClose, onPay }) {
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!booking) return;

    const fetchOffers = async () => {
      setLoading(true);

      // ✅ Inclure plusieurs statuts (sinon "no offers yet" trop fréquent)
      const { data, error } = await supabase
        .from("missions")
        .select("*, pro:users!missions_pro_id_fkey(full_name, avatar_url)")
        .eq("booking_id", booking.id)
        .eq("client_id", booking.client_id)
        .in("status", ["proposed", "offers", "confirmed"]) // 🧠 Fix ici
        .order("created_at", { ascending: true });

      if (error) {
        console.error("❌ Error loading offers:", error);
      } else {
        console.log("🎯 ClientOffersModal - Offers trouvées:", data);
        setOffers(data || []);
      }
      setLoading(false);
    };

    fetchOffers();
  }, [booking]);

  const handlePayAndConfirm = (offer) => {
    console.log("💳 Pay & Confirm clicked:", offer);
    if (onPay) onPay(offer);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-5 relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>

        <h2 className="text-lg font-bold mb-4 text-gray-800 text-center">
          Offers for your request
        </h2>

        {loading ? (
          <p className="text-center text-gray-500">Loading offers...</p>
        ) : offers.length === 0 ? (
          <p className="text-center text-gray-400 italic">No offers available yet.</p>
        ) : (
          <div className="space-y-3">
            {offers.map((o) => {
              const proPrice = Number(o.price);
              const totalPrice = (proPrice * 1.1).toFixed(2); // 💰 10% fees added for client

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
                      <p className="font-semibold text-gray-800">
                        {o.pro?.full_name || "Professional"}
                      </p>
                      <p className="text-sm text-gray-500">{o.service || "Service"}</p>
                    </div>
                    <div className="ml-auto text-right">
                      <p className="text-sm font-semibold text-gray-800">{totalPrice} €</p>
                      <p className="text-xs text-gray-500">(incl. 10% fees)</p>
                    </div>
                  </div>

                  {o.description && <p className="text-gray-600 text-sm mt-3">{o.description}</p>}

                  <div className="mt-4 flex justify-end">
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
      </div>
    </div>
  );
}
