import { Component } from "react";
import { reportOperationalEvent } from "@/lib/operationalTelemetry";

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    reportOperationalEvent({
      eventType: "frontend_render_failure",
      eventCode: "react_render_failure",
      severity: "error",
    });
  }

  render() {
    if (!this.state.failed) return this.props.children;

    const admin = this.props.admin === true;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6 text-slate-900">
        <section
          role="alert"
          className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-lg"
        >
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-rose-600">Glossed</p>
          <h1 className="mt-3 text-2xl font-bold">
            {admin ? "L’administration a rencontré un problème" : "Something went wrong"}
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            {admin
              ? "L’incident technique a été signalé sans enregistrer le contenu de la page. Rechargez pour réessayer."
              : "The technical issue has been reported without recording your form contents. Reload the page to try again."}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-full bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white"
            >
              {admin ? "Recharger" : "Reload page"}
            </button>
            <a
              href={admin ? "/" : "/contact"}
              className="rounded-full border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700"
            >
              {admin ? "Retour à l’accueil admin" : "Contact support"}
            </a>
          </div>
        </section>
      </main>
    );
  }
}
