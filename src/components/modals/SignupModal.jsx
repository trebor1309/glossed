// 📄 src/components/modals/SignupModal.jsx
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "../../context/UserContext"; // ✅ contexte utilisateur global
import { useNavigate } from "react-router-dom"; // ✅ navigation

export default function SignupModal({ onClose, onProSignup, onLogin }) {
  const { login } = useUser();
  const navigate = useNavigate();

  const handleSignup = (e) => {
    e.preventDefault();

    // 🧠 Faux "signup" (simulation d'inscription)
    // on pourrait ici récupérer les champs mais pour l’instant c’est simulé
    login("newuser@glossed.app", "client");

    // Fermer la modale et rediriger
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
          {/* ✖️ Fermer */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>

          <h2 className="text-3xl font-bold text-center mb-6">
            Create your account
          </h2>

          {/* 🧾 Formulaire */}
          <form className="space-y-4" onSubmit={handleSignup}>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Full name
              </label>
              <input
                type="text"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="Jane Doe"
              />
            </div>

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
              Sign up
            </button>
          </form>

          {/* 🔗 Liens complémentaires */}
          <p className="text-center text-sm text-gray-500 mt-6">
            Are you a beauty professional?{" "}
            <button
              onClick={onProSignup}
              className="text-rose-600 font-medium hover:underline"
            >
              Join as a Pro
            </button>
          </p>

          <p className="text-center text-sm text-gray-500 mt-3">
            Already have an account?{" "}
            <button
              onClick={onLogin}
              className="text-rose-600 font-medium hover:underline"
            >
              Sign in
            </button>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
