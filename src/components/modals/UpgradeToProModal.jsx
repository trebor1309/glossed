import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/context/UserContext";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function UpgradeToProModal({ onClose }) {
  const { user, fetchUserProfile } = useUser();

  const [businessName, setBusinessName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleUpgrade = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (!businessName.trim()) {
      setError("Please enter your business name.");
      setLoading(false);
      return;
    }

    try {
      // ---------------------------------------------------
      // Mise à jour du rôle PRO + changement immédiat de dashboard
      // ---------------------------------------------------
      const { error: updateError } = await supabase
        .from("users")
        .update({
          role: "pro", // rôle permanent
          active_role: "pro", // rôle actif immédiatement
          business_name: businessName.trim(),
        })
        .eq("id", user.id);

      if (updateError) throw updateError;

      // On refresh le user dans le contexte
      await fetchUserProfile({ id: user.id });

      setSuccess(true);

      setTimeout(() => {
        onClose();
        window.location.assign("/prodashboard");
      }, 1200);
    } catch (err) {
      setError(err.message || "Upgrade failed. Please try again.");
    } finally {
      setLoading(false);
    }
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
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>

          <h2 className="text-2xl font-bold text-center mb-6">Upgrade to Pro</h2>

          {!success ? (
            <>
              <p className="text-center text-gray-600 mb-4">
                To unlock the Pro Dashboard, please enter your business name.
              </p>

              <form onSubmit={handleUpgrade} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Business name *</label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    placeholder="Your Salon • Your Brand"
                  />
                </div>

                {error && <p className="text-sm text-red-600 text-center">{error}</p>}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-rose-600 to-red-600 text-white py-2.5 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-60"
                >
                  {loading ? "Upgrading..." : "Upgrade Account"}
                </button>
              </form>
            </>
          ) : (
            <p className="text-green-600 text-center font-medium">
              Your account has been upgraded! Redirecting…
            </p>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
