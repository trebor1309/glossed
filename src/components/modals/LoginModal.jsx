// 📄 src/components/modals/LoginModal.jsx
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "../../context/UserContext"; // ✅ contexte utilisateur
import { useNavigate } from "react-router-dom"; // ✅ navigation

export default function LoginModal({ onClose, onSignup }) {
  const { login } = useUser();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();

    // 🧠 Faux login (à remplacer plus tard par Supabase)
    login("robert@example.com", "client");

    // Fermer la modale + rediriger vers le dashboard
    onClose();
    navigate("/dashboard");
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
          {/* ✖️ Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>

          <h2 className="text-3xl font-bold text-center mb-6">Sign in</h2>

          {/* 🧾 Formulaire */}
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Email
              </label>
              <input
                type="email"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="you@example.com"
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
              Continue
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don’t have an account?{" "}
            <button
              onClick={onSignup}
              className="text-rose-600 font-medium hover:underline"
            >
              Sign up
            </button>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
