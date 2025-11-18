// 📄 src/components/chat/ChatInput.jsx
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Send, Image as ImageIcon } from "lucide-react";

export default function ChatInput({ chatId, user }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // 📌 Compression d'image avant upload
  async function compressImage(file, quality = 0.7) {
    const bmp = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    canvas.width = bmp.width;
    canvas.height = bmp.height;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
    });
  }

  // 📌 Upload d'image
  const uploadImage = async (file) => {
    const filename = `${Date.now()}_${user.id}.jpg`;
    const path = `${chatId}/${filename}`;

    const compressed = await compressImage(file);

    const { error: uploadError } = await supabase.storage
      .from("chat_attachments")
      .upload(path, compressed, {
        contentType: "image/jpeg",
      });

    if (uploadError) {
      console.error("Image upload error:", uploadError);
      return null;
    }

    const { data: publicUrl } = supabase.storage.from("chat_attachments").getPublicUrl(path);

    return publicUrl.publicUrl;
  };

  // 📌 Envoyer message (texte OU image)
  const sendMessage = async (content, attachment_url = null) => {
    const { error } = await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      content,
      attachment_url,
    });

    if (!error) {
      await supabase
        .from("chats")
        .update({
          last_message: content || "📷 Image",
          updated_at: new Date().toISOString(),
        })
        .eq("id", chatId);
    }
  };

  // 📌 ENVOI TEXTE
  const onSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setSending(true);
    await sendMessage(text.trim());
    setText("");
    setSending(false);
  };

  // 📌 ENVOI IMAGE
  const onImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSending(true);
    const url = await uploadImage(file);
    if (url) await sendMessage(null, url);
    setSending(false);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex items-center gap-2 bg-white p-3 border-t"
      style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.25rem)" }}
    >
      {/* IMAGE BUTTON */}
      <label className="p-2 cursor-pointer rounded-full hover:bg-gray-100">
        <ImageIcon size={22} className="text-gray-600" />
        <input type="file" accept="image/*" className="hidden" onChange={onImageSelect} />
      </label>

      {/* TEXTAREA */}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Write a message..."
        className="flex-1 border rounded-xl px-4 py-2 focus:ring-2 focus:ring-rose-400 outline-none text-gray-700 resize-none max-h-24"
        rows={1}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e);
          }
        }}
      />

      {/* SEND BUTTON */}
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
