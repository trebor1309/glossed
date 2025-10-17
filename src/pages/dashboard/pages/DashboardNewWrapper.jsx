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
            key="modal"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <DashboardNew
              isModal={isModal}
              onClose={onClose}
              onSuccess={onSuccess}
            />
          </motion.div>
        )}

        {!isModal && (
          // Mode page classique (mobile)
          <DashboardNew
            isModal={false}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        )}
      </AnimatePresence>
    </LoadScript>
  );
}
