import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, FileText, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabaseClient";
import { createSignedStorageUrl } from "@/lib/storageUrls";
import Toast from "@/components/ui/Toast";

const VERIFICATION_BUCKET = "verification-documents";

function displayName(request) {
  return (
    request.business_name ||
    `${request.first_name || ""} ${request.last_name || ""}`.trim() ||
    request.professional_email ||
    request.email ||
    "Professional"
  );
}

export default function VerificationReviewPage() {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState(null);
  const [rejectionReasons, setRejectionReasons] = useState({});
  const [toast, setToast] = useState(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("list_pending_professional_verifications");

    if (error) {
      setToast({ type: "error", message: error.message });
      setLoading(false);
      return;
    }

    const requestsWithDocuments = await Promise.all(
      (data || []).map(async (request) => {
        const sign = async (reference) => {
          if (!reference) return null;
          try {
            return await createSignedStorageUrl(VERIFICATION_BUCKET, reference, 600);
          } catch {
            return null;
          }
        };

        const [idDocumentUrl, certificateDocumentUrl] = await Promise.all([
          sign(request.id_document),
          sign(request.certificate_document),
        ]);

        return { ...request, idDocumentUrl, certificateDocumentUrl };
      })
    );

    setRequests(requestsWithDocuments);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const review = async (request, decision) => {
    const reason = rejectionReasons[request.professional_id]?.trim() || null;
    if (decision === "rejected" && !reason) {
      setToast({ type: "error", message: "A rejection reason is required." });
      return;
    }

    setReviewingId(request.professional_id);
    const { error } = await supabase.rpc("review_professional_verification", {
      p_professional_id: request.professional_id,
      p_decision: decision,
      p_reason: reason,
    });

    if (error) {
      setToast({ type: "error", message: error.message });
      setReviewingId(null);
      return;
    }

    setRequests((current) =>
      current.filter((item) => item.professional_id !== request.professional_id)
    );
    setRejectionReasons((current) => {
      const next = { ...current };
      delete next[request.professional_id];
      return next;
    });
    setToast({
      type: "success",
      message: decision === "verified" ? "Professional verified." : "Verification rejected.",
    });
    setReviewingId(null);
  };

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} /> Back
        </button>

        <header className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ShieldCheck className="text-rose-600" /> Professional verification
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Documents are private. Signed viewing links expire after ten minutes, and every decision
            is recorded in the audit log.
          </p>
        </header>

        {loading ? (
          <div className="flex justify-center py-16 text-gray-500">
            <Loader2 className="animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <section className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-gray-600">
            No verification request is waiting for review.
          </section>
        ) : (
          <div className="space-y-5">
            {requests.map((request) => {
              const busy = reviewingId === request.professional_id;
              return (
                <article
                  key={request.professional_id}
                  className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {displayName(request)}
                      </h2>
                      <p className="text-sm text-gray-500">
                        {request.professional_email || request.email}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        Submitted{" "}
                        {request.verification_submitted_at
                          ? new Date(request.verification_submitted_at).toLocaleString()
                          : "at an unknown date"}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase text-amber-700">
                      Pending
                    </span>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    {request.idDocumentUrl ? (
                      <a
                        href={request.idDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <FileText size={16} /> View ID document
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                        <XCircle size={16} /> ID document unavailable
                      </span>
                    )}
                    {request.certificateDocumentUrl && (
                      <a
                        href={request.certificateDocumentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <FileText size={16} /> View certificate
                      </a>
                    )}
                  </div>

                  <label className="mt-5 block text-sm font-medium text-gray-700">
                    Rejection reason
                    <textarea
                      value={rejectionReasons[request.professional_id] || ""}
                      onChange={(event) =>
                        setRejectionReasons((current) => ({
                          ...current,
                          [request.professional_id]: event.target.value,
                        }))
                      }
                      maxLength={2000}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-rose-500 focus:outline-none"
                      placeholder="Required only when rejecting"
                    />
                  </label>

                  <div className="mt-4 flex flex-wrap justify-end gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => review(request, "rejected")}
                      className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                    >
                      <XCircle size={16} /> Reject
                    </button>
                    <button
                      type="button"
                      disabled={busy || !request.idDocumentUrl}
                      onClick={() => review(request, "verified")}
                      className="inline-flex items-center gap-2 rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {busy ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      Approve
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </main>
  );
}
