import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const fallbackMessage =
  "Bookings are not open yet. You can create your account and explore professional profiles in the meantime.";

const PlatformCapabilitiesContext = createContext(null);

export function PlatformCapabilitiesProvider({ children }) {
  const [capabilities, setCapabilities] = useState({
    bookingsEnabled: false,
    bookingsMessage: fallbackMessage,
    loading: true,
  });

  useEffect(() => {
    let active = true;

    supabase
      .rpc("get_public_platform_capabilities")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error("Unable to load platform capabilities:", error.message);
          setCapabilities((current) => ({ ...current, loading: false }));
          return;
        }

        setCapabilities({
          bookingsEnabled: data?.bookings_enabled === true,
          bookingsMessage: data?.bookings_message || fallbackMessage,
          loading: false,
        });
      })
      .catch((error) => {
        if (!active) return;
        console.error("Unable to load platform capabilities:", error);
        setCapabilities((current) => ({ ...current, loading: false }));
      });

    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => capabilities, [capabilities]);

  return (
    <PlatformCapabilitiesContext.Provider value={value}>
      {children}
    </PlatformCapabilitiesContext.Provider>
  );
}

export function usePlatformCapabilities() {
  const context = useContext(PlatformCapabilitiesContext);
  if (!context) {
    throw new Error("usePlatformCapabilities must be used within PlatformCapabilitiesProvider");
  }
  return context;
}
