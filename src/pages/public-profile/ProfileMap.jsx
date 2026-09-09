import { GoogleMap, Marker, Circle } from "@react-google-maps/api";
import { useGoogleMaps } from "@/context/GoogleMapsContext";

export default function ProfileMap({ lat, lng, radius }) {
  const { isLoaded, error } = useGoogleMaps({ request: true });

  if (error) return <p className="text-sm text-gray-500">Map temporarily unavailable.</p>;
  if (!isLoaded) return <p>Loading map...</p>;

  return (
    <div className="rounded-xl overflow-hidden border">
      <GoogleMap
        zoom={10}
        center={{ lat, lng }}
        mapContainerStyle={{ width: "100%", height: "300px" }}
      >
        <Marker position={{ lat, lng }} />
        <Circle
          center={{ lat, lng }}
          radius={radius * 1000}
          options={{
            strokeColor: "#fb7185",
            fillColor: "#fda4af55",
            strokeWeight: 1.5,
          }}
        />
      </GoogleMap>
    </div>
  );
}
