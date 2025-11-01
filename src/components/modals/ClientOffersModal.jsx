// src/components/modals/ClientOffersModal.jsx
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X, User2, CreditCard, Loader2, XCircle } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";

export default function ClientOffersModal({ booking, onClose, onAccepted }) {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [proMap, setProMap] = useState({});
  const [submitId, setSubmitId] = useState(null);
  const [toast, setToast] = useState(null);

  // ---------------------------------------------------------
  // 🔹 Charger toutes les propositions liées à ce booking
  // ---------------------------------------------------------
  useEffect(() => {
    if (!booking?.id) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        // 🧩 On récupère les missions liées à ce booking_id
        const { data: missions, error: mErr } = await supabase
          .from("missions")
          .select("*")
          .eq("booking_id", booking.id)
          .in("status", ["proposed", "offers"]) // accepte les deux statuts
          .order("created_at", { ascending: false });

        if (mErr) throw mErr;

        // 🧩 Récupérer les pros liés à ces missions
        const proIds = [...new Set((missions || []).map((m) => m.pro_id).filter(Boolean))];
        let map = {};
        if (proIds.length) {
          const { data: users, error: uErr } = await supabase
            .from("users")
            .select("id, first_name, last_name, business_name")
            .in("id", proIds);
          if (uErr) throw uErr;
          (users || []).forEach((u) => {
            map[u.id] =
              u.business_name || `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.id;
          });
        }

        if (!mounted) return;
        setOffers(missions || []);
        setProMap(map);
      } catch (err) {
        setToast({ type: "error", message: `❌ ${err.message}` });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [booking?.id]);

  // ---------------------------------------------------------
  // 💰 Calcul des totaux (service + déplacement)
  // ---------------------------------------------------------
  const displayOffers = useMemo(() => {
    return offers.map((o) => {
      const servicePrice = Number(o.service_price || 0);
      const travelFee = Number(o.travel_fee || 0);
      const total = servicePrice + travelFee || Number(o.price || 0);
      return {
        ...o,
        _service_price: servicePrice,
        _travel_fee: travelFee,
        _computed_total: total,
      };
    });
  }, [offers]);

  // ---------------------------------------------------------
  // ✅ Accepter une offre
  // ---------------------------------------------------------
  const acceptAndPay = async (offer) => {
    try {
      setSubmitId(offer.id);

      // ✅ 1. Met à jour la mission
      const { error: upErr } = await supabase
        .from("missions")
        .update({ status: "confirmed" })
        .eq("id", offer.id);
      if (upErr) throw upErr;

      // ✅ 2. Met à jour le booking parent
      const { error: bookErr } = await supabase
        .from("bookings")
        .update({ status: "confirmed", pro_id: offer.pro_id })
        .eq("id", booking.id);
      if (bookErr) throw bookErr;

      // ✅ 3. Supprime les autres offres pour ce booking
      await supabase.from("missions").delete().eq("booking_id", booking.id).neq("id", offer.id);

      setToast({ type: "success", message: "✅ Offer accepted successfully!" });
      onAccepted?.();
      onClose?.();
    } catch (err) {
      setToast({ type: "error", message: `❌ ${err.message}` });
    } finally {
      setSubmitId(null);
    }
  };

  // ---------------------------------------------------------
  // ❌ Refuser une offre
  // ---------------------------------------------------------
  const refuseOffer = async (offer) => {
    if (!confirm("Are you sure you want to decline this offer?")) return;
    try {
      await supabase.from("missions").delete().eq("id", offer.id);
      setOffers((prev) => prev.filter((o) => o.id !== offer.id));
      setToast({ type: "info", message: "Offer declined." });
    } catch (err) {
      setToast({ type: "error", message: `❌ ${err.message}` });
    }
  };

  // ---------------------------------------------------------
  // 🖼️ Rendu principal
  // ---------------------------------------------------------
  return (
    <motion.div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white w-11/12 max-w-2xl rounded-2xl shadow-xl p-6 relative"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        {/* ❌ Bouton de fermeture */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={20} />
        </button>

        {/* 🧾 En-tête */}
        <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">
          Offers for “{booking?.service}”
        </h2>
        <p className="text-sm text-gray-500 text-center mb-4">
          Review offers and choose your preferred professional.
        </p>

        {/* 📊 Contenu */}
        {loading ? (
          <div className="flex items-center gap-2 justify-center text-gray-600 py-10">
            <Loader2 className="animate-spin" size={18} />
            Loading offers…
          </div>
        ) : displayOffers.length === 0 ? (
          <div className="text-center text-gray-500 py-10">No offers yet.</div>
        ) : (
          <ul className="space-y-3">
            {displayOffers.map((o) => (
              <li
                key={o.id}
                className="border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                {/* Infos Pro + Détails */}
                <div className="flex items-start gap-3 flex-1">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                    <User2 size={18} className="text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">{proMap[o.pro_id] || o.pro_id}</p>
                    <p className="text-sm text-gray-600">
                      Date:{" "}
                      <span className="font-medium">
                        {o.date ? new Date(o.date).toLocaleDateString() : "N/A"}
                      </span>
                      {o.time ? ` – ${o.time}` : ""}
                    </p>
                    <p className="text-sm text-gray-600">
                      Address: <span className="font-medium">{booking.address}</span>
                    </p>
                    {o.description && (
                      <p className="text-xs text-gray-500 italic mt-1">“{o.description}”</p>
                    )}
                  </div>
                </div>

                {/* Prix + Actions */}
                <div className="text-right min-w-[180px]">
                  <p className="text-sm text-gray-600">
                    Service: <span className="font-medium">{o._service_price.toFixed(2)} €</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Travel: <span className="font-medium">{o._travel_fee.toFixed(2)} €</span>
                  </p>
                  <p className="text-base font-semibold text-gray-900">
                    Total: {o._computed_total.toFixed(2)} €
                  </p>

                  <div className="flex gap-2 mt-2 justify-end">
                    <button
                      onClick={() => refuseOffer(o)}
                      className="px-3 py-2 rounded-full border text-gray-500 hover:bg-gray-100 flex items-center gap-1 text-sm"
                    >
                      <XCircle size={14} /> Refuse
                    </button>
                    <button
                      onClick={() => acceptAndPay(o)}
                      disabled={!!submitId && submitId !== o.id}
                      className="px-4 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white text-sm font-semibold hover:scale-[1.02] transition disabled:opacity-60"
                    >
                      <CreditCard size={16} />
                      {submitId === o.id ? "Processing…" : "Accept offer"}
                    </button>
                  </div>
                </div>
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
