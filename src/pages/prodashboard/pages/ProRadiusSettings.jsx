import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useUser } from "@/context/UserContext";
import { Loader } from "lucide-react";

// Google Maps
import { GoogleMap, Marker, Circle, useLoadScript } from "@react-google-maps/api";

export default function ProRadiusSettings() {
  const { session } = useUser();
  const [radius, setRadius] = useState(20);
  const [position, setPosition] = useState({ lat: 50.8503, lng: 4.3517 }); // Par défaut: Bruxelles
  const [loading, setLoading] = useState(false);

  // Charger Google Maps API
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries: ["places"],
  });

  // Charger les infos du pro depuis Supabase
  useEffect(() => {
    const fetchProfile = async () => {
      if (!session?.user) return;
      setLoading(true);
      const { data, error } = await supabase
        .from("users")
        .select("latitude, longitude, radius_km")
        .eq("id", session.user.id)
        .single();

      if (!error && data) {
        setPosition({
          lat: data.latitude || 50.8503,
          lng: data.longitude || 4.3517,
        });
        setRadius(data.radius_km || 20);
      }
      setLoading(false);
    };
    fetchProfile();
  }, [session]);

  // Détecter la position actuelle via le navigateur
  const handleLocate = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setPosition({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
        },
        (err) => console.error("Erreur de géoloc :", err)
      );
    }
  };

  // Sauvegarde Supabase
  const handleSave = async () => {
    if (!session?.user) return;
    setLoading(true);
    const { error } = await supabase
      .from("users")
      .update({
        latitude: position.lat,
        longitude: position.lng,
        radius_km: radius,
      })
      .eq("id", session.user.id);

    setLoading(false);
    if (error) alert("Erreur lors de l'enregistrement 😕");
    else alert("Zone d'activité mise à jour ✅");
  };

  if (!isLoaded)
    return (
      <div className="flex justify-center items-center h-64">
        <Loader className="animate-spin w-6 h-6 text-gray-500" />
      </div>
    );

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">Zone d’activité</h2>
      <p className="text-gray-600">
        Définissez votre position et le rayon dans lequel vous acceptez des missions.
      </p>

      {/* Carte Google */}
      <div className="w-full h-72 rounded-xl overflow-hidden border">
        <GoogleMap
          zoom={10}
          center={position}
          mapContainerStyle={{ width: "100%", height: "100%" }}
          onClick={(e) =>
            setPosition({ lat: e.latLng.lat(), lng: e.latLng.lng() })
          }
        >
          <Marker position={position} />
          <Circle
            center={position}
            radius={radius * 1000}
            options={{
              fillColor: "#3b82f6",
              fillOpacity: 0.15,
              strokeColor: "#2563eb",
              strokeOpacity: 0.6,
            }}
          />
        </GoogleMap>
      </div>

      {/* Contrôles */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={handleLocate}
          className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition mb-3 sm:mb-0"
        >
          📍 Utiliser ma position actuelle
        </button>

        <div className="flex flex-col items-center sm:flex-row gap-3">
          <input
            type="range"
            min="1"
            max="200"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="w-40"
          />
          <span className="font-medium">{radius} km</span>
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        className="w-full sm:w-auto bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
      >
        {loading ? "Enregistrement..." : "💾 Enregistrer"}
      </button>
    </div>
  );
}
