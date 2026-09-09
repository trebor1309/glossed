import { useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight, Calendar, Clock, MapPin, Search, X } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AddressAutocomplete from "@/components/forms/AddressAutocomplete";
import Toast from "@/components/ui/Toast";
import { useUser } from "@/context/UserContext";
import {
  loadServiceCategories,
  profileServiceCodes,
  serviceLabel,
  targetedBookingErrorMessage,
} from "@/lib/providerDiscovery";
import {
  createMyUserAddress,
  listMyUserAddresses,
  savedAddressErrorMessage,
} from "@/lib/userAddresses";
import { supabase } from "@/lib/supabaseClient";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function StepServices({
  bookingData,
  setBookingData,
  onNext,
  categories,
  categoriesLoading,
  targetedServiceCodes,
}) {
  const options = targetedServiceCodes
    ? categories.filter((category) => targetedServiceCodes.includes(category.code))
    : categories;

  const toggleService = (serviceCode) => {
    setBookingData((previous) => ({
      ...previous,
      services: previous.services.includes(serviceCode)
        ? previous.services.filter((code) => code !== serviceCode)
        : [...previous.services, serviceCode],
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
      <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
        <Search size={20} /> Which service(s) would you like to book?
      </h2>

      {categoriesLoading ? (
        <div role="status" className="rounded-xl bg-gray-50 p-6 text-center text-gray-600">
          Loading services…
        </div>
      ) : options.length === 0 ? (
        <div role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
          This professional has no service available for a new request right now.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {options.map((option) => {
            const selected = bookingData.services.includes(option.code);
            return (
              <button
                type="button"
                key={option.code}
                onClick={() => toggleService(option.code)}
                aria-pressed={selected}
                className={`min-h-24 rounded-2xl border-2 p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-rose-300 ${
                  selected
                    ? "border-rose-500 bg-rose-50 text-rose-800 shadow-sm"
                    : "border-gray-200 bg-white text-gray-800 hover:border-rose-200"
                }`}
              >
                <span className="block font-semibold">{option.fallback_label}</span>
                <span className="mt-1 block text-xs text-gray-500">
                  Personalized service request
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-end pt-6">
        <button
          type="button"
          onClick={onNext}
          disabled={bookingData.services.length === 0}
          className="rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-6 py-2 font-semibold text-white transition hover:scale-[1.02] disabled:opacity-60"
        >
          Next <ArrowRight size={18} className="ml-2 inline" />
        </button>
      </div>
    </motion.div>
  );
}

function StepWhen({ bookingData, setBookingData, onNext, onPrev }) {
  const timeSlotOptions = [
    "Morning (8–12)",
    "Noon (12–14)",
    "Afternoon (13–18)",
    "Evening (17–19)",
  ];

  const toggleTimeSlot = (slot) => {
    setBookingData((previous) => ({
      ...previous,
      timeSlots: previous.timeSlots.includes(slot)
        ? previous.timeSlots.filter((value) => value !== slot)
        : [...previous.timeSlots, slot],
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
      <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
        <Calendar size={20} /> When would you like the service?
      </h2>

      <input
        aria-label="Requested date"
        type="date"
        min={new Date().toISOString().slice(0, 10)}
        value={bookingData.date}
        onChange={(event) => setBookingData({ ...bookingData, date: event.target.value })}
        className="w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {timeSlotOptions.map((slot) => (
          <button
            type="button"
            key={slot}
            onClick={() => toggleTimeSlot(slot)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              bookingData.timeSlots.includes(slot)
                ? "border-rose-500 bg-rose-100"
                : "border-gray-300"
            }`}
          >
            {slot}
          </button>
        ))}
      </div>

      <StepButtons
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled={!bookingData.date || bookingData.timeSlots.length === 0}
      />
    </motion.div>
  );
}

function StepAddress({
  bookingData,
  setBookingData,
  onNext,
  onPrev,
  savedAddresses,
  addressesLoading,
  selectedAddressId,
  onSelectSaved,
  usingCustomAddress,
  onSelectCustom,
  saveCustomAddress,
  setSaveCustomAddress,
  customAddressLabel,
  setCustomAddressLabel,
  savingAddress,
  onManageAddresses,
}) {
  const hasCoordinates = bookingData.latitude != null && bookingData.longitude != null;

  return (
    <motion.div
      key="step3"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
        <MapPin size={20} /> Where should we come?
      </h2>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">Service address</legend>
        {addressesLoading ? (
          <p role="status" className="rounded-xl bg-gray-50 p-3 text-sm text-gray-500">
            Loading saved addresses…
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {savedAddresses.map((address) => (
              <label
                key={address.id}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
                  selectedAddressId === address.id && !usingCustomAddress
                    ? "border-rose-500 bg-rose-50"
                    : "border-gray-200"
                }`}
              >
                <input
                  type="radio"
                  name="service-address-choice"
                  checked={selectedAddressId === address.id && !usingCustomAddress}
                  onChange={() => onSelectSaved(address)}
                  className="mt-1 accent-rose-600"
                />
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-800">
                    {address.label}
                    {address.is_default ? " — Default" : ""}
                  </span>
                  <span className="block break-words text-sm text-gray-600">
                    {address.formatted_address}
                  </span>
                </span>
              </label>
            ))}
            <label
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                usingCustomAddress ? "border-rose-500 bg-rose-50" : "border-gray-200"
              }`}
            >
              <input
                type="radio"
                name="service-address-choice"
                checked={usingCustomAddress}
                onChange={onSelectCustom}
                className="accent-rose-600"
              />
              <span className="font-semibold text-gray-800">Other address</span>
            </label>
          </div>
        )}
      </fieldset>

      {usingCustomAddress && (
        <div className="space-y-3 rounded-xl border border-gray-200 p-4">
          <AddressAutocomplete
            inputId="booking-address"
            label="New address"
            placeholder="Enter your address"
            defaultValue={bookingData.address}
            required
            types={["address"]}
            onInputChange={(address) =>
              setBookingData((previous) => ({
                ...previous,
                address,
                city: null,
                postalCode: null,
                countryCode: null,
                latitude: null,
                longitude: null,
              }))
            }
            onSelect={(place) =>
              setBookingData((previous) => ({
                ...previous,
                address: place.address,
                city: place.city,
                postalCode: place.postal_code,
                countryCode: place.country_code,
                latitude: place.latitude,
                longitude: place.longitude,
              }))
            }
          />
          {!hasCoordinates && bookingData.address && (
            <p className="text-sm text-amber-700">
              Choose the address from the suggestions to continue.
            </p>
          )}
          {hasCoordinates && (
            <>
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={saveCustomAddress}
                  onChange={(event) => setSaveCustomAddress(event.target.checked)}
                  className="mt-1 accent-rose-600"
                />
                Save this address for later
              </label>
              {saveCustomAddress && (
                <label className="block text-sm font-medium text-gray-700">
                  Address label
                  <input
                    value={customAddressLabel}
                    onChange={(event) => setCustomAddressLabel(event.target.value)}
                    maxLength={50}
                    list="booking-address-labels"
                    placeholder="Home or Work"
                    required
                    className="mt-1 w-full rounded-lg border px-3 py-2 focus:ring-2 focus:ring-rose-300"
                  />
                  <datalist id="booking-address-labels">
                    <option value="Home" />
                    <option value="Work" />
                  </datalist>
                </label>
              )}
            </>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onManageAddresses}
        className="text-sm font-medium text-rose-700 underline-offset-2 hover:underline"
      >
        Manage my saved addresses
      </button>

      <label className="block text-sm font-medium text-gray-700">
        Tell the professional what you need
        <textarea
          rows="4"
          placeholder="Additional notes..."
          value={bookingData.notes}
          onChange={(event) => setBookingData({ ...bookingData, notes: event.target.value })}
          className="mt-1 w-full rounded-lg border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-rose-500"
        />
      </label>

      <StepButtons
        onPrev={onPrev}
        onNext={onNext}
        nextDisabled={
          savingAddress ||
          !bookingData.address ||
          !hasCoordinates ||
          (usingCustomAddress && saveCustomAddress && !customAddressLabel.trim())
        }
        nextLoading={savingAddress}
      />
    </motion.div>
  );
}

function StepButtons({ onPrev, onNext, nextDisabled, nextLoading = false }) {
  return (
    <div className="flex justify-between gap-3 pt-6">
      <button
        type="button"
        onClick={onPrev}
        className="rounded-full border border-gray-300 px-5 py-2 text-gray-600 transition hover:bg-gray-100"
      >
        <ArrowLeft size={18} className="mr-2 inline" /> Previous
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled}
        className="rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-6 py-2 font-semibold text-white transition hover:scale-[1.02] disabled:opacity-60"
      >
        {nextLoading ? "Saving…" : "Next"} <ArrowRight size={18} className="ml-2 inline" />
      </button>
    </div>
  );
}

function StepRecap({ bookingData, categories, onPrev, onConfirm, loading, targetedPro }) {
  return (
    <motion.div
      key="step4"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ duration: 0.25 }}
      className="space-y-6"
    >
      <h2 className="flex items-center gap-2 text-2xl font-bold text-gray-800">
        <Clock size={20} /> Confirm your request
      </h2>

      <div className="space-y-2 rounded-xl border bg-gray-50 p-4 text-sm sm:text-base">
        {targetedPro && (
          <p>
            <strong>Professional:</strong>{" "}
            {targetedPro.business_name || targetedPro.username || "Glossed professional"}
          </p>
        )}
        <p>
          <strong>Services:</strong>{" "}
          {bookingData.services.map((code) => serviceLabel(categories, code)).join(", ")}
        </p>
        <p>
          <strong>Date:</strong> {bookingData.date}
        </p>
        <p>
          <strong>Time slots:</strong> {bookingData.timeSlots.join(", ")}
        </p>
        <p className="break-words">
          <strong>Address:</strong> {bookingData.address}
        </p>
        {bookingData.notes && (
          <p className="break-words">
            <strong>Notes:</strong> {bookingData.notes}
          </p>
        )}
      </div>

      <div className="flex justify-between gap-3 pt-6">
        <button
          type="button"
          onClick={onPrev}
          disabled={loading}
          className="rounded-full border border-gray-300 px-5 py-2 text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
        >
          <ArrowLeft size={18} className="mr-2 inline" /> Previous
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-full bg-gradient-to-r from-rose-600 to-red-600 px-6 py-2 font-semibold text-white transition hover:scale-[1.02] disabled:opacity-60"
        >
          {loading ? "Sending…" : "Send request"}
        </button>
      </div>
    </motion.div>
  );
}

function parseEditServices(service, categories) {
  const values = (service || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return categories
    .filter(
      (category) =>
        values.includes(category.code.toLowerCase()) ||
        values.includes(category.fallback_label.toLowerCase())
    )
    .map((category) => category.code);
}

export default function DashboardNew({ isModal = false, editBooking = null, onClose, onSuccess }) {
  const { session, user, isPro } = useUser();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const targetedProId = searchParams.get("pro");
  const requestedServiceCode = searchParams.get("service");
  const suppliedOperationId = searchParams.get("operation");
  const operationIdRef = useRef(
    suppliedOperationId && uuidPattern.test(suppliedOperationId) ? suppliedOperationId : uuid()
  );
  const requestedServicePrefilledRef = useRef(false);
  const addressOperationIdRef = useRef(uuid());
  const attemptedAddressPayloadRef = useRef(null);

  const [targetedPro, setTargetedPro] = useState(null);
  const [targetedProLoading, setTargetedProLoading] = useState(Boolean(targetedProId));
  const [targetedProError, setTargetedProError] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [selectedAddressId, setSelectedAddressId] = useState(null);
  const [usingCustomAddress, setUsingCustomAddress] = useState(Boolean(editBooking));
  const [saveCustomAddress, setSaveCustomAddress] = useState(false);
  const [customAddressLabel, setCustomAddressLabel] = useState("Home");
  const [savingAddress, setSavingAddress] = useState(false);
  const [step, setStep] = useState(1);
  const [bookingData, setBookingData] = useState(() => ({
    services: [],
    date: editBooking?.date || "",
    timeSlots: editBooking?.time_slot
      ? editBooking.time_slot
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : [],
    address: editBooking?.address || "",
    city: null,
    postalCode: null,
    countryCode: null,
    notes: editBooking?.notes || "",
    latitude: editBooking?.client_lat ?? null,
    longitude: editBooking?.client_lng ?? null,
  }));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!targetedProId || searchParams.get("operation") === operationIdRef.current) return;
    const next = new URLSearchParams(searchParams);
    next.set("operation", operationIdRef.current);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, targetedProId]);

  useEffect(() => {
    let active = true;
    loadServiceCategories()
      .then((rows) => {
        if (!active) return;
        setCategories(rows);
        if (editBooking?.service) {
          setBookingData((previous) => ({
            ...previous,
            services: parseEditServices(editBooking.service, rows),
          }));
        }
      })
      .catch((error) => {
        if (active) setToast({ type: "error", message: error.message });
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editBooking?.service]);

  useEffect(() => {
    if (!targetedProId) return;
    let active = true;
    setTargetedProLoading(true);
    supabase
      .rpc("get_public_profile", { p_user_id: targetedProId })
      .then(({ data, error }) => {
        if (!active) return;
        const profile = data?.[0] || null;
        if (error || !profile || profile.role !== "pro") {
          setTargetedProError("This professional profile is no longer available.");
          return;
        }
        setTargetedPro(profile);
      })
      .finally(() => {
        if (active) setTargetedProLoading(false);
      });
    return () => {
      active = false;
    };
  }, [targetedProId]);

  const targetedServiceCodes = useMemo(
    () => (targetedPro ? profileServiceCodes(targetedPro, categories) : null),
    [categories, targetedPro]
  );

  useEffect(() => {
    if (
      requestedServiceCode &&
      targetedServiceCodes?.includes(requestedServiceCode) &&
      bookingData.services.length === 0 &&
      !requestedServicePrefilledRef.current
    ) {
      requestedServicePrefilledRef.current = true;
      setBookingData((previous) => ({ ...previous, services: [requestedServiceCode] }));
    }
  }, [bookingData.services.length, requestedServiceCode, targetedServiceCodes]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    setAddressesLoading(true);
    listMyUserAddresses()
      .then((rows) => {
        if (!active) return;
        setSavedAddresses(rows);

        if (editBooking) {
          const matching = rows.find(
            (address) =>
              address.formatted_address === editBooking.address &&
              Number(address.latitude) === Number(editBooking.client_lat) &&
              Number(address.longitude) === Number(editBooking.client_lng)
          );
          if (matching) {
            setSelectedAddressId(matching.id);
            setUsingCustomAddress(false);
          } else {
            setSelectedAddressId(null);
            setUsingCustomAddress(true);
          }
          return;
        }

        const defaultAddress = rows.find((address) => address.is_default) || rows[0];
        if (defaultAddress) {
          setSelectedAddressId(defaultAddress.id);
          setUsingCustomAddress(false);
          setBookingData((previous) => ({
            ...previous,
            address: defaultAddress.formatted_address,
            city: defaultAddress.city,
            postalCode: defaultAddress.postal_code,
            countryCode: defaultAddress.country_code,
            latitude: defaultAddress.latitude,
            longitude: defaultAddress.longitude,
          }));
        } else {
          setUsingCustomAddress(true);
        }
      })
      .catch((error) => {
        if (!active) return;
        setUsingCustomAddress(true);
        setToast({ type: "error", message: savedAddressErrorMessage(error) });
      })
      .finally(() => {
        if (active) setAddressesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [editBooking, user?.id]);

  const selectSavedAddress = (address) => {
    setSelectedAddressId(address.id);
    setUsingCustomAddress(false);
    setSaveCustomAddress(false);
    setBookingData((previous) => ({
      ...previous,
      address: address.formatted_address,
      city: address.city,
      postalCode: address.postal_code,
      countryCode: address.country_code,
      latitude: address.latitude,
      longitude: address.longitude,
    }));
  };

  const selectCustomAddress = () => {
    if (!usingCustomAddress) {
      setBookingData((previous) => ({
        ...previous,
        address: "",
        city: null,
        postalCode: null,
        countryCode: null,
        latitude: null,
        longitude: null,
      }));
    }
    setSelectedAddressId(null);
    setUsingCustomAddress(true);
  };

  const continueFromAddress = async () => {
    if (!usingCustomAddress || !saveCustomAddress) {
      setStep(4);
      return;
    }

    const addressPayload = {
      label: customAddressLabel.trim(),
      formatted_address: bookingData.address,
      city: bookingData.city,
      postal_code: bookingData.postalCode,
      country_code: bookingData.countryCode,
      latitude: bookingData.latitude,
      longitude: bookingData.longitude,
    };
    const fingerprint = JSON.stringify(addressPayload);
    if (attemptedAddressPayloadRef.current && attemptedAddressPayloadRef.current !== fingerprint) {
      addressOperationIdRef.current = uuid();
    }
    attemptedAddressPayloadRef.current = fingerprint;

    setSavingAddress(true);
    setToast(null);
    try {
      await createMyUserAddress(addressOperationIdRef.current, addressPayload);
      setStep(4);
    } catch (error) {
      setToast({ type: "error", message: savedAddressErrorMessage(error) });
    } finally {
      setSavingAddress(false);
    }
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setToast(null);

    try {
      const serviceLabels = bookingData.services.map((code) => serviceLabel(categories, code));

      if (editBooking) {
        const { error } = await supabase
          .from("bookings")
          .update({
            service: serviceLabels.join(", "),
            date: bookingData.date,
            time_slot: bookingData.timeSlots.join(", "),
            address: bookingData.address,
            notes: bookingData.notes,
            client_lat: bookingData.latitude,
            client_lng: bookingData.longitude,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editBooking.id)
          .eq("client_id", session.user.id)
          .eq("status", "pending")
          .select("id")
          .single();
        if (error) throw error;
        setToast({ message: "Booking updated!", type: "success" });
        setTimeout(() => onSuccess?.(), 600);
        return;
      }

      if (targetedProId) {
        if (!targetedPro) throw new Error(targetedProError || "Professional profile unavailable.");
        const { error } = await supabase.rpc("create_targeted_booking_request", {
          p_operation_id: operationIdRef.current,
          p_provider_id: targetedProId,
          p_service_codes: bookingData.services,
          p_date: bookingData.date,
          p_time_slot: bookingData.timeSlots.join(", "),
          p_address: bookingData.address,
          p_notes: bookingData.notes || null,
          p_client_latitude: bookingData.latitude,
          p_client_longitude: bookingData.longitude,
        });
        if (error) throw error;

        setToast({
          message: `Request sent to ${targetedPro.business_name || targetedPro.username}!`,
          type: "success",
        });
        setTimeout(() => navigate("/dashboard/reservations"), 900);
        return;
      }

      const bookingId = uuid();
      const { error: bookingError } = await supabase.from("bookings").insert([
        {
          id: bookingId,
          client_id: session.user.id,
          service: serviceLabels.join(", "),
          date: bookingData.date,
          time_slot: bookingData.timeSlots.join(", "),
          address: bookingData.address,
          notes: bookingData.notes,
          client_lat: bookingData.latitude,
          client_lng: bookingData.longitude,
          status: "pending",
        },
      ]);
      if (bookingError) throw bookingError;

      const { data: matchingPros, error: prosError } = await supabase.rpc("find_matching_pro_ids", {
        p_services: bookingData.services,
        p_client_lat: bookingData.latitude,
        p_client_lng: bookingData.longitude,
      });
      if (prosError) throw prosError;

      if (matchingPros?.length > 0) {
        const { error: notificationError } = await supabase.from("booking_notifications").insert(
          matchingPros.map((professional) => ({
            booking_id: bookingId,
            pro_id: professional.id,
          }))
        );
        if (notificationError) throw notificationError;
      }

      setToast({ message: "Booking created and sent to nearby professionals!", type: "success" });
      setTimeout(() => navigate("/dashboard/reservations"), 900);
    } catch (error) {
      console.error("handleConfirm error:", error);
      setToast({
        message: targetedProId ? targetedBookingErrorMessage(error) : error.message,
        type: "error",
      });
      setIsSubmitting(false);
    }
  };

  if (targetedProLoading) {
    return (
      <div role="status" className="p-8 text-center text-gray-600">
        Loading professional…
      </div>
    );
  }

  if (targetedProError) {
    return (
      <div
        role="alert"
        className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center"
      >
        <p className="font-medium text-amber-900">{targetedProError}</p>
        <button
          type="button"
          onClick={() => navigate("/dashboard/discover")}
          className="mt-4 rounded-full bg-rose-600 px-5 py-2 text-sm font-semibold text-white"
        >
          Find another professional
        </button>
      </div>
    );
  }

  return (
    <motion.div
      className={`relative mx-auto w-full max-w-3xl space-y-8 rounded-2xl bg-white p-4 shadow-lg sm:p-8 ${
        isModal ? "fixed inset-0 z-50 overflow-y-auto" : ""
      }`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {isModal && (
        <button
          type="button"
          onClick={onClose}
          disabled={isSubmitting}
          aria-label="Close"
          className="absolute right-4 top-4 text-gray-500 hover:text-gray-800 disabled:opacity-50"
        >
          <X size={22} />
        </button>
      )}

      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-sm text-gray-600">
          <span>Step {step} of 4</span>
          {step === 1 && <span>Select services</span>}
          {step === 2 && <span>Choose time</span>}
          {step === 3 && <span>Address & notes</span>}
          {step === 4 && <span>Review & confirm</span>}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <motion.div
            className="h-full bg-gradient-to-r from-rose-600 to-red-600"
            initial={{ width: 0 }}
            animate={{ width: `${(step / 4) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {step === 1 && (
        <StepServices
          bookingData={bookingData}
          setBookingData={setBookingData}
          categories={categories}
          categoriesLoading={categoriesLoading}
          targetedServiceCodes={targetedServiceCodes}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && (
        <StepWhen
          bookingData={bookingData}
          setBookingData={setBookingData}
          onNext={() => setStep(3)}
          onPrev={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <StepAddress
          bookingData={bookingData}
          setBookingData={setBookingData}
          onNext={continueFromAddress}
          onPrev={() => setStep(2)}
          savedAddresses={savedAddresses}
          addressesLoading={addressesLoading}
          selectedAddressId={selectedAddressId}
          onSelectSaved={selectSavedAddress}
          usingCustomAddress={usingCustomAddress}
          onSelectCustom={selectCustomAddress}
          saveCustomAddress={saveCustomAddress}
          setSaveCustomAddress={setSaveCustomAddress}
          customAddressLabel={customAddressLabel}
          setCustomAddressLabel={setCustomAddressLabel}
          savingAddress={savingAddress}
          onManageAddresses={() =>
            navigate(`${isPro ? "/prodashboard" : "/dashboard"}/settings#saved-addresses`)
          }
        />
      )}
      {step === 4 && (
        <StepRecap
          bookingData={bookingData}
          categories={categories}
          targetedPro={targetedPro}
          onPrev={() => setStep(3)}
          onConfirm={handleConfirm}
          loading={isSubmitting}
        />
      )}

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </motion.div>
  );
}
