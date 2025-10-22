import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Send } from "lucide-react";

export default function ChatInput({ chatId, user }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);

    await supabase.from("messages").insert([
      {
        chat_id: chatId,
        sender_id: user.id,
        content: text.trim(),
      },
    ]);

    setText("");
    setSending(false);
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
