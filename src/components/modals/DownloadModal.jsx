import { motion } from "framer-motion";
import { Smartphone } from "lucide-react";

export default function DownloadModal({ onClose }) {
  return (
    <motion.div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="bg-white rounded-2xl shadow-xl w-11/12 max-w-md p-8 relative text-center"
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.3 }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-xl"
        >
          ✕
        </button>

        <Smartphone className="mx-auto mb-4 text-rose-500 w-12 h-12" />
        <h2 className="text-2xl font-semibold mb-2">Download the Glossed App</h2>
        <p className="text-gray-600 mb-6">Choose your platform — app coming soon!</p>

        {/* Badges officiels */}
        <div className="flex justify-center gap-4 mt-6">
          {/* App Store Badge */}
          <a
            href="#"
            className="hover:scale-105 transition transform"
            aria-label="Download on the App Store"
          >
            <img
              src="https://developer.apple.com/assets/elements/badges/download-on-the-app-store.svg"
              alt="Download on the App Store"
              className="h-12"
            />
          </a>

          {/* Google Play Badge */}
          <a
            href="#"
            className="hover:scale-105 transition transform"
            aria-label="Get it on Google Play"
          >
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg"
              alt="Get it on Google Play"
              className="h-12"
            />
          </a>
        </div>

        <p className="text-xs text-gray-400 mt-6">Available soon on App Store & Google Play</p>
      </motion.div>
    </motion.div>
  );
}
