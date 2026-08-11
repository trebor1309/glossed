import { useCallback, useEffect, useState } from "react";
import { Bell, CheckCheck, CircleAlert, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { useNotifications } from "@/context/NotificationContext";

const PAGE_SIZE = 100;

function relativeTime(value) {
  const date = new Date(value);
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absoluteSeconds = Math.abs(seconds);
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absoluteSeconds < 60) return formatter.format(seconds, "second");
  if (absoluteSeconds < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (absoluteSeconds < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  if (absoluteSeconds < 604800) return formatter.format(Math.round(seconds / 86400), "day");
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function safeDashboardPath(value) {
  if (typeof value !== "string") return null;
  if (value === "/dashboard" || value.startsWith("/dashboard/")) return value;
  if (value === "/prodashboard" || value.startsWith("/prodashboard/")) return value;
  return null;
}

export default function DashboardNotifications() {
  const navigate = useNavigate();
  const { markAllRead, refreshSummary } = useNotifications();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [markingAll, setMarkingAll] = useState(false);

  const loadNotifications = useCallback(async () => {
    const { data, error: queryError } = await supabase
      .from("notifications")
      .select("id, event_type, title, body, metadata, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);

    if (queryError) {
      console.error("Unable to load notifications:", queryError);
      setError("Notifications could not be loaded. Please try again.");
    } else {
      setItems(data || []);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadNotifications();
    const handleUpdate = (event) => {
      if (event.detail?.table === "notifications") loadNotifications();
    };
    window.addEventListener("supabase-update", handleUpdate);
    return () => window.removeEventListener("supabase-update", handleUpdate);
  }, [loadNotifications]);

  const openNotification = async (notification) => {
    if (!notification.read_at) {
      const { error: updateError } = await supabase.rpc("mark_notification_read", {
        p_notification_id: notification.id,
      });
      if (updateError) {
        console.error("Unable to mark notification as read:", updateError);
        setError("This notification could not be marked as read.");
        return;
      }
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item
        )
      );
      await refreshSummary();
    }

    const path = safeDashboardPath(notification.metadata?.path);
    if (path) navigate(path);
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    const marked = await markAllRead();
    if (marked) {
      setItems((current) =>
        current.map((item) => ({ ...item, read_at: item.read_at || new Date().toISOString() }))
      );
      setError("");
    } else {
      setError("Notifications could not be marked as read. Please try again.");
    }
    setMarkingAll(false);
  };

  const hasUnread = items.some((item) => !item.read_at);

  return (
    <section className="space-y-5 pb-16">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-gray-900">
            <Bell className="text-rose-600" size={24} /> Notifications
          </h1>
          <p className="mt-1 text-sm text-gray-500">Your latest Glossed activity.</p>
        </div>
        <button
          type="button"
          onClick={handleMarkAll}
          disabled={!hasUnread || markingAll}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition hover:border-rose-200 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {markingAll ? <LoaderCircle className="animate-spin" size={17} /> : <CheckCheck size={17} />}
          Mark all as read
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <CircleAlert size={18} /> {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-gray-500">
            <LoaderCircle className="animate-spin" size={20} /> Loading notifications...
          </div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Bell className="mx-auto mb-3 text-gray-300" size={36} />
            <p className="font-medium text-gray-700">No notifications yet</p>
            <p className="mt-1 text-sm text-gray-500">New activity will appear here.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {items.map((notification) => {
              const path = safeDashboardPath(notification.metadata?.path);
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(notification)}
                    className={`flex w-full gap-3 p-4 text-left transition hover:bg-gray-50 sm:p-5 ${
                      notification.read_at ? "bg-white" : "bg-rose-50/50"
                    } ${path ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span
                      className={`mt-2 h-2.5 w-2.5 shrink-0 rounded-full ${
                        notification.read_at ? "bg-gray-200" : "bg-rose-500"
                      }`}
                      aria-label={notification.read_at ? "Read" : "Unread"}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <span className="font-semibold text-gray-900">{notification.title}</span>
                        <time className="shrink-0 text-xs text-gray-400" dateTime={notification.created_at}>
                          {relativeTime(notification.created_at)}
                        </time>
                      </span>
                      <span className="mt-1 block text-sm leading-6 text-gray-600">
                        {notification.body}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
