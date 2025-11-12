import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Eye, Inbox, Loader2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import ClientOffersModal from "@/components/modals/ClientOffersModal";

export default function DashboardOffers() {
  const { session } = useUser();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]);
  const [offersByBooking, setOffersByBooking] = useState({});
  const [toast, setToast] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  // ----------------------------------------------------------
  // 🔁 Chargement initial + écoute en temps réel
  // ----------------------------------------------------------
  useEffect(() => {
    if (!session?.user?.id) return;
    let mounted = true;

    const fetchOffers = async () => {
      try {
        setLoading(true);

        // 1️⃣ Récupérer les bookings du client encore "ouverts"
        const { data: myBookings, error: bErr } = await supabase
          .from("bookings")
          .select("*")
          .eq("client_id", session.user.id)
          .in("status", ["pending", "proposed"]) // pas confirmed
          .order("created_at", { ascending: false });

        if (bErr) throw bErr;
        if (!mounted) return;

        setBookings(myBookings || []);

        // 2️⃣ Charger toutes les missions actives liées à ces bookings
        const bookingIds = (myBookings || []).map((b) => b.id);
        if (bookingIds.length) {
          const { data: missions, error: mErr } = await supabase
            .from("missions")
            .select("*")
            .in("booking_id", bookingIds)
            .in("status", ["proposed", "offers"]); // ✅ confirmé exclu

          if (mErr) throw mErr;

          // 🧮 Calculer le prix total TTC client (pro + 10 %)
          const missionsWithFees = (missions || []).map((m) => ({
            ...m,
            total_price: Math.round(m.price * 1.1 * 100) / 100, // arrondi à 2 décimales
          }));

          // Grouper par booking_id
          const grouped = {};
          missionsWithFees.forEach((m) => {
            if (!grouped[m.booking_id]) grouped[m.booking_id] = [];
            grouped[m.booking_id].push(m);
          });

          if (!mounted) return;
          setOffersByBooking(grouped);
        } else {
          setOffersByBooking({});
        }
      } catch (err) {
        console.error("❌ fetchOffers error:", err);
        setToast({ type: "error", message: `❌ ${err.message}` });
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchOffers();

    // ✅ Realtime : écouter missions pour ce client
    const channel = supabase
      .channel(`offers_client_${session.user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "missions",
          filter: `client_id=eq.${session.user.id}`,
        },
        (payload) => {
          console.log("🔁 Missions changed:", payload);
          fetchOffers();
        }
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  // ----------------------------------------------------------
  // 🧮 Préparer les données d’affichage
  // ----------------------------------------------------------
  const rows = useMemo(() => {
    return bookings.map((b) => ({
      booking: b,
      offers: offersByBooking[b.id] || [],
      offersCount: (offersByBooking[b.id] || []).length,
    }));
  }, [bookings, offersByBooking]);

  // ----------------------------------------------------------
  // 🧱 Rendu principal
  // ----------------------------------------------------------
  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 flex items-center gap-3 text-gray-600">
        <Loader2 className="animate-spin" size={18} />
        Loading your offers…
      </div>
    );
  }

  return (
    <section className="max-w-4xl mx-auto p-6 space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-gray-800">Offers Received</h1>
        <p className="text-gray-500 text-sm">
          Review offers from professionals for your requests. Prices shown include our 10% service
          fee.
        </p>
      </header>

      {rows.length === 0 ? (
        <div className="flex items-center gap-3 text-gray-500 bg-white border rounded-xl p-6">
          <Inbox size={18} />
          <span>No open requests with offers yet.</span>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ booking, offers, offersCount }) => (
            <li
              key={booking.id}
              className="bg-white border rounded-2xl p-5 flex items-start justify-between gap-4"
            >
              <div className="space-y-1">
                <p className="font-semibold text-gray-800">{booking.service}</p>
                <p className="text-sm text-gray-600">
                  {booking.date} {booking.time_slot ? `— ${booking.time_slot}` : ""}
                </p>
                <p className="text-sm text-gray-500">{booking.address}</p>
                {booking.notes && <p className="text-xs text-gray-400 italic">“{booking.notes}”</p>}

                {/* ✅ Aperçu du prix le plus bas incluant frais Glossed */}
                {offers.length > 0 && (
                  <p className="text-sm text-gray-700 font-medium mt-2">
                    Lowest offer:{" "}
                    <span className="text-rose-600">
                      €
                      {offers.reduce((min, o) => Math.min(min, o.total_price), Infinity).toFixed(2)}
                    </span>{" "}
                    (incl. fees)
                  </p>
                )}
              </div>

              <div className="flex flex-col items-end gap-2 min-w-[180px]">
                <span className="text-sm text-gray-600">
                  {offersCount} {offersCount === 1 ? "offer" : "offers"}
                </span>
                <button
                  onClick={() => setSelectedBooking(booking)}
                  disabled={offersCount === 0}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white text-sm font-medium disabled:opacity-60 hover:scale-[1.02] transition"
                >
                  <Eye size={16} />
                  View offers
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {selectedBooking && (
        <ClientOffersModal
          booking={selectedBooking}
          onClose={() => setSelectedBooking(null)}
          onAccepted={() => {
            // ✅ Masquer le modal & recharger
            setSelectedBooking(null);
            setToast({
              type: "success",
              message: "Offer accepted! Proceed to payment.",
            });
          }}
          onPay={() => {
            // ✅ Après paiement Stripe : recharger
            setSelectedBooking(null);
            setToast({
              type: "success",
              message: "Payment confirmed successfully!",
            });
          }}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </section>
  );
}
