import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  Clock3,
  ShieldAlert,
  Star,
} from "lucide-react";
import { openConfirmModal } from "@/components/ui/openConfirmModal";
import { runMissionLifecycleAction } from "@/lib/missionLifecycleV2";

const dateTime = (value) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : null;

function remainingLabel(dueAt, now) {
  if (!dueAt) return null;
  const milliseconds = new Date(dueAt).getTime() - now;
  if (milliseconds <= 0) return "Release processing is due";
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  return `${hours}h ${minutes}m remaining`;
}

function stateCopy(lifecycle, now) {
  const releaseBlocked =
    lifecycle.release_state === "blocked" || (lifecycle.blocker_codes || []).length > 0;

  if (lifecycle.execution_state === "problem_reported") {
    return {
      icon: ShieldAlert,
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      title: "Problem reported — funds blocked",
      body: "Glossed is reviewing the report. No automatic release can occur while it remains open.",
    };
  }
  if (releaseBlocked) {
    return {
      icon: AlertTriangle,
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      title: "Financial release blocked",
      body: "An existing dispute, refund, payment or compliance hold prevents release.",
    };
  }
  if (lifecycle.execution_state === "concluded") {
    return {
      icon: BadgeCheck,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
      title: "Mission concluded",
      body:
        lifecycle.released_at != null
          ? "The provider allocation has been released. Reviews are now available."
          : "The resolution has been recorded. Reviews are now available.",
    };
  }
  if (lifecycle.execution_state === "client_confirmed") {
    return {
      icon: CheckCircle2,
      tone: "border-emerald-200 bg-emerald-50 text-emerald-900",
      title: "Service confirmed",
      body: "The server is completing the release workflow. This page will reflect the result shortly.",
    };
  }
  if (lifecycle.execution_state === "provider_completed_waiting_client") {
    return {
      icon: Clock3,
      tone: "border-blue-200 bg-blue-50 text-blue-900",
      title: "48-hour protection period",
      body: `${remainingLabel(lifecycle.release_due_at, now)}. The client can confirm now or report a problem.`,
    };
  }
  if (lifecycle.execution_state === "stale_admin_review") {
    return {
      icon: ShieldAlert,
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      title: "Administrative review required",
      body: "No completion outcome was recorded in time. Funds remain held until an explicit resolution.",
    };
  }
  if (lifecycle.execution_state === "completion_eligible") {
    return {
      icon: CalendarClock,
      tone: "border-rose-200 bg-rose-50 text-rose-900",
      title: "Completion actions available",
      body:
        lifecycle.actor_role === "provider"
          ? "Mark the service complete to start the 48-hour client protection period."
          : "You can confirm the service or report a problem, even if the provider has not declared completion.",
    };
  }
  return {
    icon: CalendarClock,
    tone: "border-gray-200 bg-gray-50 text-gray-800",
    title: "Service scheduled",
    body: `Completion actions become available ${dateTime(lifecycle.completion_not_before_at)}.`,
  };
}

