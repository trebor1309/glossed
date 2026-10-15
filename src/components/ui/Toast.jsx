import { useState, useEffect, useRef } from "react";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";

export default function Toast({ message, type = "success", onClose }) {
  const [render, setRender] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useEffect(() => {
    // Durée visible
    let fadeTimer;
    const timer = setTimeout(() => {
      setFadeOut(true);
      // délai animation fade-out
      fadeTimer = setTimeout(() => {
        setRender(false);
        onCloseRef.current?.();
      }, 250);
    }, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(fadeTimer);
    };
  }, []);

  if (!render) return null;

  const isSuccess = type === "success";
  const isError = type === "error";
  const Icon = isSuccess ? CheckCircle2 : isError ? AlertCircle : Info;

  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`
        fixed z-[10000]
        bottom-20 left-1/2 -translate-x-1/2 w-[92%]
        sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 sm:w-auto
        flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold
        transition-all duration-300
        ${fadeOut ? "opacity-0 translate-y-3" : "opacity-100 translate-y-0"}
        ${
          isSuccess
            ? "bg-gradient-to-r from-rose-600 to-red-600"
            : isError
              ? "bg-gray-900"
              : "bg-blue-700"
        }
      `}
    >
      <Icon size={20} className="shrink-0 text-white" aria-hidden="true" />
      <span>{message}</span>
      <button
        type="button"
        aria-label="Close notification"
        onClick={() => {
          setFadeOut(true);
          setTimeout(() => {
            setRender(false);
            onClose?.();
          }, 250);
        }}
        className="ml-1 rounded p-0.5 text-white/80 hover:bg-white/10 hover:text-white"
      >
        <X size={16} aria-hidden="true" />
      </button>
    </div>
  );
}
