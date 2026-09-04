import { useEffect, useRef, useState } from "react";

export default function AddressAutocomplete({
  label = "Address",
  placeholder = "Type your address...",
  onSelect,
  onInputChange,
  defaultValue = "",
  required = false,
  inputId,
  types = ["geocode"],
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const typesRef = useRef(types);
  const valueRef = useRef(defaultValue || "");
  const [value, setValue] = useState(defaultValue || "");

  onSelectRef.current = onSelect;
  valueRef.current = value;

  useEffect(() => {
    setValue(defaultValue || "");
  }, [defaultValue]);

  useEffect(() => {
    let retryTimer;
    let attempts = 0;

    const initialize = () => {
      if (
        autocompleteRef.current ||
        !inputRef.current ||
        !window.google?.maps?.places?.Autocomplete
      ) {
        return Boolean(autocompleteRef.current);
      }

      autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
        types: typesRef.current,
        fields: ["address_components", "formatted_address", "geometry"],
      });

      autocompleteRef.current.addListener("place_changed", () => {
        const place = autocompleteRef.current.getPlace();
        if (!place?.geometry) return;

        const components = place.address_components || [];
        const find = (type) =>
          components.find((item) => item.types.includes(type))?.long_name || null;
        const city =
          find("locality") ||
          find("postal_town") ||
          find("sublocality") ||
          find("administrative_area_level_2");
        const formatted = place.formatted_address || valueRef.current;

        setValue(formatted);
        onSelectRef.current?.({
          address: formatted,
          city,
          postal_code: find("postal_code"),
          country: find("country"),
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng(),
        });
      });

      return true;
    };

    if (!initialize()) {
      retryTimer = window.setInterval(() => {
        attempts += 1;
        if (initialize() || attempts >= 80) window.clearInterval(retryTimer);
      }, 250);
    }

    return () => {
      window.clearInterval(retryTimer);
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, []);

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        className="mt-1 w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
        placeholder={placeholder}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onInputChange?.(event.target.value);
        }}
        required={required}
      />
    </div>
  );
}
