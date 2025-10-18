import { AnimatePresence, motion } from "framer-motion";
import { useJsApiLoader } from "@react-google-maps/api";
import DashboardNew from "./DashboardNew";

// on garde la constante hors du composant
const libraries = ["places"];

export default function DashboardNewWrapper({
  isModal = false,
  onClose,
  onSuccess,
}) {
  // charge une seule fois l’API Google Maps
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY,
    libraries,
  });

  if (loadError) {
    console.error("Google Maps API error:", loadError);
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/50 text-white">
        <p>❌ Google Maps API error – check your key</p>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/30 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.25 }}
          className="bg-white px-6 py-4 rounded-2xl shadow text-gray-700 font-medium"
        >
          Loading Google Maps…
        </motion.div>
      </div>
    );
  }

  return (
    <AnimatePresence>
      {isModal ? (
        <motion.div
          key="booking-modal"
          className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <DashboardNew
            isModal={true}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </motion.div>
      ) : (
        <motion.div
          key="booking-page"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative z-0"
        >
          <DashboardNew
            isModal={false}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
