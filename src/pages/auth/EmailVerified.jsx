// 📄 src/pages/auth/EmailVerified.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle } from "lucide-react";
import InlineAlert from "@/components/ui/InlineAlert";

export default function EmailVerified() {
  const [status, setStatus] = useState("loading");
  const [destination, setDestination] = useState("/onboarding");
  const navigate = useNavigate();

  useEffect(() => {
    const processVerification = async () => {
      try {
        const queryParams = new URLSearchParams(window.location.search);
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const code = queryParams.get("code");
        const access_token = hashParams.get("access_token");
        const refresh_token = hashParams.get("refresh_token");

        let { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData.session && code) {
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
          sessionData = { session: data.session };
        } else if (!sessionData.session && access_token && refresh_token) {
          const { data, error } = await supabase.auth.setSession({ access_token, refresh_token });
          if (error) throw error;
          sessionData = { session: data.session };
        }

        const user = sessionData.session?.user;
        if (!user) throw new Error("No verified session was returned.");

        // ➤ On récupère son profil
        const { data: profile, error: profErr } = await supabase
          .from("users")
          .select("onboarding_completed, active_role, role")
          .eq("id", user.id)
          .single();

        if (profErr) throw profErr;

        setStatus("success");
        localStorage.removeItem("pending_signup_email");

        const nextDestination =
          profile.onboarding_completed !== true
            ? "/onboarding"
            : profile.active_role === "pro" || profile.role === "pro"
              ? "/prodashboard"
              : "/dashboard";
        setDestination(nextDestination);

        // ➤ Redirection selon complétude du profil
        setTimeout(() => {
          navigate(nextDestination, { replace: true });
        }, 3500);
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
            <p className="text-gray-600">
              Your address is confirmed. You can now continue to Glossed.
            </p>
            <button
              type="button"
              onClick={() => navigate(destination, { replace: true })}
              className="mt-6 rounded-full bg-rose-600 px-5 py-2.5 font-semibold text-white"
            >
              Continue
            </button>
          </>
        )}

        {status === "invalid" && (
          <>
            <h1 className="text-2xl font-bold text-red-600 mb-3">Invalid link</h1>
            <InlineAlert message="This verification link is invalid or has expired. Request a new email or sign in if your address is already confirmed." />
            <button
              type="button"
              onClick={() => navigate("/", { replace: true })}
              className="mt-6 rounded-full border border-gray-300 px-5 py-2.5 font-semibold text-gray-800"
            >
              Back to Glossed
            </button>
          </>
        )}
      </motion.div>
    </div>
  );
}
