// 📄 src/pages/dashboard/pages/DashboardAccount.jsx
import { useNavigate } from "react-router-dom";
import { CreditCard, LogOut, User } from "lucide-react";

export default function DashboardAccount() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("user");
    navigate("/");
  };

  return (
    <section className="mt-10 max-w-4xl mx-auto p-4 text-center space-y-6">
      {/* Profil utilisateur */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-r from-rose-600 to-red-600 flex items-center justify-center text-white text-2xl font-bold">
            R
          </div>
          <div>
            <h2 className="text-xl font-semibold text-gray-800">Robert Heinen</h2>
            <p className="text-gray-500 text-sm">Client since 2025</p>
          </div>
        </div>
      </div>

      {/* Paiements */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-rose-600" />
          Payment Methods
        </h3>
        <ul className="space-y-3 text-gray-600">
          <li className="flex items-center justify-between">
            <span>Visa •••• 1824</span>
            <span className="text-sm text-gray-400">Default</span>
          </li>
          <li className="flex items-center justify-between">
            <span>MasterCard •••• 9021</span>
            <button className="text-sm text-rose-600 hover:underline">Remove</button>
          </li>
        </ul>
        <button className="mt-5 px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full text-sm font-medium shadow hover:shadow-md hover:scale-105 transition-transform">
          Add new card
        </button>
      </div>

      {/* Compte */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <User className="w-5 h-5 text-rose-600" />
          Account Settings
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          Manage your profile information and security preferences.
        </p>
        <button
          onClick={() => navigate("/dashboard/settings")}
          className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-700 hover:text-rose-600 hover:border-rose-400 transition-all"
        >
          Go to Settings
        </button>
      </div>

      {/* Déconnexion */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <LogOut className="w-5 h-5 text-rose-600" />
          Logout
        </h3>
        <p className="text-gray-600 text-sm mb-4">
          You can log out of your account anytime.
        </p>
        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full text-sm font-medium shadow hover:shadow-md hover:scale-105 transition-transform"
        >
          Log out
        </button>
      </div>
    </section>
  );
}
