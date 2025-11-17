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
import { supabase } from "@/lib/supabaseClient";

// ... fmtTime / fmtDate inchangés

export default function ProMissionDetailsModal({ booking, onClose, onEvaluate }) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  if (!booking) return null;

  const isMission = typeof booking.price !== "undefined" || typeof booking.time !== "undefined";
  const status = booking.status;
  const showChat = status === "confirmed";

  const dateLabel = isMission ? fmtDate(booking.date) : booking.date;
  const timeLabel = isMission ? fmtTime(booking.time) : booking.time_slot;

  const handleOpenChat = async () => {
    if (!booking?.id) return;

    try {
      // 1) chercher un chat existant pour cette mission
      const { data: existing, error: findError } = await supabase
        .from("chats")
        .select("id")
        .eq("mission_id", booking.id)
        .maybeSingle();

      if (findError) {
        console.error("Error finding chat:", findError);
        return;
      }

      let chatId = existing?.id;

      // 2) sinon créer un nouveau chat
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
          console.error("Error creating chat:", createError);
          return;
        }

        chatId = created.id;
      }

      // 3) naviguer vers la conversation
      if (chatId) {
        navigate(`/chat/${chatId}`);
      }
    } catch (err) {
      console.error("Unexpected error while opening chat:", err);
    }
  };

  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* ... contenu du modal identique ... */}

      <div className="mt-8 flex flex-wrap justify-end gap-3">
        {/* ... proposed actions ... */}

        {showChat && (
          <button
            onClick={handleOpenChat}
            className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.03] transition flex items-center gap-2"
          >
            <MessageSquare size={16} /> Chat
          </button>
        )}

        {/* ... Evaluate + Close ... */}
      </div>
    </motion.div>
  );
}
