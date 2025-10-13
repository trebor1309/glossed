// 📄 src/components/modals/ProSignupModal.jsx
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "../../context/UserContext"; // ✅ Contexte utilisateur global

export default function ProSignupModal({ onClose, onClientSignup }) {
  const { login } = useUser();

  const handleProSignup = (e) => {
    e.preventDefault();

    // 🧠 Faux "pro signup"
    // Le UserContext se charge maintenant de rediriger automatiquement vers /prodashboard
    login("pro@glossed.app", "pro");

    // Fermer la modale
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-xl w-11/12 max-w-md p-8 relative"
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* ✖️ Fermer */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>

          <h2 className="text-3xl font-bold text-center mb-6">
            Join Glossed as a Pro
          </h2>

          {/* 🧾 Formulaire d'inscription pro */}
          <form className="space-y-4" onSubmit={handleProSignup}>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Business name
              </label>
              <input
                type="text"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="Your Salon or Brand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="contact@yourbrand.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Password
              </label>
              <input
                type="password"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-rose-600 to-red-600 text-white py-2.5 rounded-lg font-semibold hover:shadow-lg transition-all"
            >
              Join as a Pro
            </button>
          </form>

          {/* 🔗 Liens secondaires */}
          <p className="text-center text-sm text-gray-500 mt-6">
            Want to sign up as a client instead?{" "}
            <button
              onClick={onClientSignup}
              className="text-rose-600 font-medium hover:underline"
            >
              Create client account
            </button>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
