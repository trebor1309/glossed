import { useState, useRef, useEffect } from "react";
import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabaseClient";
import { Autocomplete } from "@react-google-maps/api";
import { motion } from "framer-motion";
import { Calendar, Clock, MapPin, Search, X } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";

export default function DashboardNew({ isModal = false, onClose, onSuccess }) {
  const { session } = useUser();

  // --- FORM STATES ---
  const [selectedServices, setSelectedServices] = useState([]);
  const [date, setDate] = useState("");
  const [timeSlots, setTimeSlots] = useState([]);
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

  // --- OPTIONS ---
  const serviceOptions = [
    { id: "Hair Stylist", label: "💇 Hair Stylist" },
    { id: "Barber", label: "💈 Barber" },
    { id: "Makeup Artist", label: "💄 Makeup Artist" },
    { id: "Nail Technician", label: "💅 Nail Technician" },
    { id: "Wellness", label: "🧘 Wellness" },
    { id: "Aesthetician", label: "🌸 Aesthetician" },
  ];

  const timeSlotOptions = ["Morning", "Noon", "Afternoon", "Evening"];

  // --- HANDLE CHECKBOXES ---
  const toggleService = (service) => {
    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((s) => s !== service)
        : [...prev, service]
    );
  };

  const toggleTimeSlot = (slot) => {
    setTimeSlots((prev) =>
      prev.includes(slot) ? prev.filter((t) => t !== slot) : [...prev, slot]
    );
  };

  // --- SUBMIT HANDLER ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setConfirmed(false);
    setPros([]);
    setToast(null);

    if (!selectedServices.length || !date || !timeSlots.length || !address) {
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
      const { data: matchedPros, error } = await supabase.rpc(
        "match_pros_for_multiple_services",
        {
          services: selectedServices,
          client_lat: clientLocation.lat,
          client_lng: clientLocation.lng,
        }
      );

      if (error) throw error;

      if (!matchedPros?.length) {
        setToast({
          message: "😕 No professionals found nearby for these services.",
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

      // 💾 Création de la réservation
      const { error: insertError } = await supabase.from("bookings").insert([
        {
          id: uuid(),
          client_id: session?.user?.id,
          services: selectedServices,
          date,
          time_slots: timeSlots,
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

      // ✅ Ferme le modal uniquement après succès
      if (onSuccess) onSuccess();
    } catch (err) {
      setToast({
        message: `❌ Error: ${err.message || err}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // --- DETECT DESKTOP / MOBILE ---
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const checkViewport = () => setIsDesktop(window.innerWidth >= 768);
    checkViewport();
    window.addEventListener("resize", checkViewport);
    return () => window.removeEventListener("resize", checkViewport);
  }, []);

  // --- MAIN CONTENT ---
  const content = (
    <motion.div
      className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-lg space-y-8 relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Cancel / Close */}
      {isModal && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={22} />
        </button>
      )}

      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <Search size={20} /> New Booking Request
      </h2>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Services */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select Services
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {serviceOptions.map((opt) => (
              <label
                key={opt.id}
                className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer ${
                  selectedServices.includes(opt.id)
                    ? "bg-rose-100 border-rose-400"
                    : "border-gray-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedServices.includes(opt.id)}
                  onChange={() => toggleService(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-1">
            If you want different professionals for each service, please submit
            separate requests.
          </p>
        </div>

        {/* Date */}
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

        {/* Time Slots */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
            <Clock size={14} /> Preferred Time
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {timeSlotOptions.map((slot) => (
              <label
                key={slot}
                className={`flex items-center justify-center border rounded-lg px-3 py-2 cursor-pointer ${
                  timeSlots.includes(slot)
                    ? "bg-rose-100 border-rose-400"
                    : "border-gray-300"
                }`}
              >
                <input
                  type="checkbox"
                  checked={timeSlots.includes(slot)}
                  onChange={() => toggleTimeSlot(slot)}
                />
                <span className="ml-2">{slot}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Address */}
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

        {/* Submit + Cancel */}
        <div className="flex justify-between items-center pt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
          >
            Cancel
          </button>
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
                <p className="font-medium text-gray-800">{pro.business_name}</p>
                <p className="text-sm text-gray-600">
                  {pro.business_type.join(", ")} —{" "}
                  {pro.distance_km ? `${pro.distance_km.toFixed(2)} km` : "N/A"}
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

  // --- IF MODAL ---
  if (isModal && isDesktop) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        {content}
      </div>
    );
  }

  // --- OTHERWISE PAGE ---
  return content;
}
