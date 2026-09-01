import { createContext, useContext, useMemo, useState } from "react";
import {
  ADMIN_LOCALE_STORAGE_KEY,
  DEFAULT_ADMIN_LOCALE,
  normalizeAdminLocale,
  translateAdmin,
} from "./adminI18n";

const AdminI18nContext = createContext(null);

function initialLocale() {
  try {
    return normalizeAdminLocale(localStorage.getItem(ADMIN_LOCALE_STORAGE_KEY));
  } catch {
    return DEFAULT_ADMIN_LOCALE;
  }
}

export function AdminI18nProvider({ children }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const value = useMemo(() => ({
    locale,
    t: (key, parameters) => translateAdmin(locale, key, parameters),
    setLocale: (nextLocale) => {
      const normalized = normalizeAdminLocale(nextLocale);
      setLocaleState(normalized);
      localStorage.setItem(ADMIN_LOCALE_STORAGE_KEY, normalized);
    },
  }), [locale]);
  return <AdminI18nContext.Provider value={value}>{children}</AdminI18nContext.Provider>;
}

export function useAdminI18n() {
  const context = useContext(AdminI18nContext);
  if (!context) throw new Error("useAdminI18n must be used inside AdminI18nProvider");
  return context;
}
