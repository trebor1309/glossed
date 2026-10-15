import { useCallback, useEffect, useState } from "react";
import { Clock3, FileLock2, RefreshCw, Send, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import InlineAlert from "@/components/ui/InlineAlert";
import { logUnexpectedError, userFacingError } from "@/lib/userFacingError";

const REQUEST_TYPES = [
  ["access", "Access my personal data"],
  ["rectification", "Correct personal data"],
  ["erasure", "Close my account and request erasure"],
  ["restriction", "Restrict processing"],
  ["objection", "Object to processing"],
  ["portability", "Receive portable data"],
  ["other", "Another privacy request"],
];

const statusLabels = {
  received: "Received",
  identity_check: "Identity check",
  in_progress: "In progress",
  completed: "Completed",
  refused: "Refused",
  cancelled: "Cancelled",
};

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(document.documentElement.lang || "en", {
    dateStyle: "medium",
  }).format(new Date(value));
}

export default function PrivacyRequestsSection({ onMessage }) {
  const [requestType, setRequestType] = useState("access");
  const [details, setDetails] = useState("");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const loadRequests = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("get_my_data_subject_requests");
    if (error) {
      logUnexpectedError("Loading privacy requests failed", error);
      setErrorMessage("We could not load your privacy requests.");
    } else {
      setRequests(Array.isArray(data) ? data : []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const submitRequest = async (event) => {
    event.preventDefault();
    const normalizedDetails = details.trim();
    if (normalizedDetails && normalizedDetails.length < 10) {
      setErrorMessage("Please add at least 10 characters of context, or leave the details empty.");
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    const { data, error } = await supabase.rpc("submit_my_data_subject_request", {
      p_request_type: requestType,
      p_details: normalizedDetails || null,
    });
    setSubmitting(false);

    if (error) {
      logUnexpectedError("Submitting a privacy request failed", error);
      const message = /already being processed/i.test(error.message)
        ? "A request of this type is already being processed."
        : userFacingError(error, "We could not submit your privacy request. Please try again.");
      setErrorMessage(message);
      return;
    }

    setDetails("");
    onMessage?.({
      type: "success",
      message: `Privacy request received. Reference ${String(data.id).slice(0, 8).toUpperCase()}.`,
    });
    await loadRequests();
  };

  return (
    <section className="space-y-5 rounded-2xl border border-rose-100 bg-white p-6 shadow-md">
      <div className="flex items-start gap-3">
        <FileLock2 className="mt-0.5 shrink-0 text-rose-600" />
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Your data and privacy rights</h3>
          <p className="mt-1 text-sm text-gray-600">
            Send an authenticated request to access, correct, restrict, export or erase your data.
            Glossed records the request and normally responds within one month.
          </p>
        </div>
      </div>

      <form onSubmit={submitRequest} className="space-y-4 rounded-xl bg-gray-50 p-4">
        <div>
          <label htmlFor="privacy-request-type" className="text-sm font-medium text-gray-800">
            Request type
          </label>
          <select
            id="privacy-request-type"
            value={requestType}
            onChange={(event) => setRequestType(event.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
          >
            {REQUEST_TYPES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {requestType === "erasure" && (
          <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
            <Trash2 className="mt-0.5 shrink-0" size={18} />
            <p>
              This creates a reviewed closure request; it does not delete the account instantly.
              Data that must be retained for legal claims, accounting, fraud prevention or audit is
              handled under the approved retention rules.
            </p>
          </div>
        )}

        <div>
          <label htmlFor="privacy-request-details" className="text-sm font-medium text-gray-800">
            Helpful details (optional)
          </label>
          <textarea
            id="privacy-request-details"
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            maxLength={2000}
            rows={3}
            placeholder="Tell the privacy team what you need. Do not upload identity documents here."
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
          />
        </div>

        <InlineAlert message={errorMessage} />

        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send size={16} /> {submitting ? "Sending…" : "Send privacy request"}
        </button>
      </form>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h4 className="font-semibold text-gray-800">Your recent requests</h4>
          <button
            type="button"
            onClick={loadRequests}
            disabled={loading}
            className="inline-flex items-center gap-1 text-sm font-medium text-rose-700 disabled:opacity-50"
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-gray-500">Loading requests…</p>
        ) : requests.length === 0 ? (
          <p className="text-sm text-gray-500">No privacy request has been submitted yet.</p>
        ) : (
          <ul className="space-y-2">
            {requests.map((request) => (
              <li
                key={request.id}
                className="flex flex-col gap-2 rounded-xl border border-gray-200 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-gray-800">
                    {REQUEST_TYPES.find(([value]) => value === request.request_type)?.[1] ||
                      request.request_type}
                  </p>
                  <p className="text-xs text-gray-500">
                    Ref. {String(request.id).slice(0, 8).toUpperCase()} · received{" "}
                    {formatDate(request.received_at)}
                  </p>
                </div>
                <div className="text-left sm:text-right">
                  <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                    {statusLabels[request.status] || request.status}
                  </span>
                  {!request.responded_at && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 sm:justify-end">
                      <Clock3 size={13} /> target {formatDate(request.due_at)}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
