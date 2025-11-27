// 📄 src/pages/auth/OnboardingPage.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MapPin, Upload, User, Building2, Phone, Mail } from "lucide-react";
import { useLoadScript } from "@react-google-maps/api";

const libraries = ["places"];

export default function OnboardingPage() {
  const { user, fetchUserProfile } = useUser();
  const navigate = useNavigate();

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  // 🧠 Rôle réel en base
  const forcedRole = user?.role === "pro" ? "pro" : null;

  // 👉 Rôle "actif" dans le formulaire
  const [roleChoice, setRoleChoice] = useState(
    forcedRole || user?.activeRole || user?.role || "client"
  );

  // 🧍 Infos "client"
  const [username, setUsername] = useState(user?.username || "");
  const [phone, setPhone] = useState(user?.phone_number || "");
  const [address, setAddress] = useState(user?.address || "");
  const [lat, setLat] = useState(user?.latitude ?? null);
  const [lng, setLng] = useState(user?.longitude ?? null);

  const [profileFile, setProfileFile] = useState(null);

  // 🧾 Infos "pro" (business)
  const [businessName, setBusinessName] = useState(user?.business_name || "");
  const [companyNumber, setCompanyNumber] = useState(user?.company_number || "");
  const [vatNumber, setVatNumber] = useState(user?.vat_number || "");
  const [proEmail, setProEmail] = useState(user?.professional_email || "");
  const [businessAddress, setBusinessAddress] = useState(user?.business_address || "");
  const [businessSameAsPrivate, setBusinessSameAsPrivate] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isProFlow = forcedRole === "pro" || roleChoice === "pro";

  /* --------------------------------------------------------
     Google Places Autocomplete (privé + business)
  -------------------------------------------------------- */
  useEffect(() => {
    if (!isLoaded) return;
    if (!window.google?.maps?.places) return;

    const attachAutocomplete = (inputId, onPlaceSelected) => {
      const input = document.getElementById(inputId);
      if (!input) return;
      if (input.dataset.autocompleteAttached) return;

      input.dataset.autocompleteAttached = "true";

      const autocomplete = new window.google.maps.places.Autocomplete(input, {
        types: ["address"],
        componentRestrictions: { country: "be" },
        fields: ["formatted_address", "geometry"],
      });

      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry) return;

        const formatted = place.formatted_address;
        const location = place.geometry.location;

        onPlaceSelected({
          formatted,
          lat: location.lat(),
          lng: location.lng(),
        });
      });
    };

    // Adresse privée
    attachAutocomplete("autocomplete-address", ({ formatted, lat, lng }) => {
      setAddress(formatted);
      setLat(lat);
      setLng(lng);

      if (businessSameAsPrivate) {
        setBusinessAddress(formatted);
      }
    });

    // Adresse business (uniquement si elle est différente)
    if (!businessSameAsPrivate) {
      attachAutocomplete("autocomplete-business-address", ({ formatted }) => {
        setBusinessAddress(formatted);
      });
    }
  }, [isLoaded, businessSameAsPrivate]);

  // 🔄 Sync businessAddress si "Same as private" est coché
  useEffect(() => {
    if (businessSameAsPrivate) {
      setBusinessAddress(address || "");
    }
  }, [address, businessSameAsPrivate]);

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

      // Si tu préfères, tu peux remplacer par .getPublicUrl plus tard
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

    // Si aucune contrainte, roleChoice peut rester "client" sans souci
    if (!forcedRole && !roleChoice) {
      return alert("Please select Client or Pro.");
    }

    // 🔐 Si on est en flux pro (upgrade ou signup pro)
    if (isProFlow) {
      if (!businessName.trim()) {
        return alert("Please provide your business name.");
      }

      const finalBusinessAddress = businessSameAsPrivate ? address : businessAddress;

      if (!finalBusinessAddress || !finalBusinessAddress.trim()) {
        return alert("Please provide your business address.");
      }
    }

    setSaving(true);

    try {
      const imageUrl = await handleUpload();

      const finalRole = forcedRole || roleChoice || user?.role || "client";

      const finalBusinessAddress = isProFlow
        ? businessSameAsPrivate
          ? address
          : businessAddress
        : user?.business_address || null;

      const payload = {
        username: username.trim().toLowerCase(),
        phone_number: phone.trim(),
        address,
        latitude: lat,
        longitude: lng,
        profile_photo: imageUrl,
        role: finalRole,
        active_role: finalRole,
        onboarding_completed: true,
      };

      if (isProFlow) {
        payload.business_name = businessName.trim();
        payload.business_address = finalBusinessAddress;
        payload.company_number = companyNumber.trim() || null;
        payload.vat_number = vatNumber.trim() || null;
        payload.professional_email = proEmail.trim() || null;
      }

      const { error } = await supabase.from("users").update(payload).eq("id", user.id);
      if (error) throw error;

      await fetchUserProfile({ id: user.id, email: user.email });

      navigate(finalRole === "pro" ? "/prodashboard" : "/dashboard");
    } catch (err) {
      alert("Error saving: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* --------------------------------------------------------
     UI: états de chargement Google
  -------------------------------------------------------- */
  if (loadError) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6 text-center text-red-600">
        Error loading Google Maps. Please refresh the page.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="max-w-3xl mx-auto py-12 px-6 text-center text-gray-500">
        Loading location tools…
      </div>
    );
  }

  /* --------------------------------------------------------
     RENDER
  -------------------------------------------------------- */
  return (
    <div className="max-w-3xl mx-auto py-12 px-6">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white shadow-xl rounded-3xl p-8"
      >
        <h1 className="text-3xl font-bold mb-6 text-center">Complete Your Profile</h1>

        {/* Choix Client / Pro — masqué si rôle déjà PRO en base */}
        {!forcedRole && (
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
        )}

        {forcedRole === "pro" && (
          <div className="p-4 mb-8 rounded-xl border-2 border-rose-500 bg-rose-50 text-center">
            <strong>You are completing your Professional profile</strong>
          </div>
        )}

        {/* Photo */}
        <div className="mb-6">
          <label className="font-medium flex items-center gap-2">
            <Upload size={18} /> Profile Photo
          </label>
          <input
            type="file"
            accept="image/*"
            className="mt-2"
            onChange={(e) => setProfileFile(e.target.files?.[0] || null)}
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

        {/* Adresse privée */}
        <div className="mb-6">
          <label className="font-medium flex items-center gap-2">
            <MapPin size={18} /> Private address
          </label>
          <input
            id="autocomplete-address"
            type="text"
            value={address}
            placeholder="Enter your private address"
            onChange={(e) => setAddress(e.target.value)}
            className="w-full mt-2 px-4 py-2 border rounded-lg"
          />
        </div>

        {/* Champs PRO */}
        {isProFlow && (
          <div className="space-y-6 mt-8 border-t pt-8">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Building2 size={20} /> Business details
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

            <div className="flex items-center gap-2 mt-4">
              <input
                id="same-as-private"
                type="checkbox"
                checked={businessSameAsPrivate}
                onChange={(e) => setBusinessSameAsPrivate(e.target.checked)}
              />
              <label htmlFor="same-as-private" className="text-sm text-gray-700">
                Business address is the same as my private address
              </label>
            </div>

            <div>
              <label className="font-medium">Business address</label>
              <input
                id="autocomplete-business-address"
                type="text"
                value={businessAddress}
                placeholder="Enter your business address"
                onChange={(e) => setBusinessAddress(e.target.value)}
                disabled={businessSameAsPrivate}
                className={`w-full mt-2 px-4 py-2 border rounded-lg ${
                  businessSameAsPrivate ? "bg-gray-100 cursor-not-allowed" : ""
                }`}
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
              <label className="font-medium flex items-center gap-2">
                <Mail size={18} /> Professional email
              </label>
              <input
                type="email"
                value={proEmail}
                onChange={(e) => setProEmail(e.target.value)}
                placeholder="yourbusiness@email.com"
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
