import { GoogleMap, Marker, Circle, useLoadScript } from "@react-google-maps/api";

const libraries = ["places"];

export default function ProfileMap({ lat, lng, radius }) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

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
