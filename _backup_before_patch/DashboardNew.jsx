import { useState } from "react";
import { Autocomplete } from "@react-google-maps/api";

export default function DashboardNew() {
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [address, setAddress] = useState({
    street: "",
    postalCode: "",
    city: "",
    country: "Belgium",
  });
  const [notes, setNotes] = useState("");
  const handlePlaceSelect = (autocomplete) => {
    const place = autocomplete.getPlace();
    if (!place || !place.address_components) return;
    const components = place.address_components.reduce((acc, comp) => {
      if (comp.types.includes("route")) acc.street = comp.long_name;
      if (comp.types.includes("street_number"))
        acc.streetNumber = comp.long_name;
      if (comp.types.includes("postal_code")) acc.postalCode = comp.long_name;
      if (comp.types.includes("locality")) acc.city = comp.long_name;
      if (comp.types.includes("country")) acc.country = comp.long_name;
      return acc;
    }, {});
    setAddress({
      street: `${components.street || ""} ${
        components.streetNumber || ""
      }`.trim(),
      postalCode: components.postalCode || "",
      city: components.city || "",
      country: components.country || "Belgium",
    });
  };

  const timeSlots = [
    { label: "Morning (8:00 - 12:00)", value: "morning" },
    { label: "Midday (12:00 - 14:00)", value: "noon" },
    { label: "Afternoon (14:00 - 18:00)", value: "afternoon" },
    { label: "Evening (18:00 - 21:00)", value: "evening" },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();

    const booking = {
      service,
      date,
      timeSlot,
      address,
      notes,
    };

    console.log("📦 Booking data:", booking);
    alert("Your booking request has been sent ✨");
    // 👉 futur: envoyer à ton backend ou à Supabase
  };

  // à venir: on branchera ici une API Google Maps Autocomplete pour "street"
  const handleAddressChange = (field, value) => {
    setAddress((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="mt-10 max-w-xl mx-auto text-center">
      <h1 className="text-3xl font-bold text-gray-800 mb-4">
        Book a New Service
      </h1>
      <p className="text-gray-600 mb-8">
        Choose your service, select a time slot and enter your address ✨
      </p>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow p-6 space-y-4 text-left"
      >
        {/* Service */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Service
          </label>
          <select
            value={service}
            onChange={(e) => setService(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
          >
            <option value="">Select a service</option>
            <option>💅 Nail Styling</option>
            <option>💇 Hair Styling</option>
            <option>💄 Makeup Session</option>
            <option>🧖 Facial Treatment</option>
            <option>👻 Child Makeup</option>
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Date
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
          />
        </div>

        {/* Time slot */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Preferred time
          </label>
          <select
            value={timeSlot}
            onChange={(e) => setTimeSlot(e.target.value)}
            required
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
          >
            <option value="">Select a time slot</option>
            {timeSlots.map((slot) => (
              <option key={slot.value} value={slot.value}>
                {slot.label}
              </option>
            ))}
          </select>
        </div>

        {/* Adresse complète */}
        <div className="space-y-3">
          <h3 className="text-md font-semibold text-gray-800 mt-4 mb-2">
            Address details
          </h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street and number
            </label>
            <Autocomplete
              onLoad={(auto) => (window.autocomplete = auto)}
              onPlaceChanged={() => handlePlaceSelect(window.autocomplete)}
            >
              <input
                type="text"
                placeholder="e.g. Avenue Louise 123"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
              />
            </Autocomplete>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Postal code
              </label>
              <input
                type="text"
                value={address.postalCode}
                onChange={(e) =>
                  handleAddressChange("postalCode", e.target.value)
                }
                placeholder="1050"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                City
              </label>
              <input
                type="text"
                value={address.city}
                onChange={(e) => handleAddressChange("city", e.target.value)}
                placeholder="Ixelles"
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country
            </label>
            <select
              value={address.country}
              onChange={(e) => handleAddressChange("country", e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
            >
              <option>Belgium</option>
              <option>France</option>
              <option>Germany</option>
              <option>Luxembourg</option>
              <option>Netherlands</option>
            </select>
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Additional notes (optional)
          </label>
          <textarea
            rows="3"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any preferences or details..."
            className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
          ></textarea>
        </div>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-rose-600 to-red-600 text-white px-6 py-3 rounded-full font-semibold hover:scale-105 transition"
        >
          Confirm Booking
        </button>
      </form>
    </div>
  );
}
