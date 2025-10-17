import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Edit2, Save, Upload, FileText, IdCard } from "lucide-react";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/ui/ConfirmModal";

export default function VisualSettings() {
  const { user } = useUser();
  const [editing, setEditing] = useState(false);
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

  // 🔍 Charger les données
  useEffect(() => {
    const loadVisuals = async () => {
      if (!user?.id) return;

      const { data, error } = await supabase
        .from("users")
        .select(
          "profile_photo, portfolio, verification_status, id_document, certificate_document"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) console.error(error);
      if (data) {
        setProfileUrl(data.profile_photo || "");
        setPortfolio(Array.isArray(data.portfolio) ? data.portfolio : []);
        setVerification(data.verification_status || "unverified");
        setIdDoc(data.id_document || null);
        setCertDoc(data.certificate_document || null);
      }
    };

    loadVisuals();
  }, [user?.id]);

  // 💾 Sauvegarde du statut
  const handleSave = async () => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ verification_status: verification })
      .eq("id", user.id);

    setSaving(false);
    if (error)
      setToast({
        message: "❌ Error saving verification status.",
        type: "error",
      });
    else {
      setToast({ message: "✅ Visual information updated!", type: "success" });
      setEditing(false);
    }
  };

  // --- Gestion des uploads ---

  const uploadFile = async (path, file) => {
    const { error } = await supabase.storage
      .from("glossed-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;
    const { data } = supabase.storage.from("glossed-media").getPublicUrl(path);
    return data.publicUrl;
  };

  const handleProfileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ext = file.name.split(".").pop();
      const filePath = `profiles/${user.id}_profile.${ext}`;
      const publicUrl = await uploadFile(filePath, file);

      await supabase
        .from("users")
        .update({ profile_photo: publicUrl })
        .eq("id", user.id);
      setProfileUrl(publicUrl);
      setToast({ message: "✅ Profile photo updated!", type: "success" });
    } catch {
      setToast({
        message: "❌ Failed to upload profile photo.",
        type: "error",
      });
    }
  };

  const handlePortfolioUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    const uploadedUrls = [];
    for (const file of files) {
      const ext = file.name.split(".").pop();
      const path = `portfolio/${user.id}_${Date.now()}.${ext}`;
      try {
        const url = await uploadFile(path, file);
        uploadedUrls.push(url);
      } catch {
        console.error("❌ Upload error");
      }
    }

    const newPortfolio = [...portfolio, ...uploadedUrls];
    await supabase
      .from("users")
      .update({ portfolio: newPortfolio })
      .eq("id", user.id);
    setPortfolio(newPortfolio);
    setToast({ message: "✅ Portfolio updated!", type: "success" });
  };

  const handleDeleteImage = async (url) => {
    try {
      const path = url.split("/").slice(-2).join("/");
      await supabase.storage.from("glossed-media").remove([path]);
      const newPortfolio = portfolio.filter((u) => u !== url);
      await supabase
        .from("users")
        .update({ portfolio: newPortfolio })
        .eq("id", user.id);
      setPortfolio(newPortfolio);
      setToast({ message: "🗑️ Image deleted.", type: "success" });
    } catch {
      setToast({ message: "❌ Failed to delete image.", type: "error" });
    }
  };

  const handleDocUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const ext = file.name.split(".").pop();
      const path = `verification/${type}/${user.id}_${type}.${ext}`;
      const publicUrl = await uploadFile(path, file);

      const updates = {
        [type === "id" ? "id_document" : "certificate_document"]: publicUrl,
        verification_status: "pending",
        updated_at: new Date().toISOString(),
      };

      await supabase.from("users").update(updates).eq("id", user.id);
      if (type === "id") setIdDoc(publicUrl);
      else setCertDoc(publicUrl);

      setToast({ message: `✅ ${type} document uploaded.`, type: "success" });
    } catch {
      setToast({ message: "❌ Failed to upload document.", type: "error" });
    }
  };

  // --- UI ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">
          Visual & Verification
        </h3>
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
          {editing ? (saving ? "Saving..." : "Save") : "Modify"}
        </button>
      </div>

      {!editing ? (
        // --- MODE LECTURE ---
        <div className="space-y-6">
          <ProfileView profileUrl={profileUrl} />
          <PortfolioView portfolio={portfolio} />
          <VerificationView
            verification={verification}
            idDoc={idDoc}
            certDoc={certDoc}
          />
        </div>
      ) : (
        // --- MODE ÉDITION ---
        <div className="space-y-6">
          <ProfileEdit profileUrl={profileUrl} onUpload={handleProfileUpload} />
          <PortfolioEdit
            portfolio={portfolio}
            onUpload={handlePortfolioUpload}
            onDelete={handleDeleteImage}
          />
          <VerificationEdit
            verification={verification}
            setVerification={setVerification}
            idDoc={idDoc}
            certDoc={certDoc}
            onUpload={handleDocUpload}
          />
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
      {confirmModal.open && (
        <ConfirmModal
          {...confirmModal}
          onClose={() => setConfirmModal({ open: false })}
        />
      )}
    </div>
  );
}

