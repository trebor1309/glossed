// 📄 src/pages/prodashboard/pages/settings/VisualVerificationSettings.jsx
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import {
  Upload,
  Image as ImageIcon,
  Trash2,
  IdCard,
  FileText,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import Toast from "@/components/ui/Toast";
import Cropper from "react-easy-crop";

const BUCKET = "glossed-media";

// Limites de taille (en octets)
const MAX_PROFILE_SIZE = 1 * 1024 * 1024; // 1 Mo
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5 Mo

export default function VisualVerificationSettings() {
  const { user } = useUser();

  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [profileUrl, setProfileUrl] = useState("");
  const [portfolio, setPortfolio] = useState([]);
  const [verificationStatus, setVerificationStatus] = useState("unverified");
  const [idDocumentUrl, setIdDocumentUrl] = useState(null);
  const [certificateUrl, setCertificateUrl] = useState(null);

  // ---- Cropper state pour photo de profil
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [selectedProfileFile, setSelectedProfileFile] = useState(null);
  const [profilePreviewUrl, setProfilePreviewUrl] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // ---------- UTILITAIRES ----------

  const sanitizeFileName = (name) =>
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");

  const withCacheBust = (url) => (url ? `${url}?t=${Date.now()}` : url);

  const uploadToBucket = async (path, file) => {
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
      upsert: true,
      contentType: file.type,
    });
    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return withCacheBust(data.publicUrl);
  };

  const removeFromBucketByUrl = async (url) => {
    if (!url) return;
    try {
      const parts = url.split("/object/public/");
      if (parts.length < 2) return;
      // ex: glossed-media/portfolio/userid_xxx.jpg
      const pathWithBucket = parts[1]; // "glossed-media/portfolio/..."
      const path = pathWithBucket.replace(`${BUCKET}/`, ""); // "portfolio/..."
      await supabase.storage.from(BUCKET).remove([path]);
    } catch (err) {
      console.warn("⚠️ Failed to remove from bucket:", err);
    }
  };

  // ---------- LOAD INITIAL DATA ----------

  useEffect(() => {
    if (!user?.id) return;

    const load = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select(
          `
          profile_photo,
          portfolio,
          verification_status,
          id_document,
          certificate_document
        `
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) {
        console.error("❌ Visual load error:", error.message);
        setToast({ type: "error", message: "Error loading visual settings." });
        setLoading(false);
        return;
      }

      if (data) {
        setProfileUrl(data.profile_photo || "");
        setPortfolio(Array.isArray(data.portfolio) ? data.portfolio : []);
        setVerificationStatus(data.verification_status || "unverified");
        setIdDocumentUrl(data.id_document || null);
        setCertificateUrl(data.certificate_document || null);
      }

      setLoading(false);
    };

    load();
  }, [user?.id]);

  // ---------- PROFILE PICTURE ----------

  const handleProfileFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_PROFILE_SIZE) {
      setToast({
        type: "error",
        message: "Profile picture is too large (max 1 MB).",
      });
      return;
    }

    const preview = URL.createObjectURL(file);
    setSelectedProfileFile(file);
    setProfilePreviewUrl(preview);
    setCropModalOpen(true);
  };

  const onCropComplete = (_croppedArea, croppedPixels) => {
    setCroppedAreaPixels(croppedPixels);
  };

  const getCroppedImg = async (imageSrc, cropPixels) => {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.src = imageSrc;
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(err);
    });

    const canvas = document.createElement("canvas");
    canvas.width = cropPixels.width;
    canvas.height = cropPixels.height;
    const ctx = canvas.getContext("2d");

    ctx.drawImage(
      image,
      cropPixels.x,
      cropPixels.y,
      cropPixels.width,
      cropPixels.height,
      0,
      0,
      cropPixels.width,
      cropPixels.height
    );

    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas is empty"));
            return;
          }
          resolve(blob);
        },
        "image/jpeg",
        0.9
      );
    });
  };

  const handleConfirmCrop = async () => {
    if (!selectedProfileFile || !croppedAreaPixels || !profilePreviewUrl) return;

    try {
      setSavingProfile(true);
      const croppedBlob = await getCroppedImg(profilePreviewUrl, croppedAreaPixels);

      const ext = "jpg";
      const safeName = sanitizeFileName(selectedProfileFile.name || "profile");
      const path = `profiles/${user.id}_profile_${safeName}.${ext}`;

      const url = await uploadToBucket(path, croppedBlob);

      const { error } = await supabase
        .from("users")
        .update({
          profile_photo: url,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setProfileUrl(url);
      setToast({ type: "success", message: "✅ Profile photo updated!" });
      setCropModalOpen(false);
    } catch (err) {
      console.error("❌ Profile upload error:", err);
      setToast({ type: "error", message: "Error uploading profile picture." });
    } finally {
      setSavingProfile(false);
      if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
      setSelectedProfileFile(null);
      setProfilePreviewUrl(null);
      setCroppedAreaPixels(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
    }
  };

  const handleProfileDelete = async () => {
    try {
      await removeFromBucketByUrl(profileUrl);

      const { error } = await supabase
        .from("users")
        .update({
          profile_photo: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;
      setProfileUrl("");
      setToast({ type: "success", message: "Profile picture removed." });
    } catch (err) {
      setToast({ type: "error", message: "Error removing profile picture." });
    }
  };

  // ---------- PORTFOLIO ----------

  const handlePortfolioSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    if (portfolio.length + files.length > 15) {
      setToast({
        type: "error",
        message: "Maximum 15 portfolio images.",
      });
      return;
    }

    const tooLarge = files.find((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge) {
      setToast({
        type: "error",
        message: "One or more files are too large (max 5 MB each).",
      });
      return;
    }

    uploadPortfolioImages(files);
  };

  const uploadPortfolioImages = async (files) => {
    try {
      const uploaded = await Promise.all(
        files.map(async (file) => {
          const safeName = sanitizeFileName(file.name);
          const path = `portfolio/${user.id}_${Date.now()}_${safeName}`;
          return await uploadToBucket(path, file);
        })
      );

      const newPortfolio = [...portfolio, ...uploaded];
      setPortfolio(newPortfolio);

      const { error } = await supabase
        .from("users")
        .update({
          portfolio: newPortfolio,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setToast({ type: "success", message: "✅ Portfolio updated!" });
    } catch (err) {
      console.error("❌ Portfolio upload error:", err);
      setToast({ type: "error", message: "Error uploading portfolio images." });
    }
  };

  const handlePortfolioDelete = async (url) => {
    try {
      await removeFromBucketByUrl(url);
      const newPortfolio = portfolio.filter((u) => u !== url);

      const { error } = await supabase
        .from("users")
        .update({
          portfolio: newPortfolio,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      setPortfolio(newPortfolio);
      setToast({ type: "success", message: "Image removed from portfolio." });
    } catch (err) {
      setToast({ type: "error", message: "Error deleting portfolio image." });
    }
  };

  // ---------- DOCUMENTS (ID + CERTIFICAT) ----------

  const handleDocSelect = (e, type) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_IMAGE_SIZE) {
      setToast({
        type: "error",
        message: "Document is too large (max 5 MB).",
      });
      return;
    }

    uploadDoc(file, type);
  };

  const uploadDoc = async (file, type) => {
    try {
      const safeName = sanitizeFileName(file.name);
      const path = `verification/${type}/${user.id}_${Date.now()}_${safeName}`;

      const url = await uploadToBucket(path, file);

      const payload =
        type === "id"
          ? {
              id_document: url,
              verification_status: "pending",
            }
          : {
              certificate_document: url,
              verification_status: "pending",
            };

      const { error } = await supabase
        .from("users")
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      if (type === "id") setIdDocumentUrl(url);
      else setCertificateUrl(url);

      setVerificationStatus("pending");
      setToast({
        type: "success",
        message: "✅ Document uploaded. It will be reviewed within 72 hours.",
      });
    } catch (err) {
      console.error("❌ Document upload error:", err);
      setToast({ type: "error", message: "Error uploading document." });
    }
  };

  const handleDocDelete = async (type) => {
    try {
      const url = type === "id" ? idDocumentUrl : certificateUrl;
      await removeFromBucketByUrl(url);

      const payload = type === "id" ? { id_document: null } : { certificate_document: null };

      const { error } = await supabase
        .from("users")
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (error) throw error;

      if (type === "id") setIdDocumentUrl(null);
      else setCertificateUrl(null);

      setToast({ type: "success", message: "Document removed." });
    } catch (err) {
      setToast({ type: "error", message: "Error removing document." });
    }
  };

  // ---------- UI ----------

  if (loading) {
    return <div className="text-gray-600 text-sm p-4">Loading visual settings…</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-lg font-semibold text-gray-800">Visual & Verification</h3>
        <p className="text-sm text-gray-500 mt-1">
          Manage your profile picture, portfolio and professional verification.
        </p>
      </div>

      {/* Profile Picture */}
      <section className="bg-white rounded-2xl shadow p-6 border border-gray-100 space-y-4">
        <h4 className="font-semibold text-gray-800 flex items-center gap-2">
          <ImageIcon size={18} className="text-rose-600" />
          Profile Picture
        </h4>

        <div className="flex items-center gap-4">
          {profileUrl ? (
            <img
              src={profileUrl}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border shadow"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center text-gray-400">
              <ImageIcon size={28} />
            </div>
          )}

          <div className="flex flex-col gap-2 text-sm">
            <p className="text-gray-500">
              This picture is shown to clients on your profile and bookings.
            </p>
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 text-xs font-medium cursor-pointer hover:bg-rose-100">
                <Upload size={14} />
                Upload new
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleProfileFileSelect}
                />
              </label>

              {profileUrl && (
                <button
                  type="button"
                  onClick={handleProfileDelete}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-400">Max 1 MB. Square image recommended.</p>
          </div>
        </div>
      </section>

      {/* Portfolio */}
      <section className="bg-white rounded-2xl shadow p-6 border border-gray-100 space-y-4">
        <h4 className="font-semibold text-gray-800 flex items-center gap-2">
          <ImageIcon size={18} className="text-rose-600" />
          Portfolio
        </h4>
        <p className="text-sm text-gray-500">
          Upload examples of your work. They may be shown to clients on your public profile.
        </p>

        <div className="flex items-center gap-3">
          <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-50 text-rose-700 text-xs font-medium cursor-pointer hover:bg-rose-100">
            <Upload size={14} />
            Add images
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={handlePortfolioSelect}
            />
          </label>
          <p className="text-xs text-gray-400">Up to 15 images. Max 5 MB per image.</p>
        </div>

        {portfolio.length > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3 mt-4">
            {portfolio.map((url) => (
              <div key={url} className="relative group">
                <img
                  src={url}
                  alt="Portfolio"
                  className="rounded-lg shadow h-24 w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => handlePortfolioDelete(url)}
                  className="absolute top-1 right-1 bg-black/60 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400 italic">No portfolio images yet.</p>
        )}
      </section>

      {/* Verification */}
      <section className="bg-white rounded-2xl shadow p-6 border border-gray-100 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h4 className="font-semibold text-gray-800 flex items-center gap-2">
              <ShieldCheck size={18} className="text-rose-600" />
              Professional Verification
            </h4>
            <p className="text-sm text-gray-500 mt-1">
              Your documents are private and only used to verify your professional identity.
            </p>
          </div>

          <span
            className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
              verificationStatus === "verified"
                ? "bg-green-50 text-green-700 border border-green-200"
                : verificationStatus === "pending"
                  ? "bg-amber-50 text-amber-700 border border-amber-200"
                  : "bg-gray-50 text-gray-500 border border-gray-200"
            }`}
          >
            {verificationStatus}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
          {/* ID Document */}
          <div className="space-y-2">
            <h5 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <IdCard size={16} className="text-rose-600" />
              ID Document
            </h5>
            <p className="text-xs text-gray-500">Passport or ID card (photo or PDF).</p>

            <div className="flex flex-wrap gap-2 mt-1">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium cursor-pointer hover:bg-gray-200">
                <Upload size={14} />
                {idDocumentUrl ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleDocSelect(e, "id")}
                />
              </label>

              {idDocumentUrl && (
                <button
                  type="button"
                  onClick={() => handleDocDelete("id")}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}

              {idDocumentUrl && (
                <a
                  href={idDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border text-xs text-gray-700 hover:bg-gray-50"
                >
                  <FileText size={14} />
                  View
                </a>
              )}
            </div>

            {!idDocumentUrl && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1 mt-1">
                <AlertCircle size={12} />
                Required to get a verified badge.
              </p>
            )}
          </div>

          {/* Certificate / Diploma */}
          <div className="space-y-2">
            <h5 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
              <FileText size={16} className="text-rose-600" />
              Certificate / Diploma
            </h5>
            <p className="text-xs text-gray-500">
              Optional, but helps clients trust your expertise.
            </p>

            <div className="flex flex-wrap gap-2 mt-1">
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium cursor-pointer hover:bg-gray-200">
                <Upload size={14} />
                {certificateUrl ? "Replace" : "Upload"}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => handleDocSelect(e, "certificate")}
                />
              </label>

              {certificateUrl && (
                <button
                  type="button"
                  onClick={() => handleDocDelete("certificate")}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 text-gray-600 text-xs font-medium hover:bg-gray-200"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}

              {certificateUrl && (
                <a
                  href={certificateUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border text-xs text-gray-700 hover:bg-gray-50"
                >
                  <FileText size={14} />
                  View
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {cropModalOpen && (
        <ProfileCropModal
          previewUrl={profilePreviewUrl}
          crop={crop}
          setCrop={setCrop}
          zoom={zoom}
          setZoom={setZoom}
          onCropComplete={onCropComplete}
          onCancel={() => {
            setCropModalOpen(false);
            if (profilePreviewUrl) URL.revokeObjectURL(profilePreviewUrl);
            setSelectedProfileFile(null);
            setProfilePreviewUrl(null);
            setCroppedAreaPixels(null);
            setCrop({ x: 0, y: 0 });
            setZoom(1);
          }}
          onConfirm={handleConfirmCrop}
          saving={savingProfile}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*                      Profile Crop Modal                             */
/* ------------------------------------------------------------------ */

function ProfileCropModal({
  previewUrl,
  crop,
  setCrop,
  zoom,
  setZoom,
  onCropComplete,
  onCancel,
  onConfirm,
  saving,
}) {
  if (!previewUrl) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4">
        <h4 className="font-semibold text-gray-800 text-sm mb-1">Adjust your profile picture</h4>
        <div className="relative w-full h-64 bg-gray-100 rounded-xl overflow-hidden">
          <Cropper
            image={previewUrl}
            crop={crop}
            zoom={zoom}
            aspect={1}
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onCropComplete}
          />
        </div>

        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-500">Zoom</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className={`px-4 py-1.5 rounded-full text-xs font-medium text-white ${
              saving
                ? "bg-gray-300 cursor-not-allowed"
                : "bg-gradient-to-r from-rose-600 to-red-600 hover:opacity-95"
            }`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
