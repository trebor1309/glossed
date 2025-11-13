// src/context/NotificationContext.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }) {
  const { session, user } = useUser();
  const [notifications, setNotifications] = useState({
    clientOffers: 0, // offres reçues par le client
    proBookings: 0,  // nouvelles demandes pour le pro
    payments: 0,     // paiements confirmés
  });

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;

    /* -------------------- CLIENT -------------------- */
    const clientChannel = supabase
      .channel(`client_notifs_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "missions", filter: `client_id=eq.${userId}` },
        (payload) => {
          if (payload.new.status === "proposed") {
            setNotifications((prev) => ({
              ...prev,
              clientOffers: prev.clientOffers + 1,
            }));
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "missions", filter: `client_id=eq.${userId}` },
        (payload) => {
          if (payload.new.status === "confirmed") {
            setNotifications((prev) => ({
              ...prev,
              payments: prev.payments + 1,
            }));
          }
        }
      )
      .subscribe();

    /* -------------------- PRO -------------------- */
    const proChannel = supabase
      .channel(`pro_notifs_${userId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "booking_notifications", filter: `pro_id=eq.${userId}` },
        () => {
          setNotifications((prev) => ({
            ...prev,
            proBookings: prev.proBookings + 1,
          }));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(clientChannel);
      supabase.removeChannel(proChannel);
    };
  }, [user?.id]);

  /* ---------------------------------------------------------
     ✅ Reset function — utile pour “clear” une notif lue
  --------------------------------------------------------- */
  const resetNotification = (type) => {
    setNotifications((prev) => ({ ...prev, [type]: 0 }));
  };

  return (
    <NotificationContext.Provider value={{ notifications, resetNotification }}>
      {children}
    </NotificationContext.Provider>
  );
}