/* --- Sous-sections --- */

function ProfileView({ profileUrl }) {
  return (
    <div>
      <h4 className="font-medium text-gray-700 mb-2">Profile Picture</h4>
      {profileUrl ? (
        <img
          src={profileUrl}
          alt="Profile"
          className="w-24 h-24 rounded-full border shadow"
        />
      ) : (
        <p className="text-gray-500 text-sm">No profile photo uploaded.</p>
      )}
    </div>
  );
}

function PortfolioView({ portfolio }) {
  return (
    <div>
      <h4 className="font-medium text-gray-700 mb-2">Portfolio</h4>
      {portfolio.length ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
          {portfolio.map((url, i) => (
            <img
              key={i}
              src={url}
              alt="Portfolio"
              className="rounded-lg shadow h-24 w-full object-cover"
            />
          ))}
        </div>
      ) : (
        <p className="text-gray-500 text-sm">No portfolio images yet.</p>
      )}
    </div>
  );
}

function VerificationView({ verification, idDoc, certDoc }) {
  return (
    <div className="text-sm text-gray-700 space-y-1">
      <p>
        <strong>Status:</strong> {verification}
      </p>
      <p>{idDoc ? "📄 ID Document uploaded" : "No ID Document"}</p>
      <p>{certDoc ? "🎓 Certificate uploaded" : "No Certificate"}</p>
    </div>
  );
}

function ProfileEdit({ profileUrl, onUpload }) {
  return (
    <div className="space-y-2">
      <h4 className="font-medium text-gray-700">Profile Picture</h4>
      {profileUrl && (
        <img
          src={profileUrl}
          alt="Profile"
          className="w-24 h-24 rounded-full border shadow"
        />
      )}
      <input
        type="file"
        accept="image/*"
        onChange={onUpload}
        className="text-sm text-gray-600"
      />
    </div>
  );
}

function PortfolioEdit({ portfolio, onUpload, onDelete }) {
  return (
    <div>
      <h4 className="font-medium text-gray-700 mb-2">Portfolio</h4>
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={onUpload}
        className="text-sm text-gray-600"
      />
      {portfolio.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-4">
          {portfolio.map((url, i) => (
            <div key={i} className="relative group">
              <img
                src={url}
                alt="Portfolio"
                className="rounded-lg shadow h-24 w-full object-cover"
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

function VerificationEdit({
  verification,
  setVerification,
  idDoc,
  certDoc,
  onUpload,
}) {
  return (
    <div className="space-y-4">
      <div>
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
      </div>

      <div className="flex flex-wrap gap-4">
        <button
          onClick={() => document.getElementById("idUpload").click()}
          className="px-4 py-2 bg-gray-100 border rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
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
          onClick={() => document.getElementById("certUpload").click()}
          className="px-4 py-2 bg-gray-100 border rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
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

      <div className="text-sm text-gray-600 space-y-1">
        <p>{idDoc ? "📄 ID Document uploaded" : "No ID Document"}</p>
        <p>{certDoc ? "🎓 Certificate uploaded" : "No Certificate"}</p>
      </div>
    </div>
  );
}
