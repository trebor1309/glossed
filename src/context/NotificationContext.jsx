// 📄 src/context/NotificationContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import Toast from "@/components/ui/Toast";

const NotificationContext = createContext();
export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }) {
  const { user } = useUser();
  const [notifications, setNotifications] = useState({
    clientOffers: 0, // offres reçues par le client
    proBookings: 0, // nouvelles demandes pour le pro
    payments: 0, // paiements confirmés
  });
  const [toast, setToast] = useState(null);

  // 🔊 Petite fonction utilitaire : broadcast global
  const broadcast = (table, action, payload) => {
    window.dispatchEvent(
      new CustomEvent("supabase-update", {
        detail: { table, action, payload },
      })
    );
  };

  // 🔔 Fonction pratique pour afficher un toast
  const pushNotification = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 🔁 Abonnements Supabase unifiés
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    console.log("✅ Notifications active pour l'utilisateur:", userId);

    // --- Client side events ---
    const clientChannel = supabase
      .channel(`client_global_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "missions", filter: `client_id=eq.${userId}` },
        (payload) => {
          if (payload.new.status === "proposed") {
            setNotifications((prev) => ({ ...prev, clientOffers: prev.clientOffers + 1 }));
            pushNotification("💌 New offer received from a professional!", "success");
            broadcast("missions", "INSERT", payload);
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "missions", filter: `client_id=eq.${userId}` },
        (payload) => {
          if (payload.new.status === "confirmed") {
            setNotifications((prev) => ({ ...prev, payments: prev.payments + 1 }));
            pushNotification("✅ Your booking has been confirmed and paid!", "success");
            broadcast("missions", "UPDATE", payload);
          }
        }
      )
      .subscribe();

    // --- Pro side events ---
    const proChannel = supabase
      .channel(`pro_global_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "booking_notifications",
          filter: `pro_id=eq.${userId}`,
        },
        async (payload) => {
          const { booking_id } = payload.new;
          const { data: booking } = await supabase
            .from("bookings")
            .select("service")
            .eq("id", booking_id)
            .single();

          setNotifications((prev) => ({ ...prev, proBookings: prev.proBookings + 1 }));
          pushNotification(
            `📩 New booking request: ${booking?.service || "New request"}`,
            "success"
          );
          broadcast("booking_notifications", "INSERT", payload);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "missions", filter: `pro_id=eq.${userId}` },
        (payload) => {
          if (payload.new.status === "confirmed") {
            pushNotification(
              `💰 Your offer for "${payload.new.service}" has been confirmed and paid!`,
              "success"
            );
            broadcast("missions", "UPDATE", payload);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(clientChannel);
      supabase.removeChannel(proChannel);
    };
  }, [user?.id]);

  // ✅ Reset function — utile pour effacer une notif lue
  const resetNotification = (type) => {
    setNotifications((prev) => ({ ...prev, [type]: 0 }));
  };

  return (
    <NotificationContext.Provider value={{ notifications, resetNotification }}>
      {children}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </NotificationContext.Provider>
  );
}
