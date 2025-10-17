import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, AlertTriangle } from "lucide-react";

export default function ConfirmModal({
  open,
  title = "Are you sure?",
  message = "Please confirm this action.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  imagePreview,
  previews = [], // 👈 support multiple
  type = "default", // "default" | "delete" | "upload" | "verify"
}) {
  const allPreviews = previews.length
    ? previews
    : imagePreview
    ? [imagePreview]
    : [];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-2xl p-6 w-11/12 max-w-sm text-center space-y-4 border border-gray-100"
          >
            {/* Icône dynamique */}
            <div className="flex justify-center">
              {type === "delete" ? (
                <AlertTriangle
                  size={42}
                  className="text-red-500 bg-red-100 p-2 rounded-full"
                />
              ) : (
                <ShieldCheck
                  size={42}
                  className="text-rose-600 bg-rose-100 p-2 rounded-full"
                />
              )}
            </div>

            {/* Titre & message */}
            <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-600 leading-relaxed">{message}</p>

            {/* 🖼️ Preview(s) */}
            {allPreviews.length > 0 && (
              <div
                className={`${
                  allPreviews.length > 1
                    ? "grid grid-cols-3 gap-2"
                    : "flex justify-center"
                } mt-3 mb-1`}
              >
                {allPreviews.map((src, i) => (
                  <img
                    key={i}
                    src={src}
                    alt={`Preview ${i + 1}`}
                    className="w-24 h-24 object-cover rounded-lg shadow mx-auto"
                  />
                ))}
              </div>
            )}

            {/* Boutons */}
            <div className="flex justify-center gap-3 mt-4">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50 transition"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`px-4 py-2 rounded-full font-medium text-white hover:scale-[1.03] transition-transform ${
                  type === "delete"
                    ? "bg-gradient-to-r from-red-600 to-rose-600"
                    : "bg-gradient-to-r from-rose-600 to-red-600"
                }`}
              >
                {confirmLabel}
              </button>
            </div>

            {/* Message de vérification spécifique */}
            {type === "verify" && (
              <p className="text-xs text-gray-400 mt-3">
                Your document will be stored securely and reviewed
                confidentially by the Glossed team within 48 hours.
              </p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
