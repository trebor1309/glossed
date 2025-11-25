// 📄 src/pages/auth/OnboardingPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Upload, User, Building2, Phone } from "lucide-react";

export default function OnboardingPage() {
  const { user, fetchUserProfile } = useUser();
  const navigate = useNavigate();

  const [roleChoice, setRoleChoice] = useState(user?.role || null);

  const [username, setUsername] = useState(user?.username || "");
  const [phone, setPhone] = useState(user?.phone_number || "");
  const [address, setAddress] = useState(user?.address || "");
  const [lat, setLat] = useState(user?.latitude || null);
  const [lng, setLng] = useState(user?.longitude || null);

  const [profileFile, setProfileFile] = useState(null);

  // Champs PRO
  const [businessName, setBusinessName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [vatNumber, setVatNumber] = useState("");
  const [proEmail, setProEmail] = useState("");

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  /* --------------------------------------------------------
     Google Places Autocomplete
  -------------------------------------------------------- */
  useEffect(() => {
    if (!window.google?.maps?.places) return;

    const input = document.getElementById("autocomplete-address");
    if (!input || input.dataset.autocompleteAttached) return;

    input.dataset.autocompleteAttached = "true";

    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ["address"],
      componentRestrictions: { country: "be" },
      fields: ["formatted_address", "geometry"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry) return;

      setAddress(place.formatted_address);
      setLat(place.geometry.location.lat());
      setLng(place.geometry.location.lng());
    });
  }, []);

  /* --------------------------------------------------------
     Upload to Supabase Storage
  -------------------------------------------------------- */
  const handleUpload = async () => {
    if (!profileFile) return user?.profile_photo || null;

    try {
      setUploading(true);

      const fileExt = profileFile.name.split(".").pop();
      const fileName = `${user.id}_profile.${fileExt}`;
      const filePath = `profiles/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("glossed-media")
        .upload(filePath, profileFile, { upsert: true });

      if (uploadError) throw uploadError;

      return `${supabase.storageUrl}/object/public/glossed-media/${filePath}`;
    } catch (err) {
      alert("Error uploading image: " + err.message);
      return null;
    } finally {
      setUploading(false);
    }
  };

  /* --------------------------------------------------------
     Save Profile
  -------------------------------------------------------- */
  const handleSave = async () => {
    if (!username.trim()) return alert("Please choose a username.");
    if (!phone.trim()) return alert("Please provide a phone number.");
    if (!address.trim()) return alert("Please select a valid address.");
    if (!roleChoice) return alert("Please select Client or Pro.");

    setSaving(true);

    try {
      const imageUrl = await handleUpload();

      const payload = {
        username: username.trim().toLowerCase(),
        phone_number: phone.trim(),
        address,
        latitude: lat,
        longitude: lng,
        profile_photo: imageUrl,
        active_role: roleChoice,
        role: roleChoice,
        onboarding_completed: true,
      };

      if (roleChoice === "pro") {
        payload.business_name = businessName || null;
        payload.company_number = companyNumber || null;
        payload.vat_number = vatNumber || null;
        payload.professional_email = proEmail || null;
      }

      const { error } = await supabase.from("users").update(payload).eq("id", user.id);

      if (error) throw error;

      await fetchUserProfile({ id: user.id, email: user.email });

      navigate(roleChoice === "pro" ? "/prodashboard" : "/dashboard");
    } catch (err) {
      alert("Error saving: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------------------------------------
     UI
  -------------------------------------------------------- */
  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white shadow-xl rounded-3xl p-8"
      >
        <h1 className="text-3xl font-bold mb-6 text-center">Complete Your Profile</h1>

        {/* Choix Client / Pro */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <button
            onClick={() => setRoleChoice("client")}
            className={`p-4 rounded-xl border-2 ${
              roleChoice === "client" ? "border-rose-500 bg-rose-50" : "border-gray-300"
            }`}
          >
            Client
          </button>

          <button
            onClick={() => setRoleChoice("pro")}
            className={`p-4 rounded-xl border-2 ${
              roleChoice === "pro" ? "border-rose-500 bg-rose-50" : "border-gray-300"
            }`}
          >
            Beauty Professional
          </button>
        </div>

        {/* Photo */}
        <div className="mb-6">
          <label className="font-medium flex items-center gap-2">
            <Upload size={18} /> Profile Photo
          </label>
          <input
            type="file"
            accept="image/*"
            className="mt-2"
            onChange={(e) => setProfileFile(e.target.files[0])}
          />
        </div>

        {/* Username */}
        <div className="mb-6">
          <label className="font-medium flex items-center gap-2">
            <User size={18} /> Username
          </label>
          <input
            type="text"
            placeholder="yourname"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full mt-2 px-4 py-2 border rounded-lg"
          />
        </div>

        {/* Phone */}
        <div className="mb-6">
          <label className="font-medium flex items-center gap-2">
            <Phone size={18} /> Phone number
          </label>
          <input
            type="text"
            placeholder="+324..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full mt-2 px-4 py-2 border rounded-lg"
          />
        </div>

        {/* Address */}
        <div className="mb-6">
          <label className="font-medium flex items-center gap-2">
            <MapPin size={18} /> Address
          </label>
          <input
            id="autocomplete-address"
            type="text"
            value={address}
            placeholder="Enter your address"
            onChange={(e) => setAddress(e.target.value)}
            className="w-full mt-2 px-4 py-2 border rounded-lg"
          />
        </div>

        {/* Champs PRO */}
        {roleChoice === "pro" && (
          <div className="space-y-6 mt-8 border-t pt-8">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Building2 size={20} /> Your Business Details
            </h2>

            <div>
              <label className="font-medium">Business name</label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full mt-2 px-4 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="font-medium">Company number</label>
              <input
                type="text"
                value={companyNumber}
                onChange={(e) => setCompanyNumber(e.target.value)}
                className="w-full mt-2 px-4 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="font-medium">VAT number</label>
              <input
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                className="w-full mt-2 px-4 py-2 border rounded-lg"
              />
            </div>

            <div>
              <label className="font-medium">Professional email</label>
              <input
                type="email"
                value={proEmail}
                onChange={(e) => setProEmail(e.target.value)}
                className="w-full mt-2 px-4 py-2 border rounded-lg"
              />
            </div>
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={saving || uploading}
          className="mt-10 w-full py-3 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-xl font-semibold shadow-lg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Finish Setup"}
        </button>
      </motion.div>
    </div>
  );
}
