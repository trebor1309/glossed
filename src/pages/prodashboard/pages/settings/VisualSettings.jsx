import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Upload, Save, FileText, IdCard } from "lucide-react";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/ui/ConfirmModal";

export default function VisualSettings() {
  const { session } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [profileUrl, setProfileUrl] = useState("");
  const [portfolio, setPortfolio] = useState([]);
  const [verification, setVerification] = useState("unverified");
  const [idDoc, setIdDoc] = useState(null);
  const [certDoc, setCertDoc] = useState(null);
  const [confirmModal, setConfirmModal] = useState({
    open: false,
    type: null,
    data: null,
  });

  // Charger les infos utilisateur
  useEffect(() => {
    const fetchData = async () => {
      if (!session?.user) return;
      setLoading(true);

      const { data, error } = await supabase
        .from("users")
        .select(
          "profile_photo, portfolio, verification_status, id_document, certificate_document"
        )
        .eq("id", session.user.id)
        .single();

      if (!error && data) {
        setProfileUrl(data.profile_photo || "");
        setPortfolio(data.portfolio || []);
        setVerification(data.verification_status || "unverified");
        setIdDoc(data.id_document || null);
        setCertDoc(data.certificate_document || null);
      }
      setLoading(false);
    };
    fetchData();
  }, [session]);

  // ---------- 🧩 Modale de confirmation ----------
  const handleConfirmAction = async () => {
    const { type, data } = confirmModal;

    if (type === "upload") await performPortfolioUpload(data);
    else if (type === "delete") await performDeleteImage(data);

    setConfirmModal({ open: false, type: null, data: null });
  };

  // ---------- 📸 Upload / replace profile photo ----------
  const handleProfileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !session?.user) return;

    const fileExt = file.name.split(".").pop();
    const fileName = `${session.user.id}_profile.${fileExt}`;
    const filePath = `profiles/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("glossed-media")
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      setToast({ message: "❌ Upload failed.", type: "error" });
      return;
    }

    const { data } = supabase.storage
      .from("glossed-media")
      .getPublicUrl(filePath);
    const newUrl = `${data.publicUrl}?t=${Date.now()}`;

    await supabase
      .from("users")
      .update({ profile_photo: newUrl })
      .eq("id", session.user.id);

    setProfileUrl(newUrl);
    setToast({ message: "✅ Profile photo updated!", type: "success" });
  };

  // ---------- 🗑️ Remove profile photo ----------
  const handleDeleteProfilePhoto = async () => {
    setConfirmModal({
      open: true,
      type: "deleteProfile",
      data: null,
    });
  };

  const confirmDeleteProfile = async () => {
    if (!profileUrl) return;

    try {
      const path = profileUrl.split("/").slice(-2).join("/");
      await supabase.storage.from("glossed-media").remove([path]);
      await supabase
        .from("users")
        .update({ profile_photo: null })
        .eq("id", session.user.id);

      setProfileUrl("");
      setToast({ message: "🗑️ Profile photo removed.", type: "success" });
    } catch {
      setToast({ message: "❌ Failed to delete photo.", type: "error" });
    }
    setConfirmModal({ open: false, type: null, data: null });
  };

  // ---------- 🖼️ Upload Portfolio (avec modale) ----------
  const handlePortfolioUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setConfirmModal({ open: true, type: "upload", data: files });
  };

  const performPortfolioUpload = async (files) => {
    const uploadedUrls = [];
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const filePath = `portfolio/${session.user.id}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("glossed-media")
        .upload(filePath, file, { upsert: false });
      if (!error) {
        const { data } = supabase.storage
          .from("glossed-media")
          .getPublicUrl(filePath);
        uploadedUrls.push(data.publicUrl);
      }
    }

    const newPortfolio = [...portfolio, ...uploadedUrls];
    await supabase
      .from("users")
      .update({ portfolio: newPortfolio })
      .eq("id", session.user.id);
    setPortfolio(newPortfolio);
    setToast({ message: "✅ Portfolio updated!", type: "success" });
  };

  // ---------- 🗑️ Supprimer une image ----------
  const handleDeleteImage = (url) =>
    setConfirmModal({ open: true, type: "delete", data: url });

  const performDeleteImage = async (urlToDelete) => {
    try {
      const path = urlToDelete.split("/").slice(-2).join("/");
      await supabase.storage.from("glossed-media").remove([path]);

      const newPortfolio = portfolio.filter((url) => url !== urlToDelete);
      await supabase
        .from("users")
        .update({ portfolio: newPortfolio })
        .eq("id", session.user.id);
      setPortfolio(newPortfolio);
      setToast({ message: "🗑️ Image deleted.", type: "success" });
    } catch {
      setToast({ message: "❌ Failed to delete image.", type: "error" });
    }
  };

  // ---------- 📤 Upload ID / Certificate ----------
  const handleDocUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const filePath = `verification/${type}/${session.user.id}_${type}.${ext}`;
    const { error } = await supabase.storage
      .from("glossed-media")
      .upload(filePath, file, { upsert: true, contentType: file.type });

    if (error) {
      setToast({ message: "❌ Upload failed.", type: "error" });
      return;
    }

    const updates = {
      [type === "id" ? "id_document" : "certificate_document"]: filePath,
      verification_status: "pending",
      updated_at: new Date().toISOString(),
    };

    await supabase.from("users").update(updates).eq("id", session.user.id);
    type === "id" ? setIdDoc(filePath) : setCertDoc(filePath);
    setToast({
      message: `✅ ${type === "id" ? "ID" : "Certificate"} uploaded.`,
      type: "success",
    });
  };

  // ---------- 💾 Sauvegarde du statut ----------
  const handleSave = async () => {
    if (!session?.user) return;
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ verification_status: verification })
      .eq("id", session.user.id);
    setSaving(false);
    setToast({
      message: error ? "❌ Error saving." : "✅ Status saved!",
      type: error ? "error" : "success",
    });
  };

  if (loading)
    return <p className="text-gray-500 text-sm">Loading visual settings...</p>;

  return (
    <div className="space-y-10">
      <h3 className="text-lg font-semibold text-gray-800">
        Visual & Verification
      </h3>

      {/* Profile photo */}
      <ProfileSection
        profileUrl={profileUrl}
        onUpload={handleProfileUpload}
        onDelete={handleDeleteProfilePhoto}
      />

      {/* Portfolio */}
      <PortfolioSection
        portfolio={portfolio}
        onUpload={handlePortfolioUpload}
        onDelete={handleDeleteImage}
      />

      {/* Verification */}
      <VerificationSection
        verification={verification}
        setVerification={setVerification}
        idDoc={idDoc}
        certDoc={certDoc}
        onUpload={handleDocUpload}
        onSave={handleSave}
        saving={saving}
      />

      {/* Toast + Confirm */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
      <ConfirmModal
        open={confirmModal.open}
        title={
          confirmModal.type === "upload"
            ? "Confirm Upload"
            : confirmModal.type === "deleteProfile"
            ? "Delete Profile Photo?"
            : "Delete Image?"
        }
        message={
          confirmModal.type === "upload"
            ? "Do you want to upload these photos to your portfolio?"
            : confirmModal.type === "deleteProfile"
            ? "Your profile picture will be permanently deleted."
            : "This image will be permanently removed."
        }
        confirmLabel={confirmModal.type === "upload" ? "Upload" : "Delete"}
        onConfirm={
          confirmModal.type === "deleteProfile"
            ? confirmDeleteProfile
            : handleConfirmAction
        }
        onCancel={() =>
          setConfirmModal({ open: false, type: null, data: null })
        }
      />
    </div>
  );
}

