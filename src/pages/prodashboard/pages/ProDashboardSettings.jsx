import { useState } from "react";
import { User, FileText, MapPin, Camera, Settings } from "lucide-react";
import BusinessSettings from "./settings/BusinessSettings";
import LegalSettings from "./settings/LegalSettings";
import ProRadiusSettings from "./ProRadiusSettings";
import VisualSettings from "./settings/VisualSettings";
import PreferencesSettings from "./settings/PreferencesSettings";

export default function ProDashboardSettings() {
  const [active, setActive] = useState("business");

  const tabs = [
    { id: "business", label: "Business Info", icon: User },
    { id: "legal", label: "Legal & Billing", icon: FileText },
    { id: "area", label: "Working Area", icon: MapPin },
    { id: "visual", label: "Visual & Verification", icon: Camera },
    { id: "preferences", label: "Preferences", icon: Settings },
  ];

  return (
    <section className="w-full max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <h2 className="text-2xl font-bold text-gray-800">Settings</h2>

      {/* Tabs — responsive */}
      <div className="flex flex-wrap gap-2 justify-center border-b pb-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                active === tab.id
                  ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow"
                  : "text-gray-600 hover:text-rose-600"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      <div className="bg-white rounded-2xl shadow p-6 border border-gray-100">
        {active === "business" && <BusinessSettings />}
        {active === "legal" && <LegalSettings />}
        {active === "area" && <ProRadiusSettings />}
        {active === "visual" && <VisualSettings />}
        {active === "preferences" && <PreferencesSettings />}
      </div>
    </section>
  );
}
