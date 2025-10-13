import { useState } from "react";
import { User, MapPin, Banknote, CheckCircle } from "lucide-react";

export default function ProDashboardSettings() {
  const [profile, setProfile] = useState({
    businessName: "Beauty by Marie",
    email: "marie@glossed.app",
    location: "Brussels, Belgium",
    paymentMethod: "IBAN",
    iban: "BE12 3456 7890 1234",
    paypal: "",
    available: true,
  });

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setProfile((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // 🧠 Simulation d’enregistrement
    alert("Profile updated successfully ✨");
  };

  return (
    <section className="space-y-8">
      {/* 💼 Business Info */}
      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-2xl shadow border border-gray-100 space-y-6"
      >
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <User size={20} className="text-rose-600" />
          Business Information
        </h2>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Business Name
            </label>
            <input
              type="text"
              name="businessName"
              value={profile.businessName}
              onChange={handleChange}
              className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              name="email"
              value={profile.email}
              onChange={handleChange}
              className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>
        </div>

        {/* 📍 Location */}
        <div>
          <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
            <MapPin size={16} className="text-rose-600" /> Working Area
          </label>
          <input
            type="text"
            name="location"
            value={profile.location}
            onChange={handleChange}
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
          />
          <p className="text-sm text-gray-500 mt-1">
            Example: Brussels, Liège, Namur…
          </p>
        </div>

        {/* 💳 Payment Details */}
        <div className="border-t border-gray-100 pt-4">
          <h3 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
            <Banknote size={18} className="text-rose-600" /> Payment Method
          </h3>
          <select
            name="paymentMethod"
            value={profile.paymentMethod}
            onChange={handleChange}
            className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
          >
            <option value="IBAN">Bank Transfer (IBAN)</option>
            <option value="PayPal">PayPal</option>
          </select>

          {profile.paymentMethod === "IBAN" ? (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700">
                IBAN
              </label>
              <input
                type="text"
                name="iban"
                value={profile.iban}
                onChange={handleChange}
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
          ) : (
            <div className="mt-3">
              <label className="block text-sm font-medium text-gray-700">
                PayPal Email
              </label>
              <input
                type="email"
                name="paypal"
                value={profile.paypal}
                onChange={handleChange}
                className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {/* ⚙️ Availability */}
        <div className="flex items-center justify-between border-t border-gray-100 pt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              name="available"
              checked={profile.available}
              onChange={handleChange}
              className="w-5 h-5 accent-rose-600"
            />
            <span className="font-medium text-gray-700">
              Accepting new clients
            </span>
          </label>
          {profile.available ? (
            <CheckCircle size={20} className="text-green-600" />
          ) : (
            <span className="text-gray-500 text-sm italic">Unavailable</span>
          )}
        </div>

        {/* 💾 Save button */}
        <div className="text-right">
          <button
            type="submit"
            className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition-transform"
          >
            Save Changes
          </button>
        </div>
      </form>
    </section>
  );
}