/* --- Sous-sections --- */

function ProfileSection({ profileUrl, onUpload, onDelete }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-6">
      <div className="w-24 h-24 rounded-full overflow-hidden border shadow">
        {profileUrl ? (
          <img
            src={profileUrl}
            alt="Profile"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-100 flex items-center justify-center text-gray-400 text-sm">
            No photo
          </div>
        )}
      </div>
      <div>
        <label className="text-sm font-medium text-gray-700 block mb-2">
          Profile Picture
        </label>
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <button
            className="px-4 py-2 bg-gray-100 border rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
            onClick={() => document.getElementById("profileUpload").click()}
          >
            <Upload size={16} /> Upload Profile Picture
          </button>
          <input
            id="profileUpload"
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onUpload}
          />
          {profileUrl && (
            <button
              onClick={onDelete}
              className="text-xs text-red-500 underline hover:text-red-600 sm:ml-2"
            >
              Remove photo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PortfolioSection({ portfolio, onUpload, onDelete }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700">
        Portfolio Pictures
      </label>
      <button
        className="mt-2 px-4 py-2 bg-gray-100 border rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
        onClick={() => document.getElementById("portfolioUpload").click()}
      >
        <Upload size={16} /> Upload Portfolio Photos
      </button>
      <input
        id="portfolioUpload"
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={onUpload}
      />

      {portfolio.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-4">
          {portfolio.map((url, i) => (
            <div key={i} className="relative group">
              <img
                src={url}
                alt="Portfolio"
                className="w-full h-24 object-cover rounded-lg shadow"
              />
              <button
                onClick={() => onDelete(url)}
                className="absolute top-1 right-1 bg-black/60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function VerificationSection({
  verification,
  setVerification,
  idDoc,
  certDoc,
  onUpload,
  onSave,
  saving,
}) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Verification Status
      </label>
      <select
        value={verification}
        onChange={(e) => setVerification(e.target.value)}
        className="w-full md:w-1/2 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
      >
        <option value="unverified">Unverified</option>
        <option value="pending">Pending Review</option>
        <option value="verified">Verified ✅</option>
      </select>

      <div className="flex flex-wrap gap-4 mt-4">
        <button
          className="px-4 py-2 bg-gray-100 border rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
          onClick={() => document.getElementById("idUpload").click()}
        >
          <IdCard size={16} /> Upload ID Document
        </button>
        <input
          id="idUpload"
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onUpload(e, "id")}
        />

        <button
          className="px-4 py-2 bg-gray-100 border rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
          onClick={() => document.getElementById("certUpload").click()}
        >
          <FileText size={16} /> Upload Certificate / Diploma
        </button>
        <input
          id="certUpload"
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          onChange={(e) => onUpload(e, "certificate")}
        />
      </div>

      <div className="mt-4 text-sm text-gray-600 space-y-1">
        {idDoc ? (
          <p>📄 ID Document uploaded</p>
        ) : (
          <p className="text-gray-400">ID Document missing</p>
        )}
        {certDoc ? (
          <p>🎓 Certificate uploaded</p>
        ) : (
          <p className="text-gray-400">Certificate missing</p>
        )}
      </div>

      <div className="text-right">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition-transform flex items-center gap-2 ml-auto disabled:opacity-70"
        >
          <Save size={18} />
          {saving ? "Saving..." : "Save Status"}
        </button>
      </div>
    </div>
  );
}
