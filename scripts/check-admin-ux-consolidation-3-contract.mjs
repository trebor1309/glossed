import { readFileSync } from "node:fs";
const read = (path) => readFileSync(path, "utf8");
const configuration = read("src/admin/AdminConfigurationPage.jsx");
const preferences = read("src/admin/AdminPersonalSettingsPage.jsx");
const context = read("src/admin/AdminI18nContext.jsx");
const i18n = read("src/admin/adminI18n.js");
const layout = read("src/admin/AdminLayout.jsx");
const api = read("src/admin/adminOperationsApi.js");
const styles = read("src/index.css");
const migration = read("supabase/migrations/20260901230000_admin_ux_consolidation_3.sql");
const requirements = [
  [
    configuration.includes("ConfigurationFields") &&
      configuration.includes("warning_euros") &&
      configuration.includes("open_days") &&
      configuration.includes("standard_payout_isodays") &&
      configuration.includes("jurisdiction_code"),
    "dedicated typed configuration forms",
  ],
  [
    configuration.includes("Aperçu JSON avancé") &&
      !configuration.includes("Paramètres JSON<textarea"),
    "JSON retained as read-only advanced preview",
  ],
  [
    configuration.includes("Dernière version créée") &&
      configuration.includes("Version active") &&
      configuration.includes("created_by_email"),
    "active/latest/history and author presentation",
  ],
  [
    configuration.includes("DAYS.find") && configuration.includes("standard_payout_local_time"),
    "human payout schedule",
  ],
  [
    preferences.includes("interface_locale") &&
      preferences.includes("updateMyAdminPreferences") &&
      preferences.includes('["dark", Moon'),
    "account preference screen",
  ],
  [
    preferences.includes("useRef") &&
      preferences.includes("saveOperation.current.operationId") &&
      preferences.includes("payloadKey") &&
      !api.includes("operationId = crypto.randomUUID()"),
    "stable preference operation ID across retries",
  ],
  [
    i18n.includes('SUPPORTED_ADMIN_LOCALES = Object.freeze(["fr", "nl", "de", "en"])') &&
      i18n.includes('AVAILABLE_ADMIN_INTERFACE_LOCALES = Object.freeze(["fr"])') &&
      context.includes("normalizeAvailableAdminLocale") &&
      preferences.includes("AVAILABLE_ADMIN_INTERFACE_LOCALES.map"),
    "four-locale infrastructure with French-only complete interface exposure",
  ],
  [
    context.includes("dataset.adminTheme") && context.includes("applyPreferences"),
    "preference hydration and scoped theme",
  ],
  [layout.includes('labelKey: "nav.preferences"'), "separate personal settings navigation"],
  [
    styles.includes("#admin-root .text-slate-700") &&
      styles.includes("#admin-root .text-slate-800") &&
      styles.includes("#admin-root .text-black") &&
      styles.includes("input::placeholder"),
    "dark-theme foreground contrast coverage",
  ],
  [
    api.includes("admin_get_configuration_catalog_ux_v3") &&
      api.includes("admin_update_my_preferences"),
    "v3 RPC wiring",
  ],
  [
    migration.includes("assert_admin_permission('admin.access')") &&
      migration.includes("pg_advisory_xact_lock") &&
      migration.includes("preferences.update"),
    "RBAC, idempotence and preference audit",
  ],
  [
    migration.includes("Jurisdiction policy foundations can only be created as drafts") &&
      !migration.includes("set enabled = true"),
    "no national policy or production flag activation",
  ],
];
const failures = requirements.filter(([ok]) => !ok).map(([, label]) => label);
if (failures.length)
  throw new Error(`Admin UX tranche 3 contract failed:\n- ${failures.join("\n- ")}`);
console.log("Admin UX consolidation tranche 3 contract passed.");
