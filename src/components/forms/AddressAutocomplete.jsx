import { useEffect, useRef, useState } from "react";
import { googlePlacesUnavailableMessage, useGoogleMaps } from "@/context/GoogleMapsContext";
import { reportOperationalEvent } from "@/lib/operationalTelemetry";

export default function AddressAutocomplete({
  label = "Address",
  placeholder = "Type your address...",
  onSelect,
  onInputChange,
  defaultValue = "",
  required = false,
  inputId,
  disabled = false,
  allowManualEntry = false,
}) {
  const { isLoaded, isLoading, error } = useGoogleMaps({ request: true });
  const widgetHostRef = useRef(null);
  const widgetRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const onInputChangeRef = useRef(onInputChange);
  const valueRef = useRef(defaultValue || "");
  const [value, setValue] = useState(defaultValue || "");
  const [selectionError, setSelectionError] = useState(null);
  const ariaLabel = typeof label === "string" ? label : "Address";

  onSelectRef.current = onSelect;
  onInputChangeRef.current = onInputChange;
  valueRef.current = value;

  useEffect(() => {
    const nextValue = defaultValue || "";
    setValue(nextValue);
    if (widgetRef.current && widgetRef.current.value !== nextValue) {
      widgetRef.current.value = nextValue;
    }
  }, [defaultValue]);

  useEffect(() => {
    const PlaceAutocompleteElement = window.google?.maps?.places?.PlaceAutocompleteElement;
    if (!isLoaded || !widgetHostRef.current || !PlaceAutocompleteElement) return undefined;

    const widget = new PlaceAutocompleteElement({
      includedRegionCodes: ["be"],
      requestedRegion: "be",
    });
    widget.id = inputId;
    widget.placeholder = placeholder;
    widget.value = valueRef.current;
    widget.disabled = disabled;
    widget.required = required;
    widget.setAttribute("aria-label", ariaLabel);
    widget.setAttribute("aria-describedby", `${inputId}-places-status`);
    widget.className = "mt-1 block w-full";

    const handleInput = () => {
      const nextValue = widget.value || "";
      valueRef.current = nextValue;
      setValue(nextValue);
      setSelectionError(null);
      onInputChangeRef.current?.(nextValue);
    };

    const handleSelection = async (event) => {
      try {
        const place = event.placePrediction?.toPlace();
        if (!place) return;
        await place.fetchFields({
          fields: ["formattedAddress", "location", "addressComponents"],
        });
        if (!place.location) throw new Error("The selected place has no coordinates.");

        const components = place.addressComponents || [];
        const find = (type) =>
          components.find((item) => item.types?.includes(type))?.longText || null;
        const findShort = (type) =>
          components.find((item) => item.types?.includes(type))?.shortText || null;
        const city =
          find("locality") ||
          find("postal_town") ||
          find("sublocality") ||
          find("administrative_area_level_2");
        const formatted = place.formattedAddress || widget.value || valueRef.current;

        widget.value = formatted;
        valueRef.current = formatted;
        setValue(formatted);
        setSelectionError(null);
        onSelectRef.current?.({
          address: formatted,
          city,
          postal_code: find("postal_code"),
          country: find("country"),
          country_code: findShort("country")?.toUpperCase() || null,
          latitude: place.location.lat(),
          longitude: place.location.lng(),
        });
      } catch (placeError) {
        console.error("Unable to load the selected Google place:", placeError);
        reportOperationalEvent({
          eventType: "maps_widget_failure",
          eventCode: "google_place_details_failure",
          severity: "warning",
        });
        setSelectionError("Unable to use this suggestion. Please choose another address.");
      }
    };

    const handleGoogleError = () => {
      reportOperationalEvent({
        eventType: "maps_widget_failure",
        eventCode: "google_places_widget_failure",
        severity: "warning",
      });
      setSelectionError("Address suggestions are temporarily unavailable.");
    };

    widget.addEventListener("input", handleInput);
    widget.addEventListener("gmp-select", handleSelection);
    widget.addEventListener("gmp-error", handleGoogleError);
    widgetHostRef.current.replaceChildren(widget);
    widgetRef.current = widget;

    return () => {
      widget.removeEventListener("input", handleInput);
      widget.removeEventListener("gmp-select", handleSelection);
      widget.removeEventListener("gmp-error", handleGoogleError);
      widget.remove();
      widgetRef.current = null;
    };
  }, [ariaLabel, disabled, inputId, isLoaded, placeholder, required]);

  const mapsUnavailable = !isLoaded;
  const nativeInputDisabled = disabled || (mapsUnavailable && !allowManualEntry);
  const statusMessage = mapsUnavailable
    ? isLoading
      ? "Loading address suggestions…"
      : googlePlacesUnavailableMessage(error, { allowManualEntry })
    : selectionError;

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {isLoaded ? (
        <div ref={widgetHostRef} />
      ) : (
        <input
          id={inputId}
          type="text"
          className="mt-1 w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:cursor-not-allowed disabled:bg-gray-100"
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            onInputChange?.(event.target.value);
          }}
          required={required}
          disabled={nativeInputDisabled}
          aria-describedby={`${inputId}-places-status`}
        />
      )}
      {statusMessage && (
        <p
          id={`${inputId}-places-status`}
          role={error || selectionError ? "alert" : "status"}
          className={`mt-2 text-sm ${error || selectionError ? "text-amber-700" : "text-gray-500"}`}
        >
          {statusMessage}
        </p>
      )}
    </div>
  );
}
