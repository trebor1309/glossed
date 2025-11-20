// src/context/NotificationContext.jsx
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
    proCancellations: 0,
    clientCancellations: 0,
  });

  const [newMessages, setNewMessages] = useState(0);
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

  useEffect(() => {
    const handler = (e) => setChatOpenId(e.detail);
    window.addEventListener("chat-open", handler);
    return () => window.removeEventListener("chat-open", handler);
  }, []);

  useEffect(() => {
    if (chatOpenId) setNewMessages(0);
  }, [chatOpenId]);

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;

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

          if (msg.sender_id === userId) return;
          if (msg.chat_id === chatOpenId) return;

          setNewMessages((n) => n + 1);
          pushNotification("💬 New message received", "success");
        }
      )
      .subscribe();

    channelsRef.current.push(msgChannel);

    // -------------------------------
    // CLIENT realtime
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
          const { old, new: updated } = payload;

          if (updated.status === "confirmed" && old.status !== "confirmed") {
            pushNotification("💳 Your booking was confirmed!", "success");
            broadcast("missions", "UPDATE", payload);
          }

          if (updated.status === "cancelled" && old.status !== "cancelled") {
            setNotifications((prev) => ({
              ...prev,
              clientCancellations: (prev.clientCancellations || 0) + 1,
            }));
            pushNotification("⚠️ Your booking was cancelled.", "info");
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

    // -------------------------------
    // PRO realtime
    // -------------------------------
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
          const { old, new: updated } = payload;

          if (updated.status === "confirmed" && old.status !== "confirmed") {
            pushNotification(`💰 Your offer for "${updated.service}" has been paid!`, "success");
            broadcast("missions", "UPDATE", payload);
          }

          if (updated.status === "cancel_requested" && old.status !== "cancel_requested") {
            setNotifications((prev) => ({
              ...prev,
              proCancellations: (prev.proCancellations || 0) + 1,
            }));
            pushNotification(
              `⚠️ The client requested a cancellation for "${updated.service}".`,
              "info"
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
        pushNotification,
      }}
    >
      {children}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </NotificationContext.Provider>
  );
}
