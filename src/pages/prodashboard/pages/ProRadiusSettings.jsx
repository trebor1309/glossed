import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import {
  GoogleMap,
  Marker,
  Circle,
  useLoadScript,
  Autocomplete,
} from "@react-google-maps/api";
import { Loader, Save, MapPin } from "lucide-react";
import Toast from "@/components/ui/Toast";

const libraries = ["places"];

export default function ProRadiusSettings() {
  const { session } = useUser();
  const [position, setPosition] = useState({ lat: 50.8503, lng: 4.3517 });
  const [radius, setRadius] = useState(20);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const autocompleteRef = useRef(null);
  const [toast, setToast] = useState(null);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  // ✅ Fix rechargement infini
  useEffect(() => {
    let isMounted = true;

    const fetchLocation = async () => {
      if (!session?.user?.id || !isMounted) return;

      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("latitude, longitude, radius_km")
        .eq("id", session.user.id)
        .single();

      if (isMounted && !error && data) {
        if (data.latitude && data.longitude)
          setPosition({ lat: data.latitude, lng: data.longitude });
        if (data.radius_km) setRadius(data.radius_km);
      }
      if (isMounted) setLoading(false);
    };

    const timer = setTimeout(fetchLocation, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [session?.user?.id]);

  // 📍 Sélection d’adresse manuelle
  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (place?.geometry?.location) {
      setPosition({
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      });
    }
  };

  // 📡 Localisation navigateur
  const handleLocate = () => {
    if (!navigator.geolocation) {
      alert("❌ Geolocation not supported by your browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
        setLocating(false);
      },
      () => {
        alert("❌ Unable to retrieve your location.");
        setLocating(false);
      }
    );
  };

  // 💾 Sauvegarde Supabase
  const handleSave = async () => {
    if (!session?.user?.id) return;
    setSaving(true);

    const { error } = await supabase
      .from("users")
      .update({
        latitude: position.lat,
        longitude: position.lng,
        radius_km: radius,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.user.id);

    setSaving(false);
    if (error)
      setToast({ message: "❌ Error saving your area.", type: "error" });
    else setToast({ message: "✅ Area saved successfully!", type: "success" });
  };

  if (loadError)
    return (
      <p className="text-red-500">❌ Google Maps error: {loadError.message}</p>
    );
  if (!isLoaded)
    return <p className="text-gray-500">⏳ Loading Google Maps...</p>;

  return (
    <div className="space-y-4">
      <Autocomplete
        onLoad={(ref) => (autocompleteRef.current = ref)}
        onPlaceChanged={handlePlaceChanged}
      >
        <input
          type="text"
          placeholder="Enter your main working location..."
          className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-rose-500 focus:outline-none"
        />
      </Autocomplete>

      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-600 font-medium min-w-[120px]">
          Working radius:
        </label>
        <input
          type="range"
          min={1}
          max={200}
          value={radius}
          onChange={(e) => setRadius(parseInt(e.target.value))}
          className="w-full accent-rose-600 cursor-pointer"
        />
        <span className="text-sm font-semibold text-gray-700 w-12 text-right">
          {radius} km
        </span>
      </div>

      <div className="w-full h-96 rounded-xl overflow-hidden border relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-10">
            <Loader className="animate-spin text-rose-500" size={28} />
          </div>
        )}

        <GoogleMap
          zoom={10}
          center={position}
          mapContainerStyle={{ width: "100%", height: "100%" }}
        >
          <Marker position={position} />
          <Circle
            center={position}
            radius={radius * 1000}
            options={{
              strokeColor: "#fb7185",
              fillColor: "#fda4af55",
              strokeWeight: 1.5,
            }}
          />
        </GoogleMap>
      </div>

      <div className="flex justify-between items-center">
        <button
          onClick={handleLocate}
          disabled={locating}
          className="px-4 py-2 border rounded-full flex items-center gap-2 text-gray-700 hover:bg-gray-50 transition disabled:opacity-60"
        >
          <MapPin size={18} className="text-rose-600" />
          {locating ? "Locating..." : "Use my location"}
        </button>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 text-white rounded-full font-semibold hover:scale-[1.02] transition-transform flex items-center gap-2 disabled:opacity-70"
        >
          <Save size={18} />
          {saving ? "Saving..." : "Save Area"}
        </button>
      </div>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
