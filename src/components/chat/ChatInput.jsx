// src/components/chat/ChatInput.jsx
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Send } from "lucide-react";

export default function ChatInput({ chatId, user }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const isPro = user?.active_role === "pro";

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || !chatId || !user) return;

    const messageText = text.trim();
    setSending(true);

    try {
      // 1) insérer le message
      const { error: msgError } = await supabase.from("chat_messages").insert([
        {
          chat_id: chatId,
          sender_id: user.id,
          message: messageText,
          read_by_pro: isPro,
          read_by_client: !isPro,
        },
      ]);

      if (msgError) {
        console.error("Error sending message:", msgError);
        return;
      }

      // 2) mettre à jour last_message + updated_at
      const { error: chatError } = await supabase
        .from("chats")
        .update({
          last_message: messageText,
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatId);

      if (chatError) {
        console.error("Error updating chat:", chatError);
      }

      setText("");
    } catch (err) {
      console.error("Unexpected error sending message:", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={sendMessage} className="flex items-center gap-2 border-t p-3 bg-white">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a message..."
        className="flex-1 border rounded-full px-4 py-2 focus:ring-2 focus:ring-rose-500 outline-none text-gray-700"
      />
      <button
        type="submit"
        disabled={sending}
        className="p-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white hover:scale-[1.05] transition disabled:opacity-50"
      >
        <Send size={18} />
      </button>
    </form>
  );
}
