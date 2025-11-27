import { useState } from "react";
import BusinessInfo from "./settings/BusinessInfo";
import LegalBilling from "./settings/LegalBilling";
import WorkingArea from "./settings/WorkingArea";
import VisualVerificationSettings from "./settings/VisualVerificationSettings";

export default function ProAccountPage() {
  const [active, setActive] = useState("business");

  const tabs = [
    { key: "business", label: "Business Info" },
    { key: "legal", label: "Legal & Billing" },
    { key: "area", label: "Working Area" },
    { key: "visual", label: "Visual & Verification" },
  ];

  return (
    <div className="mt-10 max-w-4xl mx-auto p-4 space-y-8">
      {/* Tabs */}
      <div className="flex flex-wrap gap-3 border-b pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`px-4 py-2 rounded-t-lg font-medium transition
              ${
                active === tab.key
                  ? "bg-rose-100 text-rose-700 border-b-2 border-rose-600"
                  : "text-gray-600 hover:text-rose-500"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="bg-white rounded-2xl shadow p-6 border border-gray-100">
        {active === "business" && <BusinessInfo />}
        {active === "legal" && <LegalBilling />}
        {active === "area" && <WorkingArea />}
        {active === "visual" && <VisualVerificationSettings />}
      </div>
    </div>
  );
}
