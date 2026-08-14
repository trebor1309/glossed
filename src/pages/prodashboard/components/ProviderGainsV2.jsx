import { useCallback, useEffect, useMemo, useState } from "react";
import { loadConnectAndInitialize } from "@stripe/connect-js";
import {
  ConnectAccountManagement,
  ConnectBalances,
  ConnectComponentsProvider,
  ConnectPayoutsList,
} from "@stripe/react-connect-js";
import { AlertCircle, Banknote, ExternalLink, RefreshCw, Zap } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

const money = (cents, currency = "eur") =>
  new Intl.NumberFormat("fr-BE", {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(Number(cents ?? 0) / 100);

const dateTime = (value) =>
  value ? new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

function SummaryCard({ label, value, hint }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-white p-4 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 truncate text-2xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

function ConnectPanels() {
  const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
  const connectInstance = useMemo(() => {
    if (!publishableKey) return null;
    return loadConnectAndInitialize({
      publishableKey,
      fetchClientSecret: async () => {
        const { data, error } = await supabase.functions.invoke("create-stripe-account-session", {
          body: {},
        });
        if (error || !data?.client_secret) {
          throw new Error(data?.error || error?.message || "Stripe session unavailable");
        }
        return data.client_secret;
      },
      appearance: {
        variables: {
          colorPrimary: "#e11d48",
          borderRadius: "12px",
        },
      },
    });
  }, [publishableKey]);

  if (!connectInstance) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Les composants bancaires Stripe seront disponibles après configuration de la clé publique Connect.
      </div>
    );
  }
  return (
    <ConnectComponentsProvider connectInstance={connectInstance}>
      <div className="grid gap-5">
        <section className="min-w-0 overflow-hidden rounded-2xl border bg-white p-3 sm:p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Solde Stripe</h3>
          <ConnectBalances />
        </section>
        <section className="min-w-0 overflow-hidden rounded-2xl border bg-white p-3 sm:p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Historique bancaire Stripe</h3>
          <ConnectPayoutsList />
        </section>
        <section className="min-w-0 overflow-hidden rounded-2xl border bg-white p-3 sm:p-5">
          <h3 className="mb-3 font-semibold text-gray-900">Compte bancaire</h3>
          <ConnectAccountManagement />
        </section>
      </div>
    </ConnectComponentsProvider>
  );
}

export default function ProviderGainsV2() {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [quote, setQuote] = useState(null);

  const load = useCallback(async ({ refresh = false } = {}) => {
    setError("");
    if (refresh) {
      const { data, error: refreshError } = await supabase.functions.invoke(
        "provider-payouts-v2",
        { body: { action: "refresh" } }
      );
      if (refreshError) throw refreshError;
      if (data?.enabled === false) {
        setSummary({ enabled: false });
        return;
      }
      setSummary(data);
      return;
    }
    const { data, error: summaryError } = await supabase.rpc("get_my_provider_gains_v2");
    if (summaryError) throw summaryError;
    setSummary(data);
    if (data?.enabled) await load({ refresh: true });
  }, []);

  useEffect(() => {
    load()
      .catch((cause) => setError(cause.message || "Impossible de charger les gains."))
      .finally(() => setLoading(false));
  }, [load]);

  const requestQuote = async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error: quoteError } = await supabase.functions.invoke("provider-payouts-v2", {
        body: { action: "quote_instant" },
      });
      if (quoteError || !data?.quote) throw quoteError || new Error("Devis indisponible");
      setQuote(data.quote);
    } catch (cause) {
      setError(cause.message || "Instant Payout indisponible.");
    } finally {
      setBusy(false);
    }
  };

  const confirmQuote = async () => {
    if (!quote?.id) return;
    setBusy(true);
    setError("");
    try {
      const { data, error: payoutError } = await supabase.functions.invoke("provider-payouts-v2", {
        body: { action: "confirm_instant", payout_id: quote.id },
      });
      if (payoutError || !data?.payout) throw payoutError || new Error("Versement indisponible");
      setQuote(null);
      await load({ refresh: true });
    } catch (cause) {
      setError(cause.message || "Le versement instantané n’a pas pu être envoyé.");
    } finally {
      setBusy(false);
    }
  };

  const openExpress = async () => {
    setBusy(true);
    setError("");
    try {
      const { data, error: linkError } = await supabase.functions.invoke("provider-payouts-v2", {
        body: { action: "express_dashboard" },
      });
      if (linkError || !data?.url) throw linkError || new Error("Lien Express indisponible");
      window.location.assign(data.url);
    } catch (cause) {
      setError(cause.message || "Dashboard Express indisponible.");
      setBusy(false);
    }
  };

  if (loading) return <p className="py-10 text-center text-gray-500">Chargement des gains…</p>;
  if (summary?.enabled === false) {
    return (
      <div className="rounded-2xl border bg-white p-6 text-center shadow-sm">
        <Banknote className="mx-auto text-rose-600" size={42} />
        <h2 className="mt-3 text-xl font-bold text-gray-900">Gains</h2>
        <p className="mt-2 text-gray-600">
          Le nouveau suivi des soldes et versements est prêt pour une activation contrôlée.
          Le flux actuel reste inchangé pour le moment.
        </p>
      </div>
    );
  }

  const currency = summary?.currency ?? "eur";
  const blocked = (summary?.block_reasons ?? []).length > 0;
  const instantAvailable = Number(summary?.instant_available_gross_amount_cents ?? 0) > 0;

  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Gains</h2>
          <p className="text-sm text-gray-500">Fonds libérés et versements bancaires</p>
        </div>
        <button
          type="button"
          onClick={() => load({ refresh: true }).catch((cause) => setError(cause.message))}
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw size={16} /> Actualiser
        </button>
      </div>

      {error && (
        <div className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <AlertCircle className="shrink-0" size={18} /> {error}
        </div>
      )}
      {blocked && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Les versements sont temporairement bloqués. Les fonds restent suivis et aucun délai de
          libération, litige ou contrôle financier ne peut être contourné.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SummaryCard label="En attente" value={money(summary?.pending_amount_cents, currency)} />
        <SummaryCard label="Disponible" value={money(summary?.available_amount_cents, currency)} />
        <SummaryCard
          label="Prochain versement"
          value={dateTime(summary?.next_standard_payout_at)}
          hint="Calendrier Glossed configurable, seuil actuel 0 €"
        />
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Versement instantané</h3>
            <p className="mt-1 text-sm text-gray-500">
              Uniquement sur les fonds déjà libérés. Le coût Stripe exact est affiché avant confirmation.
            </p>
          </div>
          <button
            type="button"
            onClick={requestQuote}
            disabled={busy || blocked || !instantAvailable}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-rose-600 px-5 py-2.5 font-medium text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Zap size={17} /> Recevoir maintenant
          </button>
        </div>
        {!instantAvailable && (
          <p className="mt-3 text-xs text-gray-500">
            Aucun fonds ou compte bancaire éligible à un Instant Payout pour le moment.
          </p>
        )}
      </div>

      {quote && (
        <div className="rounded-2xl border-2 border-rose-200 bg-rose-50 p-5">
          <h3 className="font-semibold text-gray-900">Confirmer le versement instantané</h3>
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Fonds utilisés</dt><dd>{money(quote.provider_balance_debit_amount_cents, quote.currency)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Coût Stripe exact</dt><dd>{money(quote.quoted_stripe_fee_amount_cents, quote.currency)}</dd></div>
            <div className="flex justify-between gap-4 font-bold"><dt>Reçu sur le compte</dt><dd>{money(quote.bank_payout_amount_cents, quote.currency)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-gray-600">Glossed ne prélève aucune marge sur ce coût.</p>
          <div className="mt-4 flex flex-wrap justify-end gap-3">
            <button type="button" onClick={() => setQuote(null)} disabled={busy} className="rounded-full border px-4 py-2 text-sm">Annuler</button>
            <button type="button" onClick={confirmQuote} disabled={busy} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Confirmer</button>
          </div>
        </div>
      )}

      <ConnectPanels />

      <div className="text-center">
        <button
          type="button"
          onClick={openExpress}
          disabled={busy}
          className="inline-flex items-center gap-2 text-sm text-gray-600 underline-offset-4 hover:text-gray-900 hover:underline"
        >
          Accéder facultativement au Dashboard Stripe Express <ExternalLink size={15} />
        </button>
      </div>
    </div>
  );
}
