import { useRef, useState } from "react";
import { Image as ImageIcon, Send } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 2048;

async function compressImage(file, quality = 0.8) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");

  if (!context) {
    bitmap.close();
    throw new Error("This image cannot be processed by your browser.");
  }

  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("This image cannot be compressed."))),
      "image/jpeg",
      quality
    );
  });
}

export default function ChatInput({ chatId, user, onTyping }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const lastTypingSent = useRef(0);

  const sendMessage = async (content, attachmentUrl = null) => {
    const { error: sendError } = await supabase.from("messages").insert({
      chat_id: chatId,
      sender_id: user.id,
      content,
      attachment_url: attachmentUrl,
    });
    if (sendError) throw sendError;
  };

  const submitText = async () => {
    const content = text.trim();
    if (!content || sending || !chatId || !user?.id) return;

    setSending(true);
    setError(null);
    try {
      await sendMessage(content);
      setText("");
    } catch (sendError) {
      console.error("Message send error:", sendError);
      setError("Your message could not be sent. Please try again.");
    } finally {
      setSending(false);
    }
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    await submitText();
  };

  const onImageSelect = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || sending || !chatId || !user?.id) return;

    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      input.value = "";
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("The image must be smaller than 10 MB.");
      input.value = "";
      return;
    }

    setSending(true);
    let uploadedPath = null;
    try {
      const compressed = await compressImage(file);
      const filename = `${user.id}_${Date.now()}_${crypto.randomUUID()}.jpg`;
      uploadedPath = `${chatId}/${filename}`;
      const { error: uploadError } = await supabase.storage
        .from("chat_attachments")
        .upload(uploadedPath, compressed, { contentType: "image/jpeg" });
      if (uploadError) throw uploadError;

      await sendMessage(null, uploadedPath);
    } catch (uploadError) {
      console.error("Image message error:", uploadError);
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage
          .from("chat_attachments")
          .remove([uploadedPath]);
        if (cleanupError) console.error("Unable to clean up failed chat upload:", cleanupError);
      }
      setError("The image could not be sent. Please try again.");
    } finally {
      input.value = "";
      setSending(false);
    }
  };

  const handleTyping = () => {
    const now = Date.now();
    if (now - lastTypingSent.current < 1000) return;
    lastTypingSent.current = now;
    onTyping?.();
  };

  return (
    <div className="w-full min-w-0 shrink-0 border-t bg-white">
      {error && (
        <p className="px-3 pt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
      <form
        onSubmit={onSubmit}
        className="flex w-full min-w-0 items-center gap-2 overflow-hidden p-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
      >
        <label className="shrink-0 cursor-pointer rounded-full p-2 hover:bg-gray-100">
          <ImageIcon size={22} className="text-gray-600" aria-hidden="true" />
          <span className="sr-only">Send an image</span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={sending}
            onChange={onImageSelect}
          />
        </label>

        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            handleTyping();
          }}
          placeholder="Write a message..."
          maxLength={5000}
          className="min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-gray-700 outline-none focus:ring-2 focus:ring-rose-400 sm:px-4"
          rows={1}
          disabled={sending}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitText();
            }
          }}
        />

        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="shrink-0 rounded-full bg-gradient-to-r from-rose-600 to-red-600 p-3 text-white transition hover:scale-[1.05] disabled:opacity-50"
          aria-label="Send message"
        >
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
