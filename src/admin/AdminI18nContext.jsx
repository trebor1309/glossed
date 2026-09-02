import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ADMIN_LOCALE_STORAGE_KEY,
  DEFAULT_ADMIN_LOCALE,
  normalizeAvailableAdminLocale,
  translateAdmin,
} from "./adminI18n";

const AdminI18nContext = createContext(null);
const ADMIN_THEME_STORAGE_KEY = "glossed-admin-theme";

function initialLocale() {
  try {
    return normalizeAvailableAdminLocale(localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_ADMIN_LOCALE;
  }
}

export function AdminI18nProvider({ children }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem(ADMIN_THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });
  const setLocale = useCallback((nextLocale) => {
    const normalized = normalizeAvailableAdminLocale(nextLocale);
    setLocaleState(normalized);
    try {
      localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, normalized);
    } catch {
      // Browser storage is only a cache; the server preference remains authoritative.
    }
  }, []);
  const setTheme = useCallback((nextTheme) => {
    const normalized = nextTheme === "dark" ? "dark" : "light";
    setThemeState(normalized);
    try {
      localStorage.setItem(ADMIN_THEME_STORAGE_KEY, normalized);
    } catch {
      // Browser storage is only a cache; the server preference remains authoritative.
    }
  }, []);
  const applyPreferences = useCallback(
    (preferences) => {
      setLocale(preferences?.interface_locale);
      setTheme(preferences?.theme);
    },
    [setLocale, setTheme]
  );
  useEffect(() => {
    document.documentElement.dataset.adminTheme = theme;
    return () => {
      delete document.documentElement.dataset.adminTheme;
    };
  }, [theme]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const value = useMemo(
    () => ({
      locale,
      theme,
      t: (key, parameters) => translateAdmin(locale, key, parameters),
      setLocale,
      setTheme,
      applyPreferences,
    }),
    [applyPreferences, locale, setLocale, setTheme, theme]
  );
  return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
}

export function useAdminI18n() {
  const context = useContext(AdminI18nContext);
  if (!context) throw new Error("useAdminI18n must be used inside AdminI18nProvider");
  return context;
}
