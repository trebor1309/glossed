import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, FileText, Loader2, RefreshCw, ShieldCheck, XCircle } from "lucide-react";
import { adminSupabase } from "./adminSupabase";
import { parseStorageReference } from "@/lib/storageReference";
import Toast from "@/components/ui/Toast";
import { useAdminAuth } from "./AdminAuthContext";

const VERIFICATION_BUCKET = "verification-documents";

function displayName(request) {
  return request.business_name || `${request.first_name || ""} ${request.last_name || ""}`.trim()
    || request.professional_email || request.email || "Prestataire";
}

async function signedDocumentUrl(value) {
  const reference = parseStorageReference(value, VERIFICATION_BUCKET);
  if (!reference || reference.bucket !== VERIFICATION_BUCKET) return null;
  const { data, error } = await adminSupabase.storage
    .from(VERIFICATION_BUCKET)
    .createSignedUrl(reference.path, 600);
  if (error) throw error;
  return data?.signedUrl || null;
}

export default function VerificationReviewPage() {
  const { hasPermission } = useAdminAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [toast, setToast] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminSupabase.rpc("list_pending_professional_verifications");
    if (error) {
      setToast({ type: "error", message: error.message });
      setLoading(false);
      return;
    }
    const withDocuments = await Promise.all((data || []).map(async (request) => {
      const sign = async (reference) => {
        if (!reference) return null;
        try { return await signedDocumentUrl(reference); } catch { return null; }
      };
      const [idDocumentUrl, certificateDocumentUrl] = await Promise.all([
        sign(request.id_document), sign(request.certificate_document),
      ]);
      return { ...request, idDocumentUrl, certificateDocumentUrl };
    }));
    setRequests(withDocuments);
    setLoading(false);
  }, []);

  useEffect(() => { loadRequests(); }, [loadRequests]);

  const review = async (request, decision) => {
    const reason = rejectionReasons[request.professional_id]?.trim() || null;
    if (decision === "rejected" && !reason) {
      setToast({ type: "error", message: "Un motif de refus est obligatoire." });
      return;
    }
    setReviewingId(request.professional_id);
    const { error } = await adminSupabase.rpc("review_professional_verification", {
      p_professional_id: request.professional_id,
      p_decision: decision,
      p_reason: reason,
    });
    if (error) {
      setToast({ type: "error", message: error.message });
      setReviewingId(null);
      return;
    }
    setRequests((current) => current.filter((item) => item.professional_id !== request.professional_id));
    setRejectionReasons((current) => {
      const next = { ...current }; delete next[request.professional_id]; return next;
    });
    setToast({ type: "success", message: decision === "verified" ? "Prestataire vérifié." : "Vérification refusée." });
    setReviewingId(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><ShieldCheck className="text-rose-600" /> Vérifications</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-600">Les documents restent privés. Les liens expirent après dix minutes et chaque décision est inscrite dans le journal d’audit immuable.</p>
        </div>
        <button type="button" onClick={loadRequests} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Actualiser
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-16 text-slate-500"><Loader2 className="animate-spin" /></div>
      ) : requests.length === 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-600">Aucune vérification n’attend une décision.</section>
      ) : (
        <div className="space-y-5">
          {requests.map((request) => {
            const busy = reviewingId === request.professional_id;
            return (
              <article key={request.professional_id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><h2 className="text-lg font-semibold">{displayName(request)}</h2><p className="text-sm text-slate-500">{request.professional_email || request.email}</p><p className="mt-1 text-xs text-slate-400">Soumis {request.verification_submitted_at ? new Date(request.verification_submitted_at).toLocaleString("fr-BE") : "à une date inconnue"}</p></div>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase text-amber-700">En attente</span>
                </div>
                <div className="mt-5 flex flex-wrap gap-3">
                  {request.idDocumentUrl ? <a href={request.idDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm hover:bg-slate-50"><FileText size={16} /> Document d’identité</a> : <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"><XCircle size={16} /> Document indisponible</span>}
                  {request.certificateDocumentUrl && <a href={request.certificateDocumentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm hover:bg-slate-50"><FileText size={16} /> Certificat</a>}
                </div>
                {hasPermission("verification.review") && (
                  <>
                    <label className="mt-5 block text-sm font-medium">Motif du refus<textarea value={rejectionReasons[request.professional_id] || ""} onChange={(event) => setRejectionReasons((current) => ({ ...current, [request.professional_id]: event.target.value }))} maxLength={2000} rows={3} placeholder="Obligatoire uniquement pour un refus" className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-rose-500" /></label>
                    <div className="mt-4 flex flex-wrap justify-end gap-3">
                      <button type="button" disabled={busy} onClick={() => review(request, "rejected")} className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"><XCircle size={16} /> Refuser</button>
                      <button type="button" disabled={busy || !request.idDocumentUrl} onClick={() => review(request, "verified")} className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Approuver</button>
                    </div>
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
