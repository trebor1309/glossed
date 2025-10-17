import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Upload, FileText, IdCard } from "lucide-react";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/ui/ConfirmModal";

export default function VisualSettings() {
  const { user } = useUser();

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

  // --- Upload Helper ---
  const uploadFile = async (path, file) => {
    const { error } = await supabase.storage
      .from("glossed-media")
      .upload(path, file, { upsert: true, contentType: file.type });
    if (error) throw error;

    const { data } = supabase.storage.from("glossed-media").getPublicUrl(path);
    // ✅ Forcer le rafraîchissement du cache navigateur
    return `${data.publicUrl}?t=${Date.now()}`;
  };

  // --- Upload Profile Photo ---
  const handleProfileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setConfirmModal({
      open: true,
      type: "profileUpload",
      data: { file, previewUrl },
    });
  };

  const performProfileUpload = async (file) => {
    try {
      const ext = file.name.split(".").pop();
      const safeName = file.name
        .normalize("NFD") // retire les accents
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_"); // remplace les caractères interdits par "_"

      const path = `profiles/${user.id}_profile.${ext}`;
      const publicUrl = await uploadFile(path, file);
      await supabase
        .from("users")
        .update({ profile_photo: publicUrl })
        .eq("id", user.id);
      setProfileUrl(publicUrl);
      setToast({ message: "✅ Profile photo updated!", type: "success" });
      URL.revokeObjectURL(file);
    } catch {
      setToast({
        message: "❌ Failed to upload profile photo.",
        type: "error",
      });
    }
  };

  // --- Upload Portfolio ---
  const handlePortfolioUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    if (portfolio.length + files.length > 12) {
      setToast({ message: "❌ Maximum 12 portfolio images.", type: "error" });
      return;
    }
    const previews = files.map((f) => URL.createObjectURL(f));
    setConfirmModal({
      open: true,
      type: "portfolioUpload",
      data: { files, previews },
    });
  };

  const performPortfolioUpload = async (files) => {
    try {
      // 🔹 Upload simultané de toutes les images
      const uploadedUrls = await Promise.all(
        files.map(async (file) => {
          const ext = file.name.split(".").pop();
          // 🔹 Nettoyer le nom du fichier pour éviter les caractères invalides
          const safeName = file.name
            .normalize("NFD") // retire les accents
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-zA-Z0-9._-]/g, "_"); // remplace les caractères interdits par "_"

          const path = `portfolio/${user.id}_${Date.now()}_${safeName}`;

          const url = await uploadFile(path, file);
          return url;
        })
      );

      // 🔹 Màj locale immédiate
      const newPortfolio = [...portfolio, ...uploadedUrls];
      setPortfolio(newPortfolio);

      // 🔹 Màj Supabase
      await supabase
        .from("users")
        .update({ portfolio: newPortfolio })
        .eq("id", user.id);

      // 🔹 Nettoyage des URLs temporaires
      files.forEach((f) => URL.revokeObjectURL(f));

      setToast({ message: "✅ Portfolio updated!", type: "success" });
    } catch (err) {
      console.error("❌ Upload error:", err);
      setToast({ message: "❌ Failed to upload some images.", type: "error" });
    }
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

  // --- Upload Docs ---
  const handleDocUpload = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    setConfirmModal({
      open: true,
      type: "docUpload",
      data: { file, docType: type, previewUrl },
    });
  };

  const performDocUpload = async (file, type) => {
    try {
      const ext = file.name.split(".").pop();
      const safeName = file.name
        .normalize("NFD") // retire les accents
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_"); // remplace les caractères interdits par "_"

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

      setToast({
        message: `✅ ${type.toUpperCase()} document uploaded and pending review (72h).`,
        type: "success",
      });
    } catch {
      setToast({ message: "❌ Failed to upload document.", type: "error" });
    }
  };

  // --- UI ---
  return (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-800">
        Visual & Verification
      </h3>

      <ProfileSection profileUrl={profileUrl} onUpload={handleProfileUpload} />

      <PortfolioSection
        portfolio={portfolio}
        onUpload={handlePortfolioUpload}
        onDelete={handleDeleteImage}
      />

      <VerificationSection
        verification={verification}
        idDoc={idDoc}
        certDoc={certDoc}
        onUpload={handleDocUpload}
      />

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}

      {confirmModal.open && (
        <ConfirmModal
          open={confirmModal.open}
          title={
            confirmModal.type === "profileUpload"
              ? "Confirm Profile Picture"
              : confirmModal.type === "portfolioUpload"
              ? "Upload Portfolio Images"
              : "Confirm Document Upload"
          }
          message={
            confirmModal.type === "profileUpload"
              ? `Do you want to use ${confirmModal.data?.file?.name} as your new profile picture?`
              : confirmModal.type === "portfolioUpload"
              ? `Do you want to upload ${confirmModal.data?.files?.length} new images to your portfolio?`
              : "Uploading this document will replace the previous one and will be reviewed within 72 hours."
          }
          imagePreview={
            confirmModal.data?.previewUrl || confirmModal.data?.previews?.[0]
          }
          confirmLabel="Upload"
          onConfirm={async () => {
            const { type, data } = confirmModal;
            if (type === "profileUpload") await performProfileUpload(data.file);
            if (type === "portfolioUpload")
              await performPortfolioUpload(data.files);
            if (type === "docUpload")
              await performDocUpload(data.file, data.docType);
            setConfirmModal({ open: false, type: null, data: null });
          }}
          onCancel={() =>
            setConfirmModal({ open: false, type: null, data: null })
          }
        />
      )}
    </div>
  );
}

/* --- Sous-sections --- */

function ProfileSection({ profileUrl, onUpload }) {
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

function PortfolioSection({ portfolio, onUpload, onDelete }) {
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
            <div key={`${url}-${i}`} className="relative group">
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

function VerificationSection({ verification, idDoc, certDoc, onUpload }) {
  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        Verification Status:{" "}
        <span className="font-semibold">{verification}</span>
      </label>

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
