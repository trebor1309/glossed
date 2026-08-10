import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import Toast from "@/components/ui/Toast";

const NotificationContext = createContext();
export const useNotifications = () => useContext(NotificationContext);

const emptyNotifications = {
  total: 0,
  clientOffers: 0,
  proBookings: 0,
  proCancellations: 0,
  payments: 0,
  verifications: 0,
};

const defaultPreferences = {
  notifications_push: true,
  notif_new_messages: true,
  notif_job_alerts: true,
  notif_booking_updates: true,
};

function toastEnabled(preferences, eventType) {
  if (!preferences.notifications_push) return false;
  if (eventType === "new_message") return preferences.notif_new_messages;
  if (eventType === "booking_request") return preferences.notif_job_alerts;
  if (
    [
      "offer_received",
      "mission_confirmed",
      "cancellation_requested",
      "mission_cancelled",
      "mission_completed",
      "payment_confirmed",
      "refund_completed",
    ].includes(eventType)
  ) {
    return preferences.notif_booking_updates;
  }
  return true;
}

export function NotificationProvider({ children }) {
  const { user } = useUser();
  const userId = user?.id;
  const [notifications, setNotifications] = useState(emptyNotifications);
  const [newMessages, setNewMessages] = useState(0);
  const [toast, setToast] = useState(null);
  const preferencesRef = useRef(defaultPreferences);

  const pushNotification = useCallback((message, type = "info") => {
    setToast({ message, type });
  }, []);

  const broadcast = useCallback((table, action, payload) => {
    window.dispatchEvent(
      new CustomEvent("supabase-update", {
        detail: { table, action, payload },
      })
    );
  }, []);

  const refreshPreferences = useCallback(async () => {
    if (!userId) {
      preferencesRef.current = defaultPreferences;
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .select(
        "notifications_push, notif_push, notif_new_messages, notif_job_alerts, notif_booking_updates"
      )
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error("Unable to load notification preferences:", error);
      return;
    }

    preferencesRef.current = {
      notifications_push: data?.notifications_push ?? data?.notif_push ?? true,
      notif_new_messages: data?.notif_new_messages ?? true,
      notif_job_alerts: data?.notif_job_alerts ?? true,
      notif_booking_updates: data?.notif_booking_updates ?? true,
    };
  }, [userId]);

  const refreshSummary = useCallback(async () => {
    if (!userId) {
      setNotifications(emptyNotifications);
      setNewMessages(0);
      return;
    }

    const { data, error } = await supabase.rpc("get_notification_summary");
    if (error) {
      console.error("Unable to load notification summary:", error);
      return;
    }

    const summary = Array.isArray(data) ? data[0] : data;
    setNotifications({
      total: Number(summary?.unread_total || 0),
      clientOffers: Number(summary?.client_offers || 0),
      proBookings: Number(summary?.pro_bookings || 0),
      proCancellations: Number(summary?.pro_cancellations || 0),
      payments: Number(summary?.payments || 0),
      verifications: Number(summary?.verifications || 0),
    });
    setNewMessages(Number(summary?.unread_messages || 0));
  }, [userId]);

  const markEventTypesRead = useCallback(
    async (eventTypes) => {
      if (!userId || !eventTypes?.length) return false;
      const { error } = await supabase.rpc("mark_notifications_read", {
        p_event_types: eventTypes,
        p_entity_type: null,
        p_entity_id: null,
        p_mark_all: false,
      });
      if (error) {
        console.error("Unable to mark notifications as read:", error);
        return false;
      }
      await refreshSummary();
      return true;
    },
    [refreshSummary, userId]
  );

  const markEntityRead = useCallback(
    async (entityType, entityId) => {
      if (!userId || !entityType || !entityId) return false;
      const { error } = await supabase.rpc("mark_notifications_read", {
        p_event_types: null,
        p_entity_type: entityType,
        p_entity_id: entityId,
        p_mark_all: false,
      });
      if (error) {
        console.error("Unable to mark entity notifications as read:", error);
        return false;
      }
      await refreshSummary();
      return true;
    },
    [refreshSummary, userId]
  );

  const markAllRead = useCallback(async () => {
    if (!userId) return false;
    const { error } = await supabase.rpc("mark_notifications_read", {
      p_event_types: null,
      p_entity_type: null,
      p_entity_id: null,
      p_mark_all: true,
    });
    if (error) {
      console.error("Unable to mark all notifications as read:", error);
      return false;
    }
    await refreshSummary();
    return true;
  }, [refreshSummary, userId]);

  useEffect(() => {
    refreshPreferences();
    refreshSummary();

    const handlePreferencesUpdated = () => refreshPreferences();
    window.addEventListener("notification-preferences-updated", handlePreferencesUpdated);
    return () => {
      window.removeEventListener("notification-preferences-updated", handlePreferencesUpdated);
    };
  }, [refreshPreferences, refreshSummary]);

  useEffect(() => {
    if (!userId) return;

    const notificationChannel = supabase
      .channel(`notifications_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          refreshSummary();
          if (toastEnabled(preferencesRef.current, payload.new.event_type)) {
            pushNotification(payload.new.title || "New notification", "success");
          }
          broadcast("notifications", "INSERT", payload);
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        (payload) => {
          refreshSummary();
          broadcast("notifications", "UPDATE", payload);
        }
      )
      .subscribe();

    const clientChannel = supabase
      .channel(`client_domain_updates_${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "missions", filter: `client_id=eq.${userId}` },
        (payload) => broadcast("missions", payload.eventType, payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `client_id=eq.${userId}` },
        (payload) => broadcast("payments", payload.eventType, payload)
      )
      .subscribe();

    const proChannel = supabase
      .channel(`pro_domain_updates_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "booking_notifications",
          filter: `pro_id=eq.${userId}`,
        },
        (payload) => broadcast("booking_notifications", payload.eventType, payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "missions", filter: `pro_id=eq.${userId}` },
        (payload) => broadcast("missions", payload.eventType, payload)
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments", filter: `pro_id=eq.${userId}` },
        (payload) => broadcast("payments", payload.eventType, payload)
      )
      .subscribe();

    return () => {
      supabase.removeChannel(notificationChannel);
      supabase.removeChannel(clientChannel);
      supabase.removeChannel(proChannel);
    };
  }, [broadcast, pushNotification, refreshSummary, userId]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        newMessages,
        pushNotification,
        refreshSummary,
        markEventTypesRead,
        markEntityRead,
        markAllRead,
      }}
    >
      {children}
      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </NotificationContext.Provider>
  );
}
