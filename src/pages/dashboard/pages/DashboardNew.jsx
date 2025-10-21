import { useState, useEffect } from "react";
import { v4 as uuid } from "uuid";
import { supabase } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { X, ArrowLeft, ArrowRight, Calendar, Clock, MapPin, Search } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import { useNavigate } from "react-router-dom";

/* ---------------------------------------------------------
   STEP 1 – Services
--------------------------------------------------------- */
function StepServices({ bookingData, setBookingData, onNext }) {
  const serviceOptions = [
    {
      id: "Hair Stylist",
      label: "Hair Stylist",
      img: "https://images.unsplash.com/photo-1527799820374-dcf8d9d4a388?auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Barber",
      label: "Barber",
      img: "https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Makeup Artist",
      label: "Makeup Artist",
      img: "https://images.unsplash.com/photo-1583784561105-a674080f391e?auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Manicure",
      label: "Manicure",
      img: "https://images.unsplash.com/photo-1636019411401-82485711b6ba?auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Skincare",
      label: "Skincare",
      img: "https://images.unsplash.com/photo-1630398777649-cdfc7c5e8a24?auto=format&fit=crop&w=800&q=60",
    },
    {
      id: "Kids Makeup",
      label: "Kids Makeup",
      img: "https://images.unsplash.com/photo-1676918324432-f23552e80484?auto=format&fit=crop&w=800&q=60",
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
                className={`object-cover w-full h-36 group-hover:opacity-90 transition ${selected ? "opacity-80" : "opacity-100"}`}
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
        onChange={(e) => setBookingData({ ...bookingData, date: e.target.value })}
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
   STEP 3 – Address & Notes
--------------------------------------------------------- */
function StepAddress({ bookingData, setBookingData, onNext, onPrev }) {
  /* global google */
  useEffect(() => {
    if (!window.google?.maps?.places) return;
    const input = document.getElementById("autocomplete-input");
    if (!input) return;
    if (input.dataset.autocompleteAttached) return;
    input.dataset.autocompleteAttached = "true";

    const autocomplete = new google.maps.places.Autocomplete(input, {
      types: ["address"],
      componentRestrictions: { country: "be" },
      fields: ["formatted_address", "geometry"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      if (!place.geometry) return;
      const formatted = place.formatted_address;
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setBookingData((prev) => ({ ...prev, address: formatted, latitude: lat, longitude: lng }));
    });
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
      <input
        id="autocomplete-input"
        type="text"
        placeholder="Enter your address"
        defaultValue={bookingData.address}
        className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
      />
      <textarea
        rows="3"
        placeholder="Additional notes..."
        value={bookingData.notes}
        onChange={(e) => setBookingData({ ...bookingData, notes: e.target.value })}
        className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-rose-500 focus:outline-none"
      />
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
function StepRecap({ bookingData, onPrev, onConfirm, loading, isEdit }) {
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
        <Clock size={20} /> {isEdit ? "Confirm your updates" : "Confirm your booking"}
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
          {loading ? "Saving..." : isEdit ? "Save changes" : "Confirm Booking"}
        </button>
      </div>
    </motion.div>
  );
}

/* ---------------------------------------------------------
   MAIN COMPONENT
--------------------------------------------------------- */
export default function DashboardNew({ isModal = false, onClose, onSuccess, editBooking = null }) {
  const { session } = useUser();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState(
    editBooking
      ? {
          services: editBooking.service?.split(", ") || [],
          date: editBooking.date || "",
          timeSlots: editBooking.time_slot?.split(", ") || [],
          address: editBooking.address || "",
          notes: editBooking.notes || "",
          latitude: editBooking.client_lat || null,
          longitude: editBooking.client_lng || null,
        }
      : {
          services: [],
          date: "",
          timeSlots: [],
          address: "",
          notes: "",
          latitude: null,
          longitude: null,
        }
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  /* ✅ SAVE / UPDATE BOOKING + NOTIFY PROS */
  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setToast(null);

    try {
      const bookingId = uuid();
      const { data: bookingInsert, error: bookingError } = await supabase
        .from("bookings")
        .insert([
          {
            id: bookingId,
            client_id: session.user.id,
            service: bookingData.services.join(", "),
            date: bookingData.date,
            time_slot: bookingData.timeSlots.join(", "),
            address: bookingData.address,
            notes: bookingData.notes,
            client_lat: bookingData.latitude,
            client_lng: bookingData.longitude,
            status: "pending",
          },
        ])
        .select()
        .single();

      if (bookingError) throw bookingError;

      // Recherche pros compatibles
      const { data: pros } = await supabase
        .from("users")
        .select("id, latitude, longitude, business_type, radius_km");

      const distanceKm = (lat1, lon1, lat2, lon2) => {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLon = ((lon2 - lon1) * Math.PI) / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      };

      const matchingPros = pros.filter((p) => {
        if (!p.latitude || !p.longitude) return false;

        const dist = distanceKm(
          bookingData.latitude,
          bookingData.longitude,
          p.latitude,
          p.longitude
        );

        // 🔸 Normalise les chaînes pour comparer sans casse ni espaces parasites
        const clientServices = bookingData.services.map((s) => s.trim().toLowerCase());
        const proTypes = Array.isArray(p.business_type)
          ? p.business_type.map((s) => s.trim().toLowerCase())
          : p.business_type
            ? p.business_type.split(",").map((s) => s.trim().toLowerCase())
            : [];

        const offersService = proTypes.some((t) => clientServices.some((s) => t.includes(s)));

        // 🔸 élargis légèrement le rayon pour test (20 km par défaut)
        const isInRange = !p.latitude || !p.longitude || dist <= (p.radius_km || 20);

        return isInRange && offersService;
      });

      console.log("📋 Pros trouvés:", pros);
      console.log("✅ Pros correspondants:", matchingPros);

      if (matchingPros.length > 0) {
        const notifRows = matchingPros.map((p) => ({
          booking_id: bookingId,
          pro_id: p.id,
        }));
        await supabase.from("booking_notifications").insert(notifRows);
      }

      setToast({ message: "✅ Booking created & sent to nearby pros!", type: "success" });
      setTimeout(() => {
        if (onSuccess) onSuccess();
        if (isModal && onClose) onClose();
        navigate("/dashboard/reservations");
      }, 1500);
    } catch (err) {
      setToast({ message: `❌ ${err.message}`, type: "error" });
      setIsSubmitting(false);
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
        loading={isSubmitting}
        isEdit={!!editBooking}
      />
    ),
  };

  return (
    <motion.div
      className={`max-w-3xl mx-auto bg-white p-8 rounded-2xl shadow-lg space-y-8 relative ${isModal ? "fixed inset-0 z-50 overflow-y-auto" : ""}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {isModal && (
        <button
          onClick={onClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 text-gray-500 hover:text-gray-800 disabled:opacity-50"
        >
          <X size={22} />
        </button>
      )}
      {/* Stepper */}
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
          <span>Step {step} of 4</span>
          {step === 1 && <span>Select services</span>}
          {step === 2 && <span>Choose time</span>}
          {step === 3 && <span>Address & notes</span>}
          {step === 4 && <span>{editBooking ? "Review changes" : "Review & confirm"}</span>}
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
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </motion.div>
  );
}
