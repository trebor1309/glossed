// src/components/forms/AddressAutocomplete.jsx
import { useEffect, useRef, useState } from "react";

export default function AddressAutocomplete({
  label = "Address",
  placeholder = "Type your address...",
  onSelect,
  defaultValue = "",
  required = false,
}) {
  const inputRef = useRef(null);
  const autocompleteRef = useRef(null);
  const [value, setValue] = useState(defaultValue || "");

  useEffect(() => {
    if (!window.google || !window.google.maps || !window.google.maps.places) {
      console.warn(
        "⚠️ Google Places API not loaded. AddressAutocomplete will work as plain input."
      );
      return;
    }

    if (!inputRef.current) return;

    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      types: ["geocode"],
      // Tu peux restreindre à certains pays si tu veux:
      // componentRestrictions: { country: ["be", "fr", "de", "nl"] },
    });

    autocompleteRef.current.addListener("place_changed", () => {
      const place = autocompleteRef.current.getPlace();
      if (!place || !place.geometry) return;

      const components = place.address_components || [];
      const find = (type) => components.find((c) => c.types.includes(type))?.long_name || null;

      const city =
        find("locality") ||
        find("postal_town") ||
        find("sublocality") ||
        find("administrative_area_level_2");

      const postalCode = find("postal_code");
      const country = find("country");
      const formatted = place.formatted_address || value;

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      setValue(formatted);

      onSelect?.({
        address: formatted,
        city,
        postal_code: postalCode,
        country,
        latitude: lat,
        longitude: lng,
      });
    });

    return () => {
      if (autocompleteRef.current) {
        window.google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
    };
  }, [onSelect]);

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        ref={inputRef}
        type="text"
        className="w-full mt-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        required={required}
      />
    </div>
  );
}
