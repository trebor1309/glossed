// 📄 src/pages/prodashboard/pages/settings/WorkingArea.jsx
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import Toast from "@/components/ui/Toast";

import { GoogleMap, Marker, Circle, useLoadScript, Autocomplete } from "@react-google-maps/api";
import { Edit2, Save, MapPin, Globe } from "lucide-react";

const libraries = ["places"];

export default function WorkingArea() {
  const { user } = useUser();

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  const [form, setForm] = useState({
    business_address: "",
    latitude: 50.8503,
    longitude: 4.3517,
    radius_km: 20,
    mobile_service: true,
    studio_service: false,
    private_service: false,
  });

  const autocompleteRef = useRef(null);

  /* ------------------------------------------------------------------
     LOAD MAPS SCRIPT
  ------------------------------------------------------------------ */
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  /* ------------------------------------------------------------------
     LOAD DATA
  ------------------------------------------------------------------ */
  useEffect(() => {
    if (!user?.id) return;

    (async () => {
      const { data, error } = await supabase
        .from("users")
        .select(
          "business_address, latitude, longitude, radius_km, mobile_service, studio_service, private_service"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (error) return console.error(error);

      if (data) {
        setForm({
          business_address: data.business_address || "",
          latitude: data.latitude ?? 50.8503,
          longitude: data.longitude ?? 4.3517,
          radius_km: data.radius_km || 20,
          mobile_service: !!data.mobile_service,
          studio_service: !!data.studio_service,
          private_service: !!data.private_service,
        });
      }
    })();
  }, [user?.id]);

  /* ------------------------------------------------------------------
     AUTOCOMPLETE
  ------------------------------------------------------------------ */
  const handlePlaceChanged = () => {
    const place = autocompleteRef.current.getPlace();
    if (!place || !place.geometry) return;

    const lat = place.geometry.location.lat();
    const lng = place.geometry.location.lng();

    setForm((prev) => ({
      ...prev,
      business_address: place.formatted_address,
      latitude: lat,
      longitude: lng,
    }));
  };

  /* ------------------------------------------------------------------
     SAVE
  ------------------------------------------------------------------ */
  const handleSave = async () => {
    setSaving(true);

    const payload = {
      business_address: form.business_address,
      latitude: form.latitude,
      longitude: form.longitude,
      radius_km: form.radius_km,
      mobile_service: form.mobile_service,
      studio_service: form.studio_service,
      private_service: form.private_service,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("users").update(payload).eq("id", user.id);

    setSaving(false);

    if (error) {
      setToast({ type: "error", message: "Error saving working area." });
      return;
    }

    setEditing(false);
    setToast({ type: "success", message: "Working area updated!" });
  };

  /* ------------------------------------------------------------------
     UI RENDERING
  ------------------------------------------------------------------ */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Working Area</h3>

        <button
          onClick={() => (editing ? handleSave() : setEditing(true))}
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-medium transition
            ${
              editing
                ? "bg-gradient-to-r from-rose-600 to-red-600 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          disabled={saving}
        >
          {editing ? <Save size={16} /> : <Edit2 size={16} />}
          {editing ? "Save" : "Modify"}
        </button>
      </div>

      {/* READ MODE */}
      {!editing ? (
        <div className="space-y-4">
          <Item label="Business address" value={form.business_address} />
          <Item label="Working radius" value={`${form.radius_km} km`} />
          <Item
            label="Services offered"
            value={[
              form.mobile_service && "Mobile",
              form.studio_service && "Studio",
              form.private_service && "Private Home",
            ]
              .filter(Boolean)
              .join(", ")}
          />

          {/* Map */}
          {isLoaded && (
            <div className="rounded-xl overflow-hidden border">
              <GoogleMap
                zoom={10}
                center={{ lat: form.latitude, lng: form.longitude }}
                mapContainerStyle={{ width: "100%", height: "300px" }}
              >
                <Marker position={{ lat: form.latitude, lng: form.longitude }} />
                <Circle
                  center={{ lat: form.latitude, lng: form.longitude }}
                  radius={form.radius_km * 1000}
                  options={{
                    strokeColor: "#fb7185",
                    fillColor: "#fda4af55",
                    strokeWeight: 1.5,
                  }}
                />
              </GoogleMap>
            </div>
          )}
        </div>
      ) : (
        /* EDIT MODE */
        <div className="space-y-6">
          {/* Address */}
          <div>
            <label className="font-medium text-sm mb-1 flex gap-2 items-center text-gray-700">
              <MapPin size={16} className="text-rose-600" /> Business Address
            </label>

            {isLoaded && (
              <Autocomplete
                onLoad={(ref) => (autocompleteRef.current = ref)}
                onPlaceChanged={handlePlaceChanged}
              >
                <input
                  type="text"
                  className="w-full px-4 py-2 border rounded-lg"
                  defaultValue={form.business_address}
                />
              </Autocomplete>
            )}
          </div>
          {/* Service Types */}
          <div className="space-y-3">
            <p className="font-medium text-sm text-gray-700">Services offered</p>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.mobile_service}
                onChange={(e) => setForm((p) => ({ ...p, mobile_service: e.target.checked }))}
                className="accent-rose-600"
              />
              Mobile service (at client’s place)
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.studio_service}
                onChange={(e) => setForm((p) => ({ ...p, studio_service: e.target.checked }))}
                className="accent-rose-600"
              />
              Studio / salon
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.private_service}
                onChange={(e) => setForm((p) => ({ ...p, private_service: e.target.checked }))}
                className="accent-rose-600"
              />
              Private home location
            </label>
          </div>

          {/* Radius */}
          <div>
            <label className="font-medium text-sm mb-1 flex gap-2 items-center text-gray-700">
              <Globe size={16} className="text-rose-600" /> Working Radius
            </label>

            <input
              type="range"
              min={1}
              max={200}
              value={form.radius_km}
              onChange={(e) => setForm((p) => ({ ...p, radius_km: Number(e.target.value) }))}
              className="w-full"
            />
            <p className="text-gray-500 text-sm">{form.radius_km} km</p>
          </div>

          {/* Map preview (live) */}
          {isLoaded && (
            <div className="rounded-xl overflow-hidden border">
              <GoogleMap
                zoom={10}
                center={{ lat: form.latitude, lng: form.longitude }}
                mapContainerStyle={{ width: "100%", height: "300px" }}
                onClick={(e) =>
                  setForm((p) => ({
                    ...p,
                    latitude: e.latLng.lat(),
                    longitude: e.latLng.lng(),
                  }))
                }
              >
                <Marker position={{ lat: form.latitude, lng: form.longitude }} />
                <Circle
                  center={{ lat: form.latitude, lng: form.longitude }}
                  radius={form.radius_km * 1000}
                  options={{
                    strokeColor: "#fb7185",
                    fillColor: "#fda4af55",
                    strokeWeight: 1.5,
                  }}
                />
              </GoogleMap>
            </div>
          )}
        </div>
      )}

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      <p className="text-gray-600">{value || "—"}</p>
    </div>
  );
}
