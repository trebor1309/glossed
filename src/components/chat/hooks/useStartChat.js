// 📄 src/components/chat/hooks/useStartChat.js
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";

/**
 * useStartChat
 * --------------
 * Utilisation :
 * const startChat = useStartChat();
 * await startChat({ proId, clientId, missionId });
 *
 * Fonctionne pour :
 * - bouton "Contact" depuis un profil pro (no mission)
 * - chat depuis une mission (id mission fourni)
 */
export default function useStartChat() {
  const navigate = useNavigate();
  const { user, isPro, isClient } = useUser();

  /**
   * @param {object} params
   * @param {string} params.proId  - ID du pro ciblé
   * @param {string} params.clientId - ID du client (toi ou l’autre)
   * @param {string|null} params.missionId - ID mission ou null
   */
  const startChat = async ({ proId, clientId, missionId = null }) => {
    if (!user?.id) {
      console.warn("⛔ startChat called with no authenticated user.");
      return;
    }

    try {
      let chatId = null;

      // 1️⃣ Vérifier si un chat existe déjà
      const { data: existingChat } = await supabase
        .from("chats")
        .select("id")
        .eq("pro_id", proId)
        .eq("client_id", clientId)
        .eq("mission_id", missionId)
        .maybeSingle();

      if (existingChat?.id) {
        chatId = existingChat.id;
      }

      // 2️⃣ Sinon créer un chat
      if (!chatId) {
        const payload = {
          pro_id: proId,
          client_id: clientId,
          mission_id: missionId, // peut être null !
        };

        const { data: created, error: createErr } = await supabase
          .from("chats")
          .insert([payload])
          .select("id")
          .single();

        if (createErr) {
          console.error("❌ Error creating chat:", createErr);
          return;
        }

        chatId = created.id;

        // 3️⃣ Marquer un premier message système optionnel
        await supabase.from("messages").insert({
          chat_id: chatId,
          sender_id: user.id,
          content: missionId
            ? `[system] Conversation started for mission ${missionId}`
            : `[system] New conversation`,
        });

        // 4️⃣ update updated_at
        await supabase
          .from("chats")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", chatId);
      }

      // 5️⃣ Naviguer vers le chat
      if (isPro) {
        navigate(`/prodashboard/messages/${chatId}`);
      } else if (isClient) {
        navigate(`/dashboard/messages/${chatId}`);
      } else {
        console.warn("⚠️ Unknown role, unable to navigate.");
      }
    } catch (err) {
      console.error("❌ Unexpected startChat error:", err);
    }
  };

  return startChat;
}
