// 📄 src/pages/auth/EmailVerified.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";

export default function EmailVerified() {
  const [status, setStatus] = useState("loading");
  const navigate = useNavigate();

  useEffect(() => {
    const processVerification = async () => {
      try {
        // 🔍 Le lien Supabase fournit "access_token" et "refresh_token"
        const hashParams = new URLSearchParams(window.location.hash.substring(1));

        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        if (!access_token || !refresh_token) {
          setStatus("invalid");
          return;
        }

        // 🎫 Connexion automatique via le token fourni
        const { data, error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });

        if (error) throw error;

        const user = data.user;

        // ➤ On récupère son profil
        const { data: profile, error: profErr } = await supabase
          .from("users")
          .select("*")
          .eq("id", user.id)
          .single();

        if (profErr) throw profErr;

        setStatus("success");

        // ➤ Redirection selon complétude du profil
        setTimeout(() => {
          if (!profile.username || !profile.address || !profile.phone_number) {
            navigate("/auth/onboarding");
          } else {
            navigate("/dashboard");
          }
        }, 2000);
      } catch (err) {
        console.error(err);
        setStatus("invalid");
      }
    };

    processVerification();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-amber-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white p-10 rounded-3xl shadow-xl max-w-md w-full text-center"
      >
        {status === "loading" && (
          <p className="text-gray-600 animate-pulse">Validating your email...</p>
        )}

        {status === "success" && (
          <>
            <CheckCircle size={64} className="text-green-500 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">Email verified!</h1>
            <p className="text-gray-600">Redirecting...</p>
          </>
        )}

        {status === "invalid" && (
          <>
            <h1 className="text-2xl font-bold text-red-600 mb-3">Invalid link</h1>
            <p className="text-gray-600">Your verification link is invalid or expired.</p>
          </>
        )}
      </motion.div>
    </div>
  );
}