export default function MissionLifecycleV2Panel({ lifecycle, onChanged, onEvaluate }) {
  const [now, setNow] = useState(Date.now());
  const [busyAction, setBusyAction] = useState(null);
  const [showProblemForm, setShowProblemForm] = useState(false);
  const [problemCode, setProblemCode] = useState("service_issue");
  const [problemReason, setProblemReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const presentation = useMemo(
    () => (lifecycle ? stateCopy(lifecycle, now) : null),
    [lifecycle, now]
  );
  if (!lifecycle || !presentation) return null;

  const Icon = presentation.icon;

  const execute = async (action, details = {}) => {
    setBusyAction(action);
    setError("");
    try {
      await runMissionLifecycleAction(lifecycle.payment_id, action, details);
      setShowProblemForm(false);
      setProblemReason("");
      try {
        await onChanged?.();
      } catch (refreshError) {
        console.error("Mission lifecycle refresh failed:", refreshError);
        setError("The action was recorded, but the status could not refresh. Reload this page.");
      }
    } catch (actionError) {
      console.error("Mission lifecycle action failed:", actionError);
      setError(actionError.message || "The action could not be completed.");
    } finally {
      setBusyAction(null);
    }
  };

  const confirmCompletion = async () => {
    const confirmed = await openConfirmModal(
      "Confirm the service?",
      "This confirmation immediately starts the existing server-side fund release workflow.",
      { confirmLabel: "Confirm service", cancelLabel: "Not yet" }
    );
    if (confirmed) await execute("client_confirm");
  };

  const providerComplete = async () => {
    const confirmed = await openConfirmModal(
      "Mark the service as completed?",
      "The client will be notified and the 48-hour protection period will begin.",
      { confirmLabel: "Mark completed", cancelLabel: "Not yet" }
    );
    if (confirmed) await execute("provider_complete");
  };

  const submitProblem = async (event) => {
    event.preventDefault();
    if (!problemReason.trim()) return;
    await execute("report_problem", {
      problem_code: problemCode,
      reason: problemReason.trim(),
    });
  };

  return (
    <section className="mt-5 min-w-0 border-t border-gray-100 pt-5" aria-label="Mission lifecycle">
      <div className={`rounded-xl border p-4 ${presentation.tone}`}>
        <div className="flex min-w-0 items-start gap-3">
          <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="font-semibold">{presentation.title}</h3>
            <p className="mt-1 break-words text-sm opacity-90">{presentation.body}</p>
          </div>
        </div>
      </div>

      <dl className="mt-4 grid min-w-0 grid-cols-1 gap-2 text-sm sm:grid-cols-2">
        <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">Starts</dt>
          <dd className="break-words text-gray-800">{dateTime(lifecycle.scheduled_start_at)}</dd>
        </div>
        {lifecycle.scheduled_end_at && (
          <div className="min-w-0 rounded-lg bg-gray-50 px-3 py-2">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Agreed end
            </dt>
            <dd className="break-words text-gray-800">{dateTime(lifecycle.scheduled_end_at)}</dd>
          </div>
        )}
      </dl>

      {lifecycle.problem_reported_at && lifecycle.problem_reason && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-white p-3 text-sm text-gray-700">
          <span className="font-medium">Reported issue:</span> {lifecycle.problem_reason}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
        {lifecycle.can_provider_complete && (
          <button
            type="button"
            onClick={providerComplete}
            disabled={busyAction != null}
            className="w-full rounded-full bg-rose-600 px-4 py-2.5 font-semibold text-white hover:bg-rose-700 disabled:opacity-60 sm:w-auto"
          >
            {busyAction === "provider_complete" ? "Saving…" : "Mark service as completed"}
          </button>
        )}

        {lifecycle.can_client_confirm && (
          <button
            type="button"
            onClick={confirmCompletion}
            disabled={busyAction != null}
            className="w-full rounded-full bg-emerald-600 px-4 py-2.5 font-semibold text-white hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
          >
            {busyAction === "client_confirm" ? "Confirming…" : "Confirm service completed"}
          </button>
        )}

        {lifecycle.can_client_report_problem && !showProblemForm && (
          <button
            type="button"
            onClick={() => setShowProblemForm(true)}
            disabled={busyAction != null}
            className="w-full rounded-full border border-amber-300 px-4 py-2.5 font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60 sm:w-auto"
          >
            Report a problem
          </button>
        )}

        {lifecycle.review_available && !lifecycle.reviewed_by_me && (
          <button
            type="button"
            onClick={onEvaluate}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 px-4 py-2.5 font-semibold text-white hover:bg-amber-600 sm:w-auto"
          >
            <Star size={16} /> Leave a review
          </button>
        )}

        {lifecycle.review_available && lifecycle.reviewed_by_me && (
          <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2 text-sm text-gray-600">
            <CheckCircle2 size={16} /> Review submitted
          </span>
        )}
      </div>

      {showProblemForm && (
        <form onSubmit={submitProblem} className="mt-4 min-w-0 space-y-3 rounded-xl bg-gray-50 p-4">
          <label className="block text-sm font-medium text-gray-700">
            Problem type
            <select
              value={problemCode}
              onChange={(event) => setProblemCode(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2"
            >
              <option value="service_issue">Service issue</option>
              <option value="provider_no_show">Provider did not attend</option>
              <option value="service_incomplete">Service incomplete</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-sm font-medium text-gray-700">
            What happened?
            <textarea
              value={problemReason}
              onChange={(event) => setProblemReason(event.target.value)}
              rows={4}
              maxLength={4000}
              required
              className="mt-1 w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2"
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setShowProblemForm(false)}
              disabled={busyAction != null}
              className="rounded-full border border-gray-300 px-4 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busyAction != null || !problemReason.trim()}
              className="rounded-full bg-amber-600 px-4 py-2 font-semibold text-white disabled:opacity-60"
            >
              {busyAction === "report_problem" ? "Sending…" : "Submit report"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
