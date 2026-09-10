import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const RESERVATION_MODAL_BODY_CLASS = "glossed-reservation-modal-open";

function isGooglePlacesOverlay(target) {
  return target instanceof Element && Boolean(target.closest(".pac-container"));
}

export default function ReservationFormModal({ children, title, busy = false, onClose }) {
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);
  const returnFocusRef = useRef(null);
  const busyRef = useRef(busy);
  const onCloseRef = useRef(onClose);

  busyRef.current = busy;
  onCloseRef.current = onClose;

  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    const appRoot = document.getElementById("root");
    const previousOverflow = document.body.style.overflow;
    const bodyHadModalClass = document.body.classList.contains(RESERVATION_MODAL_BODY_CLASS);
    const rootWasInert = appRoot?.hasAttribute("inert") || false;
    const previousAriaHidden = appRoot?.getAttribute("aria-hidden");

    document.body.style.overflow = "hidden";
    document.body.classList.add(RESERVATION_MODAL_BODY_CLASS);
    appRoot?.setAttribute("inert", "");
    appRoot?.setAttribute("aria-hidden", "true");

    const focusFrame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());

    const focusInsideDialog = (preferLast = false) => {
      const focusable = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
      const target = preferLast ? focusable.at(-1) : focusable[0];
      if (target) target.focus();
      else dialogRef.current?.focus();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape" && !busyRef.current) {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR) || []);
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const handleFocusIn = (event) => {
      if (!dialogRef.current?.contains(event.target) && !isGooglePlacesOverlay(event.target)) {
        focusInsideDialog();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
      document.body.style.overflow = previousOverflow;
      if (!bodyHadModalClass) document.body.classList.remove(RESERVATION_MODAL_BODY_CLASS);
      if (!rootWasInert) appRoot?.removeAttribute("inert");
      if (previousAriaHidden === null) appRoot?.removeAttribute("aria-hidden");
      else appRoot?.setAttribute("aria-hidden", previousAriaHidden);
      returnFocusRef.current?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      data-testid="reservation-modal-backdrop"
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="reservation-form-modal-title"
        tabIndex={-1}
        className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:max-w-3xl sm:rounded-2xl dark:bg-gray-900"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900 sm:px-6">
          <h2
            id="reservation-form-modal-title"
            className="text-lg font-bold text-gray-900 dark:text-gray-100 sm:text-xl"
          >
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
            className="rounded-full p-2 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-rose-400 disabled:cursor-not-allowed disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white"
          >
            <X size={22} aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5">
          {children}
        </div>
      </section>
    </div>,
    document.body
  );
}
