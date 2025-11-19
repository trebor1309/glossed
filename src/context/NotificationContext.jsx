// 📄 src/context/NotificationContext.jsx
import { createContext, useContext, useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import Toast from "@/components/ui/Toast";

const NotificationContext = createContext();
export const useNotifications = () => useContext(NotificationContext);

export function NotificationProvider({ children }) {
  const { user } = useUser();

  const [notifications, setNotifications] = useState({
    clientOffers: 0,
    proBookings: 0,
    payments: 0,
  });

  // 🔔 Nouveau compteur global
  const [newMessages, setNewMessages] = useState(0);

  // Chat actuellement ouvert
  const [chatOpenId, setChatOpenId] = useState(null);

  const [toast, setToast] = useState(null);
  const channelsRef = useRef([]);

  const pushNotification = (message, type = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const broadcast = (table, action, payload) => {
    window.dispatchEvent(
      new CustomEvent("supabase-update", {
        detail: { table, action, payload },
      })
    );
  };

  const resetNotification = (type) => {
    setNotifications((prev) => ({ ...prev, [type]: 0 }));
  };

  // Écoute : quel chat est ouvert ?
  useEffect(() => {
    const handler = (e) => setChatOpenId(e.detail);
    window.addEventListener("chat-open", handler);
    return () => window.removeEventListener("chat-open", handler);
  }, []);

  // Reset du badge messages quand on ouvre un chat
  useEffect(() => {
    if (chatOpenId) setNewMessages(0);
  }, [chatOpenId]);

  // ------------------------------------------------------
  // 🔥 Main realtime logic
  // ------------------------------------------------------
  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;

    // Nettoyage
    channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
    channelsRef.current = [];

    // -------------------------------
    // 🔥 Realtime messages
    // -------------------------------
    const msgChannel = supabase
      .channel(`messages_rt_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const msg = payload.new;

          // Ignorer mes propres messages
          if (msg.sender_id === userId) return;

          // Si je suis dans ce chat → ne pas notifier
          if (msg.chat_id === chatOpenId) return;

          // Sinon : badge + toast
          setNewMessages((n) => n + 1);

          pushNotification("💬 New message received", "success");
        }
      )
      .subscribe();

    channelsRef.current.push(msgChannel);

    // -------------------------------
    // CLIENT & PRO realtime existant
    // (inchangé)
    // -------------------------------
    const clientChannel = supabase
      .channel(`client_realtime_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "missions",
          filter: `client_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new.status === "proposed") {
            setNotifications((prev) => ({
              ...prev,
              clientOffers: prev.clientOffers + 1,
            }));
            pushNotification("💌 New offer received!", "success");
            broadcast("missions", "INSERT", payload);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "missions",
          filter: `client_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new.status === "confirmed") {
            pushNotification("💳 Your booking was confirmed!", "success");
            broadcast("missions", "UPDATE", payload);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payments",
          filter: `client_id=eq.${userId}`,
        },
        (payload) => {
          setNotifications((prev) => ({
            ...prev,
            payments: prev.payments + 1,
          }));
          pushNotification("💰 Payment received!", "success");
          broadcast("payments", "INSERT", payload);
        }
      )
      .subscribe();

    channelsRef.current.push(clientChannel);

    const proChannel = supabase
      .channel(`pro_realtime_${userId}`)
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
          const { data: b } = await supabase
            .from("bookings")
            .select("service")
            .eq("id", booking_id)
            .single();

          setNotifications((prev) => ({
            ...prev,
            proBookings: prev.proBookings + 1,
          }));

          pushNotification(`📩 New booking request: ${b?.service || ""}`, "success");
          broadcast("booking_notifications", "INSERT", payload);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "missions",
          filter: `pro_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.new.status === "confirmed") {
            pushNotification(
              `💰 Your offer for "${payload.new.service}" has been paid!`,
              "success"
            );
            broadcast("missions", "UPDATE", payload);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "payments",
          filter: `pro_id=eq.${userId}`,
        },
        (payload) => {
          pushNotification("💸 New payout received!", "success");
          broadcast("payments", "INSERT", payload);
        }
      )
      .subscribe();

    channelsRef.current.push(proChannel);

    return () => {
      channelsRef.current.forEach((ch) => supabase.removeChannel(ch));
      channelsRef.current = [];
    };
  }, [user?.id, chatOpenId]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        newMessages,
        resetNotification,
      }}
    >
      {children}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </NotificationContext.Provider>
  );
}
