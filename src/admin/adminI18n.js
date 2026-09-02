export const SUPPORTED_ADMIN_LOCALES = Object.freeze(["fr", "nl", "de", "en"]);
export const AVAILABLE_ADMIN_INTERFACE_LOCALES = Object.freeze(["fr"]);
export const DEFAULT_ADMIN_LOCALE = "fr";
export const ADMIN_LOCALE_STORAGE_KEY = "glossed-admin-locale";

const fr = {
  "nav.overview": "Vue d’ensemble",
  "nav.users": "Utilisateurs",
  "nav.verifications": "Vérifications",
  "nav.missions": "Missions",
  "nav.disputes": "Litiges",
  "nav.finance": "Finance",
  "nav.risk": "Chargebacks / risque",
  "nav.incidents": "Incidents",
  "nav.audit": "Audit",
  "nav.configuration": "Configuration / conformité",
  "nav.administrators": "Administrateurs",
  "nav.preferences": "Mes paramètres",
  "common.open": "Ouvrir",
  "common.refresh": "Actualiser",
  "common.search": "Rechercher",
  "common.all": "Tous",
  "common.history": "Historique",
  "common.technical_details": "Détails techniques",
  "missions.title": "Missions",
  "missions.description": "Suivi opérationnel des propositions, contrats et machines d’état.",
  "missions.empty": "Aucune mission ne correspond aux filtres.",
  "missions.legacy_notice":
    "Les missions historiques restent consultables, mais ne sont pas incluses dans les files financières v2.",
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
  "finance.initial":
    "Recherchez un paiement, transfert, remboursement ou payout v2. Les préfixes Stripe (cs_, pi_, ch_, tr_, re_, po_) sont également acceptés.",
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
  "preferences.title": "Mes paramètres",
  "preferences.description": "Langue et apparence de votre espace d’administration.",
  "preferences.interface": "Préférences d’interface",
  "preferences.private": "Ces préférences sont propres à votre compte administrateur.",
  "preferences.language": "Langue de l’interface",
  "preferences.theme": "Thème",
  "preferences.theme.light": "Clair",
  "preferences.theme.dark": "Sombre",
  "preferences.save": "Enregistrer mes préférences",
  "preferences.saving": "Enregistrement…",
  "preferences.saved_at": "Dernière sauvegarde : {date}",
  "preferences.languages_coming":
    "Le néerlandais, l’allemand et l’anglais seront proposés lorsque tout le back-office sera traduit.",
};

// The four catalogs remain ready for progressive translation, but only a
// complete catalog may be exposed as a selectable admin interface language.
const nl = {
  "nav.overview": "Overzicht",
  "nav.users": "Gebruikers",
  "nav.verifications": "Verificaties",
  "nav.missions": "Opdrachten",
  "nav.disputes": "Geschillen",
  "nav.finance": "Financiën",
  "nav.risk": "Chargebacks / risico",
  "nav.incidents": "Incidenten",
  "nav.audit": "Audit",
  "nav.configuration": "Configuratie / compliance",
  "nav.administrators": "Beheerders",
  "nav.preferences": "Mijn instellingen",
  "preferences.title": "Mijn instellingen",
  "preferences.description": "Taal en weergave van uw beheerdersomgeving.",
  "preferences.interface": "Interfacevoorkeuren",
  "preferences.private": "Deze voorkeuren horen bij uw beheerdersaccount.",
  "preferences.language": "Interfacetaal",
  "preferences.theme": "Thema",
  "preferences.theme.light": "Licht",
  "preferences.theme.dark": "Donker",
  "preferences.save": "Voorkeuren opslaan",
  "preferences.saving": "Opslaan…",
  "preferences.saved_at": "Laatst opgeslagen: {date}",
};
const de = {
  "nav.overview": "Übersicht",
  "nav.users": "Benutzer",
  "nav.verifications": "Prüfungen",
  "nav.missions": "Aufträge",
  "nav.disputes": "Streitfälle",
  "nav.finance": "Finanzen",
  "nav.risk": "Chargebacks / Risiko",
  "nav.incidents": "Vorfälle",
  "nav.audit": "Audit",
  "nav.configuration": "Konfiguration / Compliance",
  "nav.administrators": "Administratoren",
  "nav.preferences": "Meine Einstellungen",
  "preferences.title": "Meine Einstellungen",
  "preferences.description": "Sprache und Darstellung Ihres Adminbereichs.",
  "preferences.interface": "Oberflächeneinstellungen",
  "preferences.private": "Diese Einstellungen gelten nur für Ihr Administratorkonto.",
  "preferences.language": "Oberflächensprache",
  "preferences.theme": "Design",
  "preferences.theme.light": "Hell",
  "preferences.theme.dark": "Dunkel",
  "preferences.save": "Einstellungen speichern",
  "preferences.saving": "Speichern…",
  "preferences.saved_at": "Zuletzt gespeichert: {date}",
};
const en = {
  "nav.overview": "Overview",
  "nav.users": "Users",
  "nav.verifications": "Verifications",
  "nav.missions": "Missions",
  "nav.disputes": "Disputes",
  "nav.finance": "Finance",
  "nav.risk": "Chargebacks / risk",
  "nav.incidents": "Incidents",
  "nav.audit": "Audit",
  "nav.configuration": "Configuration / compliance",
  "nav.administrators": "Administrators",
  "nav.preferences": "My settings",
  "preferences.title": "My settings",
  "preferences.description": "Language and appearance of your admin workspace.",
  "preferences.interface": "Interface preferences",
  "preferences.private": "These preferences belong to your administrator account.",
  "preferences.language": "Interface language",
  "preferences.theme": "Theme",
  "preferences.theme.light": "Light",
  "preferences.theme.dark": "Dark",
  "preferences.save": "Save my preferences",
  "preferences.saving": "Saving…",
  "preferences.saved_at": "Last saved: {date}",
};
const catalogs = { fr, nl, de, en };

function interpolate(message, parameters) {
  return Object.entries(parameters || {}).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    message
  );
}

export function normalizeAdminLocale(locale) {
  const normalized = String(locale || "")
    .toLowerCase()
    .split("-")[0];
  return SUPPORTED_ADMIN_LOCALES.includes(normalized) ? normalized : DEFAULT_ADMIN_LOCALE;
}

export function normalizeAvailableAdminLocale(locale) {
  const normalized = normalizeAdminLocale(locale);
  return AVAILABLE_ADMIN_INTERFACE_LOCALES.includes(normalized) ? normalized : DEFAULT_ADMIN_LOCALE;
}

export function translateAdmin(locale, key, parameters) {
  const normalized = normalizeAdminLocale(locale);
  return interpolate(catalogs[normalized][key] || fr[key] || key, parameters);
}
