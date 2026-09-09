import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Flag, MessageSquareWarning, RefreshCw } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorPanel, LoadingPanel, StateBadge, formatDate } from "./AdminDataUi";
import {
  getAdminReputationModerationCounts,
  listAdminReportedReviews,
} from "./adminOperationsApi";
import { useAdminI18n } from "./AdminI18nContext";

const PAGE_SIZE = 20;

function excerpt(value, limit = 220) {
  const text = value?.trim() || "Avis sans commentaire";
  return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
}

export default function AdminReputationPage() {
  const { t } = useAdminI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedView = searchParams.get("view");
  const view = requestedView === "history" ? "history" : "open";
  const requestedPage = Number(searchParams.get("page"));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const offset = (page - 1) * PAGE_SIZE;
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({ open: null, history: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [items, nextCounts] = await Promise.all([
        listAdminReportedReviews(view, PAGE_SIZE, offset),
        getAdminReputationModerationCounts(),
      ]);
      setData(items);
      setCounts(nextCounts);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [offset, view]);

  useEffect(() => {
    load();
  }, [load]);

  const selectView = (nextView) => setSearchParams({ view: nextView });
  const selectPage = (nextPage) =>
    setSearchParams({ view, ...(nextPage > 1 ? { page: String(nextPage) } : {}) });
  const total = Number(data?.total || 0);
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <MessageSquareWarning className="text-rose-600" /> {t("reputation.title")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              {t("reputation.description")}
            </p>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-center">
            <strong className="block text-2xl text-rose-800">{counts.open ?? "—"}</strong>
            <span className="text-xs font-semibold text-rose-800">dossier(s) à traiter</span>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Files de modération">
          {[
            ["open", t("reputation.open")],
            ["history", t("reputation.history")],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              onClick={() => selectView(value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                view === value
                  ? "bg-slate-950 text-white"
                  : "border border-slate-300 bg-white text-slate-800"
              }`}
            >
              {label} <span className="ml-1 opacity-75">({counts[value] ?? "—"})</span>
            </button>
          ))}
          <button
            type="button"
            onClick={load}
            disabled={loading}
            aria-label="Actualiser la file"
            className="rounded-xl border border-slate-300 px-3 text-slate-700 disabled:opacity-50"
          >
            <RefreshCw size={17} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {loading ? (
        <LoadingPanel label="Chargement de la file de modération…" />
      ) : error ? (
        <ErrorPanel error={error} retry={load} />
      ) : (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm text-slate-500">
            {total} avis signalé{total === 1 ? "" : "s"}
          </div>
          {data.items.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">
              <Flag className="mx-auto mb-3 text-slate-400" aria-hidden="true" />
              {t(view === "open" ? "reputation.empty_open" : "reputation.empty_history")}
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.items.map((item) => (
                <Link
                  key={item.review_id}
                  to={`/reputation/${item.review_id}?view=${view}&page=${page}`}
                  className="grid gap-4 p-5 transition hover:bg-slate-50 lg:grid-cols-[minmax(0,2fr)_minmax(12rem,1fr)_minmax(12rem,1fr)_auto] lg:items-center"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-amber-600" aria-label={`${item.rating} sur 5`}>
                        {item.rating}/5 ★
                      </span>
                      <StateBadge value={item.review_status} />
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-800">
                      {excerpt(item.comment)}
                    </p>
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="truncate font-semibold">Auteur : {item.reviewer_name}</p>
                    <p className="mt-1 truncate text-slate-600">
                      Professionnel : {item.provider_name}
                    </p>
                  </div>
                  <div className="text-sm">
                    <p className="font-semibold text-rose-700">
                      {item.open_report_count} ouvert{Number(item.open_report_count) === 1 ? "" : "s"} / {item.report_count} signalement{Number(item.report_count) === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Premier : {formatDate(item.first_reported_at)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Dernier : {formatDate(item.last_reported_at)}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-rose-700">
                    Examiner <ChevronRight size={16} />
                  </span>
                </Link>
              ))}
            </div>
          )}
          {total > PAGE_SIZE && (
            <nav
              aria-label="Pagination de la modération"
              className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"
            >
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => selectPage(page - 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                <ChevronLeft size={16} /> Précédent
              </button>
              <span className="text-sm text-slate-600">
                Page {page} sur {pageCount}
              </span>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => selectPage(page + 1)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold disabled:opacity-40"
              >
                Suivant <ChevronRight size={16} />
              </button>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}
