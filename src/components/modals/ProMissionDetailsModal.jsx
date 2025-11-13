// src/components/modals/ProMissionDetailsModal.jsx
import { motion } from "framer-motion";
import {
  X,
  Calendar,
  Clock,
  MapPin,
  FileText,
  MessageSquare,
  Star,
  Pencil,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const fmtTime = (t) => (typeof t === "string" && t.includes(":") ? t.slice(0, 5) : t);
const fmtDate = (d) => {
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
};

export default function ProMissionDetailsModal({ booking, onClose, onChat, onEvaluate }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  if (!booking) return null;

  const isMission = typeof booking.price !== "undefined" || typeof booking.time !== "undefined";
  const status = booking.status;
  const showChat = status === "confirmed"; // ⬅️ chat seulement confirmé

  const dateLabel = isMission ? fmtDate(booking.date) : booking.date;
  const timeLabel = isMission ? fmtTime(booking.time) : booking.time_slot;

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-xl w-11/12 max-w-lg p-6 relative"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-800 transition"
        >
          <X size={22} />
        </button>

        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
          <FileText size={20} /> Mission details
        </h2>

        <div className="space-y-3 text-gray-700">
          <p>
            <strong>Service:</strong> {booking.service}
          </p>
          <p className="flex items-center gap-2">
            <Calendar size={16} className="text-rose-500" />
            <span>{dateLabel}</span>
          </p>
          {timeLabel && (
            <p className="flex items-center gap-2">
              <Clock size={16} className="text-rose-500" />
              <span>{timeLabel}</span>
            </p>
          )}
          {(booking.address || booking.description) && (
            <p className="flex items-center gap-2">
              <MapPin size={16} className="text-rose-500" />
              <span>{booking.address || booking.description}</span>
            </p>
          )}
          {typeof booking.price !== "undefined" && (
            <p>
              <strong>Price:</strong> € {Number(booking.price).toFixed(2)}
            </p>
          )}
          {booking.notes && <p className="italic text-sm text-gray-500">“{booking.notes}”</p>}

          <div className="mt-4">
            <span
              className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                status === "pending"
                  ? "bg-amber-100 text-amber-700"
                  : status === "proposed"
                    ? "bg-blue-100 text-blue-700"
                    : status === "confirmed"
                      ? "bg-green-100 text-green-700"
                      : status === "completed"
                        ? "bg-rose-100 text-rose-700"
                        : "bg-gray-100 text-gray-600"
              }`}
            >
              {status}
            </span>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap justify-end gap-3">
          {/* Proposé: Edit / Cancel (brancher ensuite) */}
          {status === "proposed" && (
            <>
              <button className="px-4 py-2 border border-gray-300 text-gray-700 rounded-full font-medium hover:bg-gray-100 transition flex items-center gap-2">
                <Pencil size={16} /> Edit proposal
              </button>
              <button className="px-4 py-2 border border-red-200 text-red-600 rounded-full font-medium hover:bg-red-50 transition flex items-center gap-2">
                <Trash2 size={16} /> Cancel proposal
              </button>
            </>
          )}

          {/* Chat seulement quand confirmé */}
          {showChat && (
            <button
              onClick={() => navigate(`/chat/${booking.id}`)}
              className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.03] transition flex items-center gap-2"
            >
              <MessageSquare size={16} /> Chat
            </button>
          )}

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
