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
      onClick={() => setVisible(false)}
      className={`fixed z-[10000]
      bottom-20 left-1/2 -translate-x-1/2 w-[92%]
      sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 sm:w-auto
      flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold
      transition-all duration-300
      ${isSuccess ? "bg-gradient-to-r from-rose-600 to-red-600" : "bg-gray-800"}`}
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
