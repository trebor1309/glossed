import { useState, useEffect } from "react";
import { useUser } from "@/context/UserContext";
import { supabase } from "@/lib/supabaseClient";
import { Edit2, Save, Upload } from "lucide-react";
import Toast from "@/components/ui/Toast";

export default function DashboardAccount() {
  const { user } = useUser();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    address: "",
    phone_number: "",
    iban: "",
    email: "",
    profile_photo: "",
  });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);

  // 🔹 Charger les infos utilisateur
  useEffect(() => {
    const loadUser = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from("users")
        .select("first_name, last_name, address, phone_number, iban, email, profile_photo")
        .eq("id", user.id)
        .maybeSingle();

      if (error) console.error("❌ Supabase error:", error.message);
      if (data) setForm((prev) => ({ ...prev, ...data }));
    };
    loadUser();
  }, [user?.id]);

  // 🔸 Gérer les changements
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // 📸 Upload photo vers Supabase Storage
  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file || !user?.id) return;

    const fileName = `${user.id}_profile.${file.name.split(".").pop()}`;
    const { error: uploadError } = await supabase.storage
      .from("glossed-media")
      .upload(`profile/${fileName}`, file, { upsert: true });

    if (uploadError) {
      console.error("❌ Upload failed:", uploadError.message);
      setToast({ message: "Error uploading image.", type: "error" });
      return;
    }

    const { data: urlData } = supabase.storage
      .from("glossed-media")
      .getPublicUrl(`profile/${fileName}`);

    const imageUrl = urlData.publicUrl;
    setForm((prev) => ({ ...prev, profile_photo: imageUrl }));
    setPhotoFile(null);

    // Mise à jour directe dans Supabase
    await supabase.from("users").update({ profile_photo: imageUrl }).eq("id", user.id);

    setToast({ message: "Profile photo updated successfully!", type: "success" });
  };

  // 💾 Sauvegarde des modifications
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);

    const updates = {
      first_name: form.first_name || "",
      last_name: form.last_name || "",
      address: form.address || "",
      phone_number: form.phone_number || "",
      iban: form.iban || "",
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("users").update(updates).eq("id", user.id);
    setSaving(false);

    if (error) {
      setToast({ message: "❌ Error saving profile.", type: "error" });
    } else {
      setEditing(false);
      setToast({ message: "✅ Profile updated successfully!", type: "success" });
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-10 p-6 bg-white rounded-2xl shadow space-y-8 border border-gray-100">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-800">My Account</h2>
        <button
          onClick={() => (editing ? handleSave() : setEditing(true))}
          disabled={saving}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition
            ${
              editing
                ? "bg-gradient-to-r from-rose-600 to-red-600 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
        >
          {editing ? <Save size={16} /> : <Edit2 size={16} />}
          {editing ? (saving ? "Saving..." : "Save") : "Edit"}
        </button>
      </div>

      {/* --- Photo de profil --- */}
      <div className="flex flex-col items-center text-center space-y-2">
        {form.profile_photo ? (
          <img
            src={form.profile_photo}
            alt="Profile"
            className="w-24 h-24 rounded-full object-cover border-4 border-white shadow"
          />
        ) : (
          <div className="w-24 h-24 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 text-3xl font-semibold shadow">
            {form.first_name?.[0]?.toUpperCase() || "?"}
          </div>
        )}
        {editing && (
          <label className="flex items-center gap-2 text-sm text-rose-600 cursor-pointer mt-1">
            <Upload size={16} />
            Change photo
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
          </label>
        )}
      </div>

      {/* --- Infos personnelles --- */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-700 mb-2">Personal Information</h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <input
            name="first_name"
            value={form.first_name || ""}
            onChange={handleChange}
            disabled={!editing}
            placeholder="First name"
            className={`border rounded-lg px-4 py-2 ${
              editing ? "focus:ring-2 focus:ring-rose-500" : "bg-gray-50 text-gray-600"
            }`}
          />
          <input
            name="last_name"
            value={form.last_name || ""}
            onChange={handleChange}
            disabled={!editing}
            placeholder="Last name"
            className={`border rounded-lg px-4 py-2 ${
              editing ? "focus:ring-2 focus:ring-rose-500" : "bg-gray-50 text-gray-600"
            }`}
          />
        </div>

        <input
          name="address"
          value={form.address || ""}
          onChange={handleChange}
          disabled={!editing}
          placeholder="Address"
          className={`w-full border rounded-lg px-4 py-2 ${
            editing ? "focus:ring-2 focus:ring-rose-500" : "bg-gray-50 text-gray-600"
          }`}
        />

        <input
          name="phone_number"
          value={form.phone_number || ""}
          onChange={handleChange}
          disabled={!editing}
          placeholder="Phone number"
          className={`w-full border rounded-lg px-4 py-2 ${
            editing ? "focus:ring-2 focus:ring-rose-500" : "bg-gray-50 text-gray-600"
          }`}
        />
      </div>

      {/* --- Paiements & sécurité --- */}
      <div className="space-y-4 border-t pt-4">
        <h3 className="font-semibold text-gray-700 mb-2">Payment & Security</h3>

        <input
          name="iban"
          value={form.iban || ""}
          onChange={handleChange}
          disabled={!editing}
          placeholder="IBAN (for refunds)"
          className={`w-full border rounded-lg px-4 py-2 ${
            editing ? "focus:ring-2 focus:ring-rose-500" : "bg-gray-50 text-gray-600"
          }`}
        />

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            name="email"
            value={form.email || ""}
            onChange={handleChange}
            disabled={!editing}
            type="email"
            className={`w-full border rounded-lg px-4 py-2 ${
              editing ? "focus:ring-2 focus:ring-rose-500" : "bg-gray-50 text-gray-600"
            }`}
          />
        </div>

        {editing && (
          <>
            <input
              name="old_password"
              type="password"
              placeholder="Current password"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
            <input
              name="new_password"
              type="password"
              placeholder="New password"
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500"
            />
          </>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
