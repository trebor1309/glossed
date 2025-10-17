import { useState, useRef } from "react";
import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabaseClient";
import { Autocomplete } from "@react-google-maps/api";
import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, Search } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";

export default function DashboardNew() {
  const { session } = useUser();
  // --- FORM STATES ---
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [clientLocation, setClientLocation] = useState({
    lat: null,
    lng: null,
  });

  // --- UI STATES ---
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pros, setPros] = useState([]);
  const [toast, setToast] = useState(null);

  // --- GOOGLE AUTOCOMPLETE ---
  const autocompleteRef = useRef(null);

  const onLoad = (ref) => {
    autocompleteRef.current = ref;
  };

  const onPlaceChanged = () => {
    if (autocompleteRef.current) {
      const place = autocompleteRef.current.getPlace();
      if (!place.geometry) return;

      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();

      setAddress(place.formatted_address);
      setClientLocation({ lat, lng });

      console.log("📍 Client location:", lat, lng);
    }
  };

  // --- SUBMIT HANDLER ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setConfirmed(false);
    setPros([]);
    setToast(null);

    if (!service || !date || !timeSlot || !address) {
      setToast({
        message: "⚠️ Please fill all required fields.",
        type: "error",
      });
      setLoading(false);
      return;
    }

    if (!clientLocation.lat || !clientLocation.lng) {
      setToast({ message: "⚠️ Please select a valid address.", type: "error" });
      setLoading(false);
      return;
    }

    try {
      // 🔍 Recherche des pros via RPC
      const serviceType = service.replace(/^[^A-Za-z]+/, "").trim();

      const { data: matchedPros, error } = await supabase.rpc(
        "match_pros_for_multiple_services",
        {
          services: [serviceType],
          client_lat: clientLocation.lat,
          client_lng: clientLocation.lng,
        }
      );

      if (error) throw error;

      if (!matchedPros?.length) {
        setToast({
          message: "😕 No professionals found nearby for this service.",
          type: "error",
        });
        setLoading(false);
        return;
      }

      console.log("✅ Found pros:", matchedPros);
      setPros(matchedPros);
      setToast({
        message: `✅ ${matchedPros.length} professional(s) found nearby!`,
        type: "success",
      });
      setConfirmed(true);

      // 💾 Création réelle de la réservation
      const { error: insertError } = await supabase.from("bookings").insert([
        {
          client_id: session?.user?.id, // ✅ session récupérée depuis UserContext
          service,
          date,
          time_slot: timeSlot,
          address,
          notes,
          client_lat: clientLocation.lat,
          client_lng: clientLocation.lng,
          status: "pending",
        },
      ]);

      if (insertError) throw insertError;

      setToast({
        message: "✅ Booking created successfully!",
        type: "success",
      });
    } catch (err) {
      setToast({
        message: `❌ Error: ${err.message || err}`,
        type: "error",
      });
      setLoading(false);
    }

    // --- UI ---
    return (
      <motion.div
        className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-lg space-y-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Search size={20} /> New Booking Request
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Service */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Select Service
            </label>
            <select
              value={service}
              onChange={(e) => setService(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            >
              <option value="">Choose a service...</option>
              <option value="Hair Stylist">💇 Hair Stylist</option>
              <option value="Barber">💈 Barber</option>
              <option value="Makeup Artist">💄 Makeup Artist</option>
              <option value="Nail Technician">💅 Nail Technician</option>
              <option value="Wellness">🧘 Wellness</option>
              <option value="Aesthetician">🌸 Aesthetician</option>
            </select>
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Calendar size={14} /> Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                <Clock size={14} /> Time
              </label>
              <input
                type="time"
                value={timeSlot}
                onChange={(e) => setTimeSlot(e.target.value)}
                className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Address (Google Autocomplete) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
              <MapPin size={14} /> Address
            </label>
            <Autocomplete onLoad={onLoad} onPlaceChanged={onPlaceChanged}>
              <input
                type="text"
                placeholder="Enter your address..."
                className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Autocomplete>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes (optional)
            </label>
            <textarea
              rows="3"
              placeholder="Add any important details..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          {/* Submit */}
          <div className="text-right">
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition-transform disabled:opacity-70"
            >
              {loading ? "Searching..." : "Confirm Booking"}
            </button>
          </div>
        </form>

        {/* Results */}
        {confirmed && pros.length > 0 && (
          <div className="border-t pt-4 space-y-3">
            <h3 className="text-lg font-semibold text-gray-800">
              Matching Professionals
            </h3>
            {pros.map((pro) => (
              <div
                key={pro.id}
                className="p-4 border rounded-xl flex items-center justify-between hover:bg-gray-50 transition"
              >
                <div>
                  <p className="font-medium text-gray-800">
                    {pro.business_name}
                  </p>
                  <p className="text-sm text-gray-600">
                    {pro.business_type.join(", ")} —{" "}
                    {pro.distance_km
                      ? `${pro.distance_km.toFixed(2)} km`
                      : "N/A"}
                  </p>
                </div>
                <button
                  onClick={() => alert(`Booking sent to ${pro.business_name}`)}
                  className="px-4 py-1.5 bg-rose-600 text-white text-sm rounded-full hover:scale-[1.05] transition"
                >
                  Select
                </button>
              </div>
            ))}
          </div>
        )}

        {toast && (
          <Toast
            message={toast.message}
            type={toast.type}
            onClose={() => setToast(null)}
          />
        )}
      </motion.div>
    );
  };
}
