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
import { MapPin } from "lucide-react";
import Toast from "@/components/ui/Toast";

const libraries = ["places"];

export default function ProRadiusSettings() {
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const autocompleteRef = useRef(null);

  const [position, setPosition] = useState({ lat: 50.8503, lng: 4.3517 });
  const [radius, setRadius] = useState(20);

  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  // Charger la localisation depuis Supabase
  useEffect(() => {
    const loadLocation = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("users")
        .select("latitude, longitude, radius_km")
        .eq("id", user.id)
        .maybeSingle();

      if (error) console.error("❌ Supabase error:", error.message);

      if (data) {
        if (data.latitude && data.longitude)
          setPosition({ lat: data.latitude, lng: data.longitude });
        if (data.radius_km) setRadius(data.radius_km);
      }
    };

    loadLocation();
  }, [user?.id]);

  // 🔄 Sauvegarde automatique
  const autoSave = async (newPosition = position, newRadius = radius) => {
    if (!user?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({
        latitude: newPosition.lat,
        longitude: newPosition.lng,
        radius_km: newRadius,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);
    setSaving(false);

    if (error)
      setToast({ message: "❌ Error saving working area.", type: "error" });
    else
      setToast({
        message: "✅ Working area saved automatically!",
        type: "success",
      });
  };

  // Sélection d’adresse manuelle
  const handlePlaceChanged = () => {
    const place = autocompleteRef.current?.getPlace();
    if (place?.geometry?.location) {
      const newPos = {
        lat: place.geometry.location.lat(),
        lng: place.geometry.location.lng(),
      };
      setPosition(newPos);
      autoSave(newPos, radius);
    }
  };

  // Localisation actuelle
  const handleLocate = () => {
    if (!navigator.geolocation) {
      alert("❌ Geolocation not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const newPos = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        };
        setPosition(newPos);
        autoSave(newPos, radius);
      },
      () => alert("❌ Unable to retrieve your location.")
    );
  };

  // Mise à jour du rayon
  const handleRadiusChange = (e) => {
    const newRadius = parseInt(e.target.value);
    setRadius(newRadius);
    autoSave(position, newRadius);
  };

  if (loadError)
    return (
      <p className="text-red-500">❌ Google Maps error: {loadError.message}</p>
    );
  if (!isLoaded) return <p className="text-gray-500">⏳ Loading map...</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-800">Working Area</h3>
        {saving && (
          <span className="text-sm text-gray-500 animate-pulse">Saving...</span>
        )}
      </div>

      {/* Autocomplete */}
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

      {/* Radius slider */}
      <div className="flex items-center gap-4">
        <label className="text-sm text-gray-600 font-medium min-w-[120px]">
          Working radius:
        </label>
        <input
          type="range"
          min={1}
          max={200}
          value={radius}
          onChange={handleRadiusChange}
          className="w-full accent-rose-600 cursor-pointer"
        />
        <span className="text-sm font-semibold text-gray-700 w-12 text-right">
          {radius} km
        </span>
      </div>

      {/* Map */}
      <div className="w-full h-96 rounded-xl overflow-hidden border relative">
        <GoogleMap
          zoom={10}
          center={position}
          mapContainerStyle={{ width: "100%", height: "100%" }}
          onClick={(e) => {
            if (e.latLng) {
              const newPos = {
                lat: e.latLng.lat(),
                lng: e.latLng.lng(),
              };
              setPosition(newPos);
              autoSave(newPos, radius);
            }
          }}
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

        <button
          onClick={handleLocate}
          className="absolute bottom-3 left-3 bg-white border rounded-full shadow px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-100"
        >
          <MapPin size={16} className="text-rose-600" />
          Use my location
        </button>
      </div>

      {toast && <Toast {...toast} onClose={() => setToast(null)} />}
    </div>
  );
}
