// 📄 src/components/chat/hooks/useStartChat.js
import { useNavigate } from "react-router-dom";
import { useUser } from "@/context/UserContext";
import { getOrCreateChat } from "@/lib/chat";

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
  const startChat = async ({ proId, missionId = null }) => {
    if (!user?.id) {
      console.warn("⛔ startChat called with no authenticated user.");
      return;
    }

    try {
      const chatId = await getOrCreateChat({ missionId, proId });

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
