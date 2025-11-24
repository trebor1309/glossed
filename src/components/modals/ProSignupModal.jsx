// src/components/modals/ProSignupModal.jsx
import { motion, AnimatePresence } from "framer-motion";
import { useUser } from "../../context/UserContext";

export default function ProSignupModal({ onClose, onClientSignup }) {
  const { signup } = useUser();

  const handleProSignup = async (e) => {
    e.preventDefault();

    const username = e.target.username.value.trim();
    const firstName = e.target.firstName.value.trim();
    const lastName = e.target.lastName.value.trim();
    const businessName = e.target.businessName.value.trim();
    const email = e.target.email.value.trim();
    const password = e.target.password.value.trim();

    try {
      await signup(email, password, "pro", {
        username,
        firstName,
        lastName,
        businessName,
      });

      onClose();
      window.location.href = "/prodashboard";
    } catch (error) {
      alert("Erreur lors de l'inscription : " + error.message);
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

          <h2 className="text-3xl font-bold text-center mb-6">Join Glossed as a Pro</h2>

          <form className="space-y-4" onSubmit={handleProSignup}>
            <div>
              <label className="block text-sm font-medium text-gray-700">Username</label>
              <input
                type="text"
                name="username"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="yourusername"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                Will be stored in lowercase. Used to login and in chats later.
              </p>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">First name</label>
                <input
                  type="text"
                  name="firstName"
                  className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="Mary"
                  required
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm font-medium text-gray-700">Last name</label>
                <input
                  type="text"
                  name="lastName"
                  className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="Smith"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Business name</label>
              <input
                type="text"
                name="businessName"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="Your Salon or Brand"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Email</label>
              <input
                type="email"
                name="email"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="contact@yourbrand.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Password</label>
              <input
                type="password"
                name="password"
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="••••••••"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-gradient-to-r from-rose-600 to-red-600 text-white py-2.5 rounded-lg font-semibold hover:shadow-lg transition-all"
            >
              Join as a Pro
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
