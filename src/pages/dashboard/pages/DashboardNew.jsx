import { useState, useEffect } from "react";
import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Clock,
  MapPin,
  Search,
} from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";

/* ---------------------------------------------------------
   STEP 1 – Services
--------------------------------------------------------- */
function StepServices({ bookingData, setBookingData, onNext }) {
  const serviceOptions = [
    {
      id: "Hair Stylist",
      label: "Hair Stylist",
      img: "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%253D%253D&auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Barber",
      label: "Barber",
      img: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%253D%253D&auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Makeup Artist",
      label: "Makeup Artist",
      img: "https://images.unsplash.com/photo-1583784561105-a674080f391e?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%253D%253D&auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Manicure",
      label: "Manicure",
      img: "https://images.unsplash.com/photo-1636019411401-82485711b6ba?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%253D%253D&auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Skincare",
      label: "Skincare",
      img: "https://images.unsplash.com/photo-1630398777649-cdfc7c5e8a24?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%253D%253D&auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Kids Makeup",
      label: "Kids Makeup",
      img: "https://images.unsplash.com/photo-1676918324432-f23552e80484?ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%253D%253D&auto=format&fit=crop&w=800&q=60",
    },
  ];

  const toggleService = (service) => {
    setBookingData((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));
  };

  return (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <Search size={20} /> Which service(s) would you like to book?
      </h2>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {serviceOptions.map((opt) => {
          const selected = bookingData.services.includes(opt.id);
          return (
            <div
              key={opt.id}
              onClick={() => toggleService(opt.id)}
              className={`relative cursor-pointer rounded-2xl overflow-hidden border-2 group transition transform hover:scale-[1.02] ${
                selected ? "border-rose-500 shadow-md" : "border-gray-200"
              }`}
            >
              <img
                src={opt.img}
                alt={opt.label}
                className={`object-cover w-full h-36 group-hover:opacity-90 transition ${
                  selected ? "opacity-80" : "opacity-100"
                }`}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent flex items-end justify-center pb-3 text-white font-semibold text-center text-sm sm:text-base">
                {opt.label}
              </div>
              {selected && (
                <div className="absolute top-2 right-2 bg-rose-600 text-white text-xs px-2 py-0.5 rounded-full shadow">
                  Selected
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex justify-between items-center pt-6">
        <button
          onClick={onNext}
          disabled={bookingData.services.length === 0}
          className="ml-auto px-6 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition disabled:opacity-60"
        >
          Next <ArrowRight size={18} className="inline ml-2" />
        </button>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------
   STEP 2 – When
--------------------------------------------------------- */
function StepWhen({ bookingData, setBookingData, onNext, onPrev }) {
  const timeSlotOptions = [
    "Morning (8–12)",
    "Noon (12–14)",
    "Afternoon (13–18)",
    "Evening (17–19)",
  ];

  const toggleTimeSlot = (slot) => {
    setBookingData((prev) => ({
      ...prev,
      timeSlots: prev.timeSlots.includes(slot)
        ? prev.timeSlots.filter((s) => s !== slot)
        : [...prev.timeSlots, slot],
    }));
  };

  return (
    <motion.div
      key="step2"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <Calendar size={20} /> When would you like the service?
      </h2>

      <input
        type="date"
        value={bookingData.date}
        onChange={(e) =>
          setBookingData({ ...bookingData, date: e.target.value })
        }
        className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {timeSlotOptions.map((slot) => (
          <button
            key={slot}
            onClick={() => toggleTimeSlot(slot)}
            className={`border rounded-lg px-3 py-2 text-sm font-medium ${
              bookingData.timeSlots.includes(slot)
                ? "bg-rose-100 border-rose-500"
                : "border-gray-300"
            }`}
          >
            {slot}
          </button>
        ))}
      </div>

      <div className="flex justify-between pt-6">
        <button
          onClick={onPrev}
          className="px-5 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
        >
          <ArrowLeft size={18} className="inline mr-2" /> Previous
        </button>
        <button
          onClick={onNext}
          disabled={!bookingData.date || bookingData.timeSlots.length === 0}
          className="px-6 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition disabled:opacity-60"
        >
          Next <ArrowRight size={18} className="inline ml-2" />
        </button>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------
   STEP 3 – Address & Notes (final corrected version)
--------------------------------------------------------- */
function StepAddress({ bookingData, setBookingData, onNext, onPrev }) {
  useEffect(() => {
    if (!window.google?.maps?.places?.PlaceAutocompleteElement) return;

    const container = document.getElementById("autocomplete-container");
    if (!container) return;

    // nettoie tout résidu pour éviter les doublons
    container.innerHTML = "";

    // crée le champ Google
    const placeAutocomplete = new google.maps.places.PlaceAutocompleteElement({
      componentRestrictions: { country: "be" },
    });

    // applique un style uniforme Tailwind
    placeAutocomplete.style.border = "1px solid #d1d5db";
    placeAutocomplete.style.borderRadius = "0.5rem";
    placeAutocomplete.style.padding = "0.5rem 1rem";
    placeAutocomplete.style.width = "100%";
    placeAutocomplete.style.outline = "none";
    placeAutocomplete.style.fontSize = "0.95rem";
    placeAutocomplete.style.transition = "all 0.2s";
    placeAutocomplete.addEventListener("focus", () => {
      placeAutocomplete.style.borderColor = "#f43f5e"; // rose-600
      placeAutocomplete.style.boxShadow = "0 0 0 3px rgba(244,63,94,0.2)";
    });
    placeAutocomplete.addEventListener("blur", () => {
      placeAutocomplete.style.borderColor = "#d1d5db";
      placeAutocomplete.style.boxShadow = "none";
    });

    container.appendChild(placeAutocomplete);

    // écoute la sélection d'une adresse
    const handleSelect = (e) => {
      const place = e?.place;
      if (!place?.location) return;
      const formatted = place.formattedAddress;
      const lat = place.location.lat();
      const lng = place.location.lng();

      // met à jour immédiatement le state
      setBookingData((prev) => ({
        ...prev,
        address: formatted,
        latitude: lat,
        longitude: lng,
      }));

      // force un event React de re-rendu
      requestAnimationFrame(() => {
        const evt = new Event("input", { bubbles: true });
        container.dispatchEvent(evt);
      });
    };

    placeAutocomplete.addEventListener("gmp-placeselect", handleSelect);

    return () => {
      placeAutocomplete.removeEventListener("gmp-placeselect", handleSelect);
      container.innerHTML = "";
    };
  }, [setBookingData]);

  return (
    <motion.div
      key="step3"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <MapPin size={20} /> Where should we come?
      </h2>

      {/* ✅ Champ unique Google */}
      <div id="autocomplete-container" className="w-full"></div>

      {/* Notes */}
      <textarea
        rows="3"
        placeholder="Additional notes..."
        value={bookingData.notes}
        onChange={(e) =>
          setBookingData({ ...bookingData, notes: e.target.value })
        }
        className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
      />

      {/* Navigation */}
      <div className="flex justify-between pt-6">
        <button
          onClick={onPrev}
          className="px-5 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
        >
          <ArrowLeft size={18} className="inline mr-2" /> Previous
        </button>
        <button
          onClick={onNext}
          disabled={!bookingData.address || bookingData.address.trim() === ""}
          className="px-6 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition disabled:opacity-60"
        >
          Next <ArrowRight size={18} className="inline ml-2" />
        </button>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------
   STEP 4 – Recap
--------------------------------------------------------- */
function StepRecap({ bookingData, onPrev, onConfirm, loading }) {
  return (
    <motion.div
      key="step4"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
        <Clock size={20} /> Confirm your booking
      </h2>

      <div className="bg-gray-50 p-4 rounded-xl border space-y-2">
        <p>
          <strong>Services:</strong> {bookingData.services.join(", ")}
        </p>
        <p>
          <strong>Date:</strong> {bookingData.date}
        </p>
        <p>
          <strong>Time Slots:</strong> {bookingData.timeSlots.join(", ")}
        </p>
        <p>
          <strong>Address:</strong> {bookingData.address}
        </p>
        {bookingData.notes && (
          <p>
            <strong>Notes:</strong> {bookingData.notes}
          </p>
        )}
      </div>

      <div className="flex justify-between pt-6">
        <button
          onClick={onPrev}
          className="px-5 py-2 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-100 transition"
        >
          <ArrowLeft size={18} className="inline mr-2" /> Previous
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="px-6 py-2 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition disabled:opacity-60"
        >
          {loading ? "Saving..." : "Confirm Booking"}
        </button>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */
export default function DashboardNew({ isModal = false, onClose, onSuccess }) {
  const { session } = useUser();
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState({
    services: [],
    date: "",
    timeSlots: [],
    address: "",
    notes: "",
    latitude: null,
    longitude: null,
  });
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);

  /* 🧾 CONFIRM & SAVE BOOKING */
  const handleConfirm = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.from("bookings").insert([
        {
          id: uuid(),
          client_id: session?.user?.id,
          service: bookingData.services.join(", "),
          date: bookingData.date,
          time_slot: bookingData.timeSlots.join(", "),
          address: bookingData.address,
          notes: bookingData.notes,
          client_lat: bookingData.latitude || null,
          client_lng: bookingData.longitude || null,
          status: "pending",
        },
      ]);

      if (error) throw error;

      setToast({
        message: "✅ Booking created successfully!",
        type: "success",
      });

      if (onSuccess) onSuccess();
    } catch (err) {
      setToast({
        message: `❌ ${err.message}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const steps = {
    1: (
      <StepServices
        bookingData={bookingData}
        setBookingData={setBookingData}
        onNext={() => setStep(2)}
      />
    ),
    2: (
      <StepWhen
        bookingData={bookingData}
        setBookingData={setBookingData}
        onNext={() => setStep(3)}
        onPrev={() => setStep(1)}
      />
    ),
    3: (
      <StepAddress
        bookingData={bookingData}
        setBookingData={setBookingData}
        onNext={() => setStep(4)}
        onPrev={() => setStep(2)}
      />
    ),
    4: (
      <StepRecap
        bookingData={bookingData}
        onPrev={() => setStep(3)}
        onConfirm={handleConfirm}
        loading={loading}
      />
    ),
  };

  return (
    <motion.div
      className="max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-lg space-y-8 relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {isModal && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800"
        >
          <X size={22} />
        </button>
      )}

      {/* Stepper progress indicator */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Step {step} of 4</span>
          {step === 1 && <span>Select services</span>}
          {step === 2 && <span>Choose time</span>}
          {step === 3 && <span>Address & notes</span>}
          {step === 4 && <span>Review & confirm</span>}
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-rose-600 to-red-600"
            initial={{ width: 0 }}
            animate={{ width: `${(step / 4) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {steps[step]}

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </motion.div>
  );
}
