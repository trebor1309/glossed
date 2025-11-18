// 📄 src/components/chat/ChatInput.jsx
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Send } from "lucide-react";

export default function ChatInput({ chatId, user }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setSending(true);

    const cleanText = text.trim();

    // 1) Insert message
    const { error: insertError } = await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      content: cleanText,
    });

    if (insertError) {
      console.error("Message insert error:", insertError);
      setSending(false);
      return;
    }

    // 2) Update chat metadata
    const { error: updateError } = await supabase
      .from("chats")
      .update({
        last_message: cleanText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", chatId);

    if (updateError) {
      console.error("Chat update error:", updateError);
    }

    setText("");
    setSending(false);
  };

  return (
    <form
      onSubmit={sendMessage}
      className="flex items-center gap-2 bg-white"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a message..."
        className="flex-1 border rounded-xl px-4 py-2 focus:ring-2 focus:ring-rose-400 outline-none text-gray-700 resize-none max-h-32"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage(e);
          }
        }}
      />

      <button
        type="submit"
        disabled={sending}
        className="p-3 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white hover:scale-[1.05] transition disabled:opacity-50"
      >
        <Send size={18} />
      </button>
    </form>
  );
}
