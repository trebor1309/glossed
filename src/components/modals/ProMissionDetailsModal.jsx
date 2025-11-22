import { motion } from "framer-motion";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  FileText,
  MessageSquare,
  Star,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { useNotifications } from "@/context/NotificationContext";
import { supabase } from "@/lib/supabaseClient";
import { openConfirmModal } from "@/components/ui/openConfirmModal";

const fmtTime = (t) => (typeof t === "string" && t.includes(":") ? t.slice(0, 5) : t);
const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
};

export default function ProMissionDetailsModal({ booking, onClose, onEvaluate }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, isPro } = useUser();
  const { pushNotification } = useNotifications();

  if (!booking) return null;

  const status = booking.status;
  const dateLabel = fmtDate(booking.date);
  const timeLabel = fmtTime(booking.time);
  const showChat =
    status === "confirmed" ||
    status === "cancel_requested" ||
    status === "cancelled" ||
    status === "completed";

  /* -----------------------------------------------------------
     Ensure chat + [system] message
  ----------------------------------------------------------- */
  const ensureChatAndSendMessage = async (message) => {
    if (!booking?.id || !user?.id) return;

    const { data: existing } = await supabase
      .from("chats")
      .select("id")
      .eq("mission_id", booking.id)
      .maybeSingle();

    let chatId = existing?.id;

    if (!chatId) {
      const { data: created, error: createError } = await supabase
        .from("chats")
        .insert([
          {
            mission_id: booking.id,
            pro_id: booking.pro_id,
            client_id: booking.client_id,
          },
        ])
        .select("id")
        .single();

      if (createError) {
        console.error("Chat creation error:", createError);
        return;
      }

      chatId = created.id;
    }

    await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      content: `[system] ${message}`,
    });

    await supabase.from("chats").update({ updated_at: new Date().toISOString() }).eq("id", chatId);
  };

  /* -----------------------------------------------------------
     Open chat
  ----------------------------------------------------------- */
  const handleOpenChat = async () => {
    if (!booking?.id) return;
    try {
      const { data: existing } = await supabase
        .from("chats")
        .select("id")
        .eq("mission_id", booking.id)
        .maybeSingle();

      let chatId = existing?.id;

      if (!chatId) {
        const { data: created } = await supabase
          .from("chats")
          .insert([
            {
              mission_id: booking.id,
              pro_id: booking.pro_id,
              client_id: booking.client_id,
            },
          ])
          .select("id")
          .single();

        chatId = created.id;
      }

      navigate(isPro ? `/prodashboard/messages/${chatId}` : `/dashboard/messages/${chatId}`);
    } catch (err) {
      console.error("Error opening chat:", err);
    }
  };

  /* -----------------------------------------------------------
     Approve cancellation
  ----------------------------------------------------------- */
  const handleApproveCancellation = async () => {
    const confirm = await openConfirmModal(
      "Approve cancellation?",
      "Do you really want to cancel this booking? The client will be refunded.",
      {
        confirmLabel: "Approve cancellation",
        cancelLabel: "Keep booking",
        type: "delete",
      }
    );

    if (!confirm) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from("missions")
        .update({ status: "cancelled" })
        .eq("id", booking.id);

      if (error) throw error;

      await ensureChatAndSendMessage(
        "The pro approved the cancellation. The booking has been cancelled."
      );

      pushNotification("Cancellation approved.", "success");
      onClose?.();
    } catch (err) {
      console.error(err);
      pushNotification("Unable to approve cancellation.", "error");
    } finally {
      setLoading(false);
    }
  };

  /* -----------------------------------------------------------
     Reject cancellation
  ----------------------------------------------------------- */
  const handleRejectCancellation = async () => {
    const confirm = await openConfirmModal(
      "Keep the booking?",
      "The client asked for a cancellation. Do you want to keep the booking confirmed?",
      {
        confirmLabel: "Keep booking",
        cancelLabel: "Back",
      }
    );

    if (!confirm) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from("missions")
        .update({ status: "confirmed" })
        .eq("id", booking.id);

      if (error) throw error;

      await ensureChatAndSendMessage(
        "The pro rejected the cancellation request. The booking remains confirmed."
      );

      pushNotification("Cancellation request rejected.", "success");
      onClose?.();
    } catch (err) {
      console.error(err);
      pushNotification("Unable to reject cancellation.", "error");
    } finally {
      setLoading(false);
    }
  };

  /* -----------------------------------------------------------
     Pro direct cancel (discrete link)
  ----------------------------------------------------------- */
  const handleProCancel = async () => {
    const confirm = await openConfirmModal(
      "Cancel this booking?",
      "Do you really want to cancel this booking? The client will be fully refunded.",
      {
        confirmLabel: "Cancel booking",
        cancelLabel: "Back",
        type: "delete",
      }
    );

    if (!confirm) return;

    try {
      setLoading(true);

      const { error } = await supabase
        .from("missions")
        .update({ status: "cancelled" })
        .eq("id", booking.id);

      if (error) throw error;

      await ensureChatAndSendMessage("The pro cancelled this reservation.");

      pushNotification("Booking cancelled.", "success");
      onClose?.();
    } catch (err) {
      console.error(err);
      pushNotification("Unable to cancel booking.", "error");
    } finally {
      setLoading(false);
    }
  };

  /* -----------------------------------------------------------
     RENDER
  ----------------------------------------------------------- */
  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-xl w-11/12 max-w-lg p-6 relative"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 transition"
        >
          <X size={22} />
        </button>

        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <FileText size={20} /> Mission details
        </h2>

        {/* INFO */}
        <div className="space-y-3 text-gray-700">
          <p><strong>Service:</strong> {booking.service}</p>

          <p className="flex items-center gap-2">
            <Calendar size={16} className="text-rose-500" /> <span>{dateLabel}</span>
          </p>

          {timeLabel && (
            <p className="flex items-center gap-2">
              <Clock size={16} className="text-rose-500" /> <span>{timeLabel}</span>
            </p>
          )}

          {booking.address && (
            <p className="flex items-center gap-2">
              <MapPin size={16} className="text-rose-500" /> <span>{booking.address}</span>
            </p>
          )}

          {typeof booking.price !== "undefined" && (
            <p><strong>Price:</strong> € {Number(booking.price).toFixed(2)}</p>
          )}

          {booking.notes && <p className="italic text-sm text-gray-500">“{booking.notes}”</p>}

          {/* STATUS */}
          <div className="mt-4">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                status === "pending"
                  ? "bg-amber-100 text-amber-700"
                  : status === "proposed"
                  ? "bg-blue-100 text-blue-700"
                  : status === "confirmed"
                  ? "bg-green-100 text-green-700"
                  : status === "cancel_requested"
                  ? "bg-orange-100 text-orange-700"
                  : status === "completed"
                  ? "bg-rose-100 text-rose-700"
                  : "bg-gray-100 text-gray-600"
              }`}
            >
              {status}
            </span>
          </div>

          {status === "cancel_requested" && (
            <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              ⚠️ The client requested a cancellation. Please approve or keep the booking below.
            </p>
          )}

          {/* Pro direct cancel (discrete link) */}
          {status === "confirmed" && (
            <button
              onClick={handleProCancel}
              disabled={loading}
              className="mt-3 text-xs text-red-500 underline opacity-70 hover:opacity-100 disabled:opacity-40"
            >
              Cancel this booking
            </button>
          )}
        </div>

        {/* ACTIONS */}
        <div className="mt-8 flex flex-wrap justify-end gap-3">
          {/* Approve / Reject */}
          {status === "cancel_requested" && (
            <>
              <button
                onClick={handleApproveCancellation}
                disabled={loading}
                className="px-4 py-2 bg-red-500 text-white rounded-full font-semibold hover:bg-red-600 transition disabled:opacity-60"
              >
                Approve cancellation
              </button>

              <button
                onClick={handleRejectCancellation}
                disabled={loading}
                className="px-4 py-2 border border-gray-300 text-gray-600 rounded-full font-medium hover:bg-gray-100 transition disabled:opacity-60"
              >
                Keep booking
              </button>
            </>
          )}

          {/* Chat */}
          {showChat && (
            <button
              onClick={handleOpenChat}
              className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.03] transition flex items-center gap-2"
            >
              <MessageSquare size={16} /> Chat
            </button>
          )}

          {/* Evaluate */}
          {status === "completed" && (
            <button
              onClick={() => {
                setLoading(true);
                onEvaluate?.(booking);
                setTimeout(() => setLoading(false), 300);
              }}
              disabled={loading}
              className="px-4 py-2 bg-amber-500 text-white rounded-full font-semibold hover:bg-amber-600 transition disabled:opacity-60 flex items-center gap-2"
            >
              <Star size={16} /> Evaluate
            </button>
          )}

          {/* Close */}
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-600 rounded-full font-medium hover:bg-gray-100 transition"
          >
            Close
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
