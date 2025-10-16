import { motion } from "framer-motion";

export default function ConfirmModal({
  open,
  title = "Are you sure?",
  message = "Please confirm this action.",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-xl p-6 w-11/12 max-w-sm text-center space-y-4"
      >
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
        <p className="text-sm text-gray-600">{message}</p>

        <div className="flex justify-center gap-3 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white font-medium hover:scale-[1.02] transition-transform"
          >
            {confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
