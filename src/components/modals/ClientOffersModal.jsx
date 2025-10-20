import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { X, User2, CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import Toast from "@/components/ui/Toast";

/**
 * ClientOffersModal
 * - Liste les missions.status='proposed' pour un booking donné
 * - Affiche le prix PRO + majoration 10% = total client
 * - Au clic "Accept & pay": crée un paiement + appelle une Edge Function Stripe
 *   -> la fonction doit renvoyer { url } = URL Checkout, on redirige
 *
 * Prérequis DB conseillés:
 * missions: id, booking_id, pro_id, price, platform_fee, client_total, status, payment_status
 * payments: id, mission_id, client_id, amount, provider, status
 *
 * Edge Function attendue: "create_checkout_session"
 * payload: { mission_id, booking_id, amount, currency? }
 * response: { url }
 */
export default function ClientOffersModal({ booking, onClose, onAccepted }) {
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [proMap, setProMap] = useState({});
  const [submitId, setSubmitId] = useState(null);
  const [toast, setToast] = useState(null);

  // charger offres proposées pour ce booking
  useEffect(() => {
    if (!booking?.id) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        const { data: missions, error: mErr } = await supabase
          .from("missions")
          .select("*")
          .eq("booking_id", booking.id)
          .eq("status", "proposed")
          .order("created_at", { ascending: false });

        if (mErr) throw mErr;

        // Récupérer infos pros (affichage nom)
        const proIds = [...new Set((missions || []).map((m) => m.pro_id).filter(Boolean))];
        let map = {};
        if (proIds.length) {
          const { data: users, error: uErr } = await supabase
            .from("users")
            .select("id, full_name, business_name")
            .in("id", proIds);
          if (uErr) throw uErr;
          (users || []).forEach((u) => {
            map[u.id] = u.business_name || u.full_name || u.id;
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

  // calcule total client avec majoration 10% si non précalculé
  const displayOffers = useMemo(() => {
    return offers.map((o) => {
      const price = Number(o.price || 0);
      const fee = Number(
        o.platform_fee != null ? o.platform_fee : Math.round(price * 0.1 * 100) / 100
      );
      const total = Number(
        o.client_total != null ? o.client_total : Math.round((price + fee) * 100) / 100
      );
      return { ...o, _computed_fee: fee, _computed_total: total };
    });
  }, [offers]);

  const acceptAndPay = async (offer) => {
    try {
      setSubmitId(offer.id);

      // 1) Assurer que platform_fee & client_total sont bien stockés
      const fee = offer._computed_fee;
      const total = offer._computed_total;

      const { error: upErr } = await supabase
        .from("missions")
        .update({
          platform_fee: fee,
          client_total: total,
          payment_status: "pending", // démarre le process
        })
        .eq("id", offer.id);
      if (upErr) throw upErr;

      // 2) Créer l'enregistrement de paiement
      const { data: payment, error: payErr } = await supabase
        .from("payments")
        .insert([
          {
            mission_id: offer.id,
            client_id: booking.client_id,
            amount: total,
            provider: "stripe",
            status: "pending",
          },
        ])
        .select()
        .single();
      if (payErr) throw payErr;

      // 3) Appeler l'Edge Function Stripe pour créer la session checkout
      //    ➜ tu dois avoir déployé la fonction "create_checkout_session"
      //    ➜ elle doit renvoyer { url }
      const { data: fnRes, error: fnErr } = await supabase.functions.invoke(
        "create_checkout_session",
        {
          body: {
            mission_id: offer.id,
            booking_id: booking.id,
            payment_id: payment.id,
            amount: total,
            currency: "eur",
            // Optionnel: success_url / cancel_url côté fonction
          },
        }
      );
      if (fnErr) throw fnErr;
      if (!fnRes?.url) throw new Error("No checkout URL returned.");

      // 4) Rediriger vers la page de paiement
      onAccepted?.(); // ferme le modal côté parent
      window.location.href = fnRes.url;
    } catch (err) {
      setToast({ type: "error", message: `❌ ${err.message}` });
    } finally {
      setSubmitId(null);
    }
  };

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
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
          aria-label="Close"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-semibold text-gray-800 mb-2 text-center">
          Offers for “{booking?.service}”
        </h2>
        <p className="text-sm text-gray-500 text-center mb-4">
          Prices below include a 10% service fee.
        </p>

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
                className="border rounded-xl p-4 flex items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                    <User2 size={18} className="text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">{proMap[o.pro_id] || o.pro_id}</p>
                    <p className="text-sm text-gray-600">
                      Proposed date: <span className="font-medium">{o.date}</span>
                      {o.meta?.time ? ` – ${o.meta.time}` : ""}
                    </p>
                    {o.description && (
                      <p className="text-xs text-gray-400 italic mt-0.5">“{o.description}”</p>
                    )}
                  </div>
                </div>

                <div className="text-right min-w-[180px]">
                  <p className="text-sm text-gray-600">
                    Pro price:{" "}
                    <span className="font-medium">{Number(o.price || 0).toFixed(2)} €</span>
                  </p>
                  <p className="text-sm text-gray-600">
                    Service fee (10%):{" "}
                    <span className="font-medium">{Number(o._computed_fee).toFixed(2)} €</span>
                  </p>
                  <p className="text-base font-semibold text-gray-900">
                    Total: {Number(o._computed_total).toFixed(2)} €
                  </p>

                  <button
                    onClick={() => acceptAndPay(o)}
                    disabled={!!submitId && submitId !== o.id}
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white text-sm font-semibold hover:scale-[1.02] transition disabled:opacity-60"
                  >
                    <CreditCard size={16} />
                    {submitId === o.id ? "Redirecting…" : "Accept & pay"}
                  </button>
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
