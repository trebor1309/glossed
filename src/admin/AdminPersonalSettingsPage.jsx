import { useEffect, useRef, useState } from "react";
import { Moon, Palette, Save, Sun } from "lucide-react";
import { AdminPanel, ErrorPanel, LoadingPanel, formatDate } from "./AdminDataUi";
import { useAdminI18n } from "./AdminI18nContext";
import { getMyAdminPreferences, updateMyAdminPreferences } from "./adminOperationsApi";
import { AVAILABLE_ADMIN_INTERFACE_LOCALES } from "./adminI18n";

const localeLabels = new Map([
  ["fr", "Français"],
  ["nl", "Nederlands"],
  ["de", "Deutsch"],
  ["en", "English"],
]);
const localeOptions = AVAILABLE_ADMIN_INTERFACE_LOCALES.map((locale) => [
  locale,
  localeLabels.get(locale),
]);

export default function AdminPersonalSettingsPage() {
  const { locale, theme, setLocale, setTheme, t } = useAdminI18n();
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const saveOperation = useRef(null);

  useEffect(() => {
    let active = true;
    getMyAdminPreferences()
      .then((data) => {
        if (!active) return;
        setSaved(data);
        setLocale(data.interface_locale);
        setTheme(data.theme);
      })
      .catch((loadError) => active && setError(loadError.message));
    return () => {
      active = false;
    };
  }, [setLocale, setTheme]);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const payloadKey = `${locale}:${theme}`;
    if (!saveOperation.current || saveOperation.current.payloadKey !== payloadKey) {
      saveOperation.current = { payloadKey, operationId: crypto.randomUUID() };
    }
    try {
      setSaved(await updateMyAdminPreferences(locale, theme, saveOperation.current.operationId));
      saveOperation.current = null;
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  if (!saved && !error) return <LoadingPanel />;
  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Palette className="text-rose-600" />
          {t("preferences.title")}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{t("preferences.description")}</p>
      </header>
      {error && <ErrorPanel error={error} />}
      <AdminPanel title={t("preferences.interface")} description={t("preferences.private")}>
        <form onSubmit={submit} className="space-y-6">
          <label className="block max-w-md text-sm font-semibold">
            {t("preferences.language")}
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="mt-2 w-full rounded-xl border px-3 py-2.5"
            >
              {localeOptions.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-slate-500">{t("preferences.languages_coming")}</p>
          <fieldset>
            <legend className="text-sm font-semibold">{t("preferences.theme")}</legend>
            <div className="mt-2 grid max-w-xl gap-3 sm:grid-cols-2">
              {[
                ["light", Sun, t("preferences.theme.light")],
                ["dark", Moon, t("preferences.theme.dark")],
              ].map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={theme === value}
                  className={`flex items-center gap-3 rounded-xl border p-4 text-left ${theme === value ? "border-rose-500 bg-rose-50 text-rose-900" : "border-slate-200 bg-white"}`}
                >
                  <Icon size={20} />
                  <span className="font-semibold">{label}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 font-semibold text-white disabled:opacity-50"
            >
              <Save size={17} />
              {busy ? t("preferences.saving") : t("preferences.save")}
            </button>
            {saved?.updated_at && (
              <span className="text-xs text-slate-500">
                {t("preferences.saved_at", { date: formatDate(saved.updated_at) })}
              </span>
            )}
          </div>
        </form>
      </AdminPanel>
    </div>
  );
}
