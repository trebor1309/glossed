// src/pages/dashboard/pages/ProDashboardSettings.jsx
import { useState } from "react";
import BusinessSettings from "./settings/BusinessSettings";
import LegalSettings from "./settings/LegalSettings";
import ProRadiusSettings from "./settings/ProRadiusSettings";
import VisualSettings from "./settings/VisualSettings";
import PreferencesSettings from "./settings/PreferencesSettings";

export default function ProDashboardSettings() {
  const [active, setActive] = useState("business");

  const tabs = [
    { key: "business", label: "Business Info" },
    { key: "legal", label: "Legal & Billing" },
    { key: "area", label: "Working Area" },
    { key: "visual", label: "Visual & Verification" },
    { key: "preferences", label: "Preferences" }, // 👈 5e onglet
  ];

  return (
    <div className="p-6 space-y-8">
      {/* Tabs */}
      <div className="flex flex-wrap gap-3 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-4 py-2 rounded-t-lg font-medium transition ${
              active === tab.key
                ? "bg-rose-100 text-rose-700 border-b-2 border-rose-600"
                : "text-gray-600 hover:text-rose-500"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content — components stay mounted, we only hide/show */}
      <div className="bg-white rounded-2xl shadow p-6 border border-gray-100">
        <div hidden={active !== "business"}>
          <BusinessSettings />
        </div>
        <div hidden={active !== "legal"}>
          <LegalSettings />
        </div>
        <div hidden={active !== "area"}>
          <ProRadiusSettings />
        </div>
        <div hidden={active !== "visual"}>
          <VisualSettings />
        </div>
        <div hidden={active !== "preferences"}>
          <PreferencesSettings />
        </div>{" "}
        {/* 👈 */}
      </div>
    </div>
  );
}
