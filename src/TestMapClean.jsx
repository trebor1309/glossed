// src/TestMapClean.jsx
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";

export default function TestMapClean() {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
  });

  console.log("Google Maps status:", { isLoaded, loadError });

  if (loadError)
    return (
      <div style={{ color: "red", padding: "20px" }}>❌ Google Maps error: {loadError.message}</div>
    );

  if (!isLoaded)
    return <div style={{ padding: "20px", fontSize: "18px" }}>⏳ Loading Google Maps...</div>;

  return (
    <div style={{ width: "100vw", height: "100vh" }}>
      <GoogleMap
        zoom={10}
        center={{ lat: 50.8503, lng: 4.3517 }}
        mapContainerStyle={{ width: "100%", height: "100%" }}
      >
        <Marker position={{ lat: 50.8503, lng: 4.3517 }} />
      </GoogleMap>
    </div>
  );
}
