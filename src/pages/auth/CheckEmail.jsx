// src/pages/auth/CheckEmail.jsx
import { Mail, ArrowLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

export default function CheckEmail() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = location.state?.email || "";

  return (
    <div className="max-w-xl mx-auto py-16 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-rose-100 flex items-center justify-center mb-4">
          <Mail className="text-rose-600" />
        </div>
        <h1 className="text-2xl font-bold mb-2">Check your email</h1>
        <p className="text-gray-600 mb-4">
          We’ve sent a confirmation link to{" "}
          <span className="font-semibold">{email || "your inbox"}</span>.
        </p>
        <p className="text-sm text-gray-500 mb-6">
          Click the link in the email to confirm your address. Once confirmed, you can sign in and
          finish your profile.
        </p>

        <button
          onClick={() => navigate("/")}
          className="inline-flex items-center px-4 py-2 rounded-full border border-gray-300 text-gray-700 text-sm font-medium hover:bg-gray-100 transition"
        >
          <ArrowLeft size={16} className="mr-2" />
          Back to home
        </button>
      </div>
    </div>
  );
}
