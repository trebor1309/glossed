export const SUPPORTED_ADMIN_LOCALES = Object.freeze(["fr", "nl", "de", "en"]);
export const DEFAULT_ADMIN_LOCALE = "fr";
export const ADMIN_LOCALE_STORAGE_KEY = "glossed-admin-locale";

const fr = {
  "common.open": "Ouvrir",
  "common.refresh": "Actualiser",
  "common.search": "Rechercher",
  "common.all": "Tous",
  "common.history": "Historique",
  "common.technical_details": "Détails techniques",
  "missions.title": "Missions",
  "missions.description": "Suivi opérationnel des propositions, contrats et machines d’état.",
  "missions.empty": "Aucune mission ne correspond aux filtres.",
  "missions.legacy_notice": "Les missions historiques restent consultables, mais ne sont pas incluses dans les files financières v2.",
  "missions.test_data": "Données Test",
  "missions.scheduled_date": "Prestation prévue",
  "missions.attention": "Attention requise",
  "missions.filters.status": "État",
  "missions.filters.flow": "Moteur",
  "missions.filters.party": "Client ou prestataire",
  "missions.filters.from": "Prévue à partir du",
  "missions.filters.to": "Prévue jusqu’au",
  "missions.filters.attention": "Attention requise uniquement",
  "missions.flow.all": "Tous les moteurs",
  "missions.flow.legacy_v1": "Historique legacy v1",
  "missions.flow.marketplace_v2": "Moteur marketplace v2",
  "verifications.title": "Vérifications",
  "verifications.open": "À traiter",
  "verifications.history": "Historique traité",
  "verifications.empty_open": "Aucune vérification n’attend une décision.",
  "verifications.empty_history": "Aucune décision de vérification enregistrée.",
  "disputes.title": "Litiges et annulations",
  "disputes.service_open": "Litiges à traiter",
  "disputes.cancellation_open": "Annulations à traiter",
  "disputes.service_history": "Historique des litiges",
  "disputes.cancellation_history": "Historique des annulations",
  "disputes.empty": "Aucun dossier dans cette file.",
  "finance.title": "Finance",
  "finance.placeholder": "Mission, utilisateur, email ou identifiant Stripe",
  "finance.initial": "Recherchez un paiement, transfert, remboursement ou payout v2. Les préfixes Stripe (cs_, pi_, ch_, tr_, re_, po_) sont également acceptés.",
  "finance.empty": "Aucun dossier financier v2 trouvé.",
  "finance.legacy_notice": "Les missions legacy v1 ne sont pas indexées dans cette recherche.",
  "risk.title": "Chargebacks / risque",
  "risk.open": "Ouverts",
  "risk.won": "Gagnés — fonds à retransférer",
  "risk.lost_review": "Responsabilité à revoir",
  "risk.resolved": "Résolus",
  "risk.empty": "Aucune contestation bancaire dans cette file.",
  "incidents.title": "Incidents financiers",
  "incidents.open": "À traiter",
  "incidents.empty": "Aucun incident critique détecté.",
  "incidents.blocking": "Blocage des nouveaux Checkouts",
  "audit.title": "Audit global",
  "audit.empty": "Aucun événement ne correspond aux filtres.",
  "audit.details": "Détail de l’événement",
  "audit.period_from": "Du",
  "audit.period_to": "Au",
  "audit.actor": "Acteur ou email",
  "audit.outcome.all": "Tous les résultats",
  "audit.outcome.success": "Réussites",
  "audit.outcome.failed": "Échecs",
};

// Tranche 2 establishes independent admin catalogs and locale fallback. The
// remaining translations and the preference UI belong to tranche 3.
const catalogs = { fr, nl: {}, de: {}, en: {} };

function interpolate(message, parameters) {
  return Object.entries(parameters || {}).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    message
  );
}

export function normalizeAdminLocale(locale) {
  const normalized = String(locale || "").toLowerCase().split("-")[0];
  return SUPPORTED_ADMIN_LOCALES.includes(normalized) ? normalized : DEFAULT_ADMIN_LOCALE;
}

export function translateAdmin(locale, key, parameters) {
  const normalized = normalizeAdminLocale(locale);
  return interpolate(catalogs[normalized][key] || fr[key] || key, parameters);
}
