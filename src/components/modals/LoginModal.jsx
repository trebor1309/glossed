// src/components/modals/LoginModal.jsx
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";

export default function LoginModal({ onClose, onSignup }) {
  const { login } = useUser();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();

    const identifier = e.target.identifier.value.trim();
    const password = e.target.password.value.trim();

    try {
      await login(identifier, password);
      onClose();
      navigate("/dashboard");
    } catch (error) {
      alert("Login failed: " + error.message);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-xl w-11/12 max-w-md p-8 relative"
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>

          <h2 className="text-3xl font-bold text-center mb-6">Sign in</h2>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="block text-sm font-medium text-gray-700">Email or username</label>
              <input
                type="text"
                name="identifier"
                required
                className="w-full mt-1 px-4 py-2 border rounded-lg"
                placeholder="email or username"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                name="password"
                required
                className="w-full mt-1 px-4 py-2 border rounded-lg"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-rose-600 to-red-600 text-white py-2.5 rounded-lg"
            >
              Continue
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Don’t have an account?{" "}
            <button onClick={onSignup} className="text-rose-600 font-medium hover:underline">
              Sign up
            </button>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
