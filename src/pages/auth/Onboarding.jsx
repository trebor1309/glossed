// src/pages/auth/Onboarding.jsx
/* global google */
import { useEffect, useState } from "react";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { useNavigate } from "react-router-dom";
import { User, Briefcase, MapPin, Phone } from "lucide-react";

export default function Onboarding() {
  const { user } = useUser();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [role, setRole] = useState(user?.activeRole || user?.role || "client");
  const [username, setUsername] = useState(user?.username || "");
  const [firstName, setFirstName] = useState(user?.first_name || "");
  const [lastName, setLastName] = useState(user?.last_name || "");
  const [phone, setPhone] = useState(user?.phone_number || "");
  const [address, setAddress] = useState(user?.address || "");
  const [latitude, setLatitude] = useState(user?.latitude ?? null);
  const [longitude, setLongitude] = useState(user?.longitude ?? null);

  const [businessName, setBusinessName] = useState(user?.business_name || "");
  const [businessAddress, setBusinessAddress] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [proEmail, setProEmail] = useState(user?.email || "");

  useEffect(() => {
    if (!user) {
      navigate("/", { replace: true });
    }
  }, [user, navigate]);

  // Google Places pour l'adresse perso
  useEffect(() => {
    if (!window.google?.maps?.places) return;
    const input = document.getElementById("onboarding-address-input");
    if (!input) return;
    if (input.dataset.autocompleteAttached) return;
    input.dataset.autocompleteAttached = "true";

    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ["address"],
      componentRestrictions: { country: "be" },
      fields: ["formatted_address", "geometry"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry) return;
      const formatted = place.formatted_address;
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setAddress(formatted);
      setLatitude(lat);
      setLongitude(lng);
    });
  }, []);

  // On peut plus tard ajouter un autocomplete séparé pour businessAddress si tu veux

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user) return;

    if (!username.trim()) {
      alert("Please choose a username.");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        id: user.id,
        email: user.email,
        role,
        active_role: role,
        username: username.trim().toLowerCase(),
        first_name: firstName || null,
        last_name: lastName || null,
        phone_number: phone || null,
        address: address || null,
        latitude,
        longitude,
        theme: user.theme || "light",
      };

      if (role === "pro") {
        payload.business_name = businessName || null;
        payload.business_address = businessAddress || address || null;
        payload.company_number = companyNumber || null;
        payload.vat_number = vatNumber || null;
        payload.professional_email = proEmail || user.email;
      } else {
        payload.business_name = null;
      }

      const { error } = await supabase.from("users").upsert(payload, { onConflict: "id" });

      if (error) {
        console.error("❌ Onboarding upsert error:", error.message);
        alert("Could not save your profile: " + error.message);
        setLoading(false);
        return;
      }

      // On force un reload vers le bon dashboard → UserContext se mettra à jour tout seul
      if (role === "pro") {
        window.location.assign("/prodashboard");
      } else {
        window.location.assign("/dashboard");
      }
    } catch (err) {
      console.error(err);
      alert("Unexpected error: " + err.message);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto py-10 px-4 sm:px-6 lg:px-8">
      <div className="bg-white rounded-2xl shadow-lg p-6 sm:p-8">
        <h1 className="text-2xl sm:text-3xl font-bold mb-2 flex items-center gap-2">
          <User size={24} className="text-rose-500" />
          Complete your profile
        </h1>
        <p className="text-gray-600 mb-6">
          Tell us a bit more about you so we can personalise your Glossed experience.
        </p>

        <form className="space-y-6" onSubmit={handleSubmit}>
          {/* Role */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2">Account type</h2>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setRole("client")}
                className={`px-4 py-2 rounded-full border text-sm font-medium flex items-center gap-2 ${
                  role === "client"
                    ? "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-gray-300 text-gray-600"
                }`}
              >
                <User size={18} />
                Client
              </button>
              <button
                type="button"
                onClick={() => setRole("pro")}
                className={`px-4 py-2 rounded-full border text-sm font-medium flex items-center gap-2 ${
                  role === "pro"
                    ? "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-gray-300 text-gray-600"
                }`}
              >
                <Briefcase size={18} />
                Beauty professional
              </button>
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Username <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
              placeholder="yourname"
              required
            />
            <p className="text-xs text-gray-400 mt-1">
              This is how you’ll appear in chats and bookings.
            </p>
          </div>

          {/* Names */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">First name</label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="Jane"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last name</label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                placeholder="Doe"
              />
            </div>
          </div>

          {/* Contact */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <Phone size={18} className="text-rose-500" />
              Contact
            </h2>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Phone number (international format)
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="+324..."
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
              <MapPin size={18} className="text-rose-500" />
              Where are you based?
            </h2>
            <input
              id="onboarding-address-input"
              type="text"
              defaultValue={address}
              placeholder="Enter your address"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              We use this to match you with nearby professionals or clients.
            </p>
          </div>

          {/* Business section for Pros */}
          {role === "pro" && (
            <div className="border-t pt-4 mt-4 space-y-4">
              <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Briefcase size={18} className="text-rose-500" />
                Business details
              </h2>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Business / salon name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="Beauty by Mary"
                  required={role === "pro"}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Business address (optional)
                </label>
                <input
                  type="text"
                  value={businessAddress}
                  onChange={(e) => setBusinessAddress(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="Your salon address"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Company number (optional)
                  </label>
                  <input
                    type="text"
                    value={companyNumber}
                    onChange={(e) => setCompanyNumber(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    placeholder="0123.456.789"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    VAT number (optional)
                  </label>
                  <input
                    type="text"
                    value={vatNumber}
                    onChange={(e) => setVatNumber(e.target.value)}
                    className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                    placeholder="BE0..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Professional email (optional)
                </label>
                <input
                  type="email"
                  value={proEmail}
                  onChange={(e) => setProEmail(e.target.value)}
                  className="mt-1 w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
                  placeholder="contact@yourbrand.com"
                />
              </div>
            </div>
          )}

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 rounded-full bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold text-sm hover:scale-[1.02] transition disabled:opacity-60"
            >
              {loading ? "Saving..." : "Continue to dashboard"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
