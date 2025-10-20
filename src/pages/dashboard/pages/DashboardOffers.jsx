import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Eye, Inbox, Loader2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import ClientOffersModal from "@/components/modals/ClientOffersModal";

/**
 * DashboardOffers
 * - Liste les bookings (demandes) du client encore ouvertes (pending/proposed)
 * - Affiche le nombre d'offres reçues (missions.status='proposed')
 * - Ouvre un modal pour analyser/choisir une offre
 */
export default function DashboardOffers() {
  const { session } = useUser();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState([]); // bookings du client
  const [offersByBooking, setOffersByBooking] = useState({}); // { booking_id: [missions...] }
  const [toast, setToast] = useState(null);
  const [selectedBooking, setSelectedBooking] = useState(null);

  useEffect(() => {
    if (!session?.user?.id) return;
    let mounted = true;

    (async () => {
      try {
        setLoading(true);

        // 1) Récupérer les bookings du client encore "ouverts"
        const { data: myBookings, error: bErr } = await supabase
          .from("bookings")
          .select("*")
          .eq("client_id", session.user.id)
          .in("status", ["pending", "proposed"])
          .order("created_at", { ascending: false });

        if (bErr) throw bErr;
        if (!mounted) return;

        setBookings(myBookings || []);

        // 2) Charger toutes les missions "proposed" liées à ces bookings (en un seul call)
        const bookingIds = (myBookings || []).map((b) => b.id);
        if (bookingIds.length) {
          const { data: missions, error: mErr } = await supabase
            .from("missions")
            .select("*")
            .in("booking_id", bookingIds)
            .eq("status", "proposed");

          if (mErr) throw mErr;

          // Grouper par booking_id
          const grouped = {};
          (missions || []).forEach((m) => {
            if (!grouped[m.booking_id]) grouped[m.booking_id] = [];
            grouped[m.booking_id].push(m);
          });
          if (!mounted) return;
          setOffersByBooking(grouped);
        } else {
          setOffersByBooking({});
        }
      } catch (err) {
        setToast({ type: "error", message: `❌ ${err.message}` });
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [session?.user?.id]);

  const rows = useMemo(() => {
    return bookings.map((b) => ({
      booking: b,
      offersCount: (offersByBooking[b.id] || []).length,
    }));
  }, [bookings, offersByBooking]);

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
          {rows.map(({ booking, offersCount }) => (
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
            // On masque le modal – la redirection paiement se fait dans le modal
            setSelectedBooking(null);
          }}
        />
      )}

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </section>
  );
}
