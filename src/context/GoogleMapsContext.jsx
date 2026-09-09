import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useJsApiLoader } from "@react-google-maps/api";

const GOOGLE_MAPS_SCRIPT_ID = "glossed-google-maps";
const GOOGLE_MAPS_LIBRARIES = ["places"];
const GoogleMapsContext = createContext(null);

function GoogleMapsLoader({ apiKey, onStatus }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: GOOGLE_MAPS_SCRIPT_ID,
    googleMapsApiKey: apiKey,
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  useEffect(() => {
    onStatus({ isLoaded, error: loadError || null });
  }, [isLoaded, loadError, onStatus]);

  return null;
}

export function GoogleMapsProvider({ children }) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || "";
  const [requested, setRequested] = useState(false);
  const [status, setStatus] = useState(() => ({
    isLoaded: Boolean(window.google?.maps?.places?.Autocomplete),
    error: null,
  }));

  const requestGoogleMaps = useCallback(() => setRequested(true), []);
  const updateStatus = useCallback(
    (nextStatus) =>
      setStatus((current) =>
        current.isLoaded === nextStatus.isLoaded && current.error === nextStatus.error
          ? current
          : nextStatus
      ),
    []
  );

  useEffect(() => {
    if (!requested || typeof window === "undefined") return undefined;
    const previousHandler = window.gm_authFailure;
    const authFailure = () => {
      setStatus({
        isLoaded: false,
        error: new Error("Google Maps rejected the configured browser key."),
      });
    };
    window.gm_authFailure = authFailure;
    return () => {
      if (window.gm_authFailure === authFailure) window.gm_authFailure = previousHandler;
    };
  }, [requested]);

  const value = useMemo(() => {
    const missingKeyError =
      requested && !apiKey && !status.isLoaded
        ? new Error("Google Maps key is not configured.")
        : null;
    return {
      isLoaded: status.isLoaded,
      isLoading: requested && Boolean(apiKey) && !status.isLoaded && !status.error,
      error: missingKeyError || status.error,
      requestGoogleMaps,
    };
  }, [apiKey, requestGoogleMaps, requested, status]);

  return (
    <GoogleMapsContext.Provider value={value}>
      {children}
      {requested && apiKey && !status.isLoaded && !status.error && (
        <GoogleMapsLoader apiKey={apiKey} onStatus={updateStatus} />
      )}
    </GoogleMapsContext.Provider>
  );
}

export function useGoogleMaps({ request = false } = {}) {
  const context = useContext(GoogleMapsContext);
  if (!context) throw new Error("useGoogleMaps must be used inside GoogleMapsProvider");
  const { requestGoogleMaps } = context;

  useEffect(() => {
    if (request) requestGoogleMaps();
  }, [request, requestGoogleMaps]);

  return context;
}

export function googlePlacesUnavailableMessage(error) {
  if (!error) return "Address suggestions are loading…";
  return "Address suggestions are temporarily unavailable. You can still use a saved address.";
}
