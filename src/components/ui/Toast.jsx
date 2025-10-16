import { useState, useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";

export default function Toast({ message, type = "success", onClose }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onClose, 300); // délai pour l’animation
    }, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  if (!visible) return null;

  const isSuccess = type === "success";

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold transition-all duration-300 ${
        isSuccess
          ? "bg-gradient-to-r from-rose-600 to-red-600"
          : "bg-gray-800"
      }`}
    >
      {isSuccess ? (
        <CheckCircle2 size={20} className="text-white" />
      ) : (
        <XCircle size={20} className="text-white" />
      )}
      <span>{message}</span>
    </div>
  );
}
