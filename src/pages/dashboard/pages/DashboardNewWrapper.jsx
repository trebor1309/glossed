import { LoadScript } from "@react-google-maps/api";
import { AnimatePresence, motion } from "framer-motion";
import DashboardNew from "./DashboardNew";

// ✅ constante statique pour éviter le warning "LoadScript reloaded"
const libraries = ["places"];

export default function DashboardNewWrapper({
  isModal = false,
  onClose,
  onSuccess,
}) {
  return (
    <LoadScript
      googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
      libraries={libraries}
    >
      <AnimatePresence>
        {isModal && (
          <motion.div
            key="booking-modal"
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center"
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
        )}

        {!isModal && (
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
    </LoadScript>
  );
}
