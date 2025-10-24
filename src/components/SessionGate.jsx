// 📄 src/components/SessionGate.jsx
import { motion } from "framer-motion";
import { useUser } from "@/context/UserContext";
import Logo from "@/components/Logo";

export default function SessionGate({ children }) {
  const { loading } = useUser();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 text-gray-700 overflow-hidden relative">
        {/* ✨ Effet de fond doux */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-rose-100/30 via-transparent to-transparent blur-3xl"></div>

        {/* 💎 Logo animé */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="flex flex-col items-center"
        >
          <div className="animate-bounce-slow">
            <Logo size="text-5xl" />
          </div>
          <motion.p
            className="mt-6 text-base font-medium text-gray-500 animate-pulse"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            Preparing your experience...
          </motion.p>
        </motion.div>

        {/* 🌈 Cercle d’attente */}
        <motion.div
          className="mt-10 h-10 w-10 border-4 border-rose-400 border-t-transparent rounded-full animate-spin"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        />
      </div>
    );
  }

  // ✅ Session prête → rendu normal
  return children;
}
