// src/components/modals/ProSignupModal.jsx
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";
import SignupLegalFields from "@/components/legal/SignupLegalFields";
import InlineAlert from "@/components/ui/InlineAlert";
import { logUnexpectedError, userFacingError } from "@/lib/userFacingError";
import { useState } from "react";

export default function ProSignupModal({ onClose, onClientSignup }) {
  const { signup } = useUser();
  const navigate = useNavigate();
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleProSignup = async (e) => {
    e.preventDefault();

    const username = e.target.username.value.trim();
    const businessName = e.target.businessName.value.trim();
    const email = e.target.email.value.trim();
    const password = e.target.password.value.trim();
    const legalAccepted =
      e.currentTarget.elements.acceptClientTerms.checked &&
      e.currentTarget.elements.acceptProviderTerms.checked &&
      e.currentTarget.elements.acknowledgePrivacy.checked;

    setFormError("");
    setSubmitting(true);
    try {
      const { session } = await signup(email, password, {
        role: "pro",
        username,
        businessName,
        legalAccepted,
      });

      onClose();
      navigate(session ? "/onboarding" : "/auth/check-email", { state: { email } });
    } catch (err) {
      logUnexpectedError("Professional sign-up failed", err);
      setFormError(userFacingError(err, "Unable to create your professional account right now."));
    } finally {
      setSubmitting(false);
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

          <h2 className="text-3xl font-bold text-center mb-6">Join Glossed as a Pro</h2>

          <form className="space-y-4" onSubmit={handleProSignup}>
            <InlineAlert message={formError} />
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                name="username"
                required
                className="w-full mt-1 px-4 py-2 border rounded-lg"
                placeholder="yourname"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Business name</label>
              <input
                type="text"
                name="businessName"
                required
                className="w-full mt-1 px-4 py-2 border rounded-lg"
                placeholder="Your Salon or Brand"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="email"
                required
                className="w-full mt-1 px-4 py-2 border rounded-lg"
                placeholder="contact@yourbrand.com"
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

            <SignupLegalFields professional />

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-gradient-to-r from-rose-600 to-red-600 text-white py-2.5 rounded-lg disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Creating account…" : "Join as a Pro"}
            </button>
          </form>

          <p className="text-center text-sm text-gray-500 mt-6">
            Want to sign up as a client instead?{" "}
            <button onClick={onClientSignup} className="text-rose-600 font-medium hover:underline">
              Create client account
            </button>
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
