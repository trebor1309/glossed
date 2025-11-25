// 📄 src/pages/auth/CheckEmail.jsx
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { Mail, RefreshCcw } from "lucide-react";

export default function CheckEmail() {
  const [resending, setResending] = useState(false);
  const [done, setDone] = useState(false);

  const resendEmail = async () => {
    const storedEmail = localStorage.getItem("pending_signup_email");
    if (!storedEmail) {
      alert("No email detected.");
      return;
    }

    try {
      setResending(true);

      const { error } = await supabase.auth.resend({
        type: "signup",
        email: storedEmail,
      });

      if (error) throw error;

      setDone(true);
    } catch (err) {
      alert("Error sending email: " + err.message);
    } finally {
      setResending(false);
    }
  };

  const email = localStorage.getItem("pending_signup_email");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center"
      >
        <div className="flex justify-center mb-4">
          <Mail size={48} className="text-rose-500" />
        </div>

        <h1 className="text-3xl font-bold mb-3">Check your email</h1>
        <p className="text-gray-600 mb-6">
          We’ve sent a confirmation email to:
          <br />
          <span className="font-semibold">{email}</span>
          <br />
          Please click the link inside to activate your account.
        </p>

        {!done ? (
          <button
            onClick={resendEmail}
            disabled={resending}
            className="w-full py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <RefreshCcw size={18} />
            {resending ? "Sending..." : "Resend email"}
          </button>
        ) : (
          <p className="text-green-600 font-medium">Email sent ✔</p>
        )}
      </motion.div>
    </div>
  );
}
