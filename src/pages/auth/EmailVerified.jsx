// src/pages/auth/EmailVerified.jsx
import { CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function EmailVerified() {
  const navigate = useNavigate();

  return (
    <div className="max-w-xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
          <CheckCircle className="text-emerald-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Email verified</h1>
        <p className="text-gray-600 mb-4">
          Your email address is now confirmed. You can sign in and complete your profile.
        </p>

        <button
          onClick={() => navigate("/")}
          className="px-5 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white text-sm font-semibold hover:scale-[1.02] transition"
        >
          Go to homepage
        </button>
      </div>
    </div>
  );
}
