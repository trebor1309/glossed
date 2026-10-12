const publicValue = (name, fallback = "") => {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

export const legalOperator = Object.freeze({
  tradeName: "Glossed",
  legalName: publicValue("VITE_LEGAL_ENTITY_NAME", "Glossed"),
  legalForm: publicValue("VITE_LEGAL_ENTITY_FORM"),
  registeredOffice: publicValue("VITE_LEGAL_REGISTERED_OFFICE"),
  enterpriseNumber: publicValue("VITE_LEGAL_ENTERPRISE_NUMBER"),
  vatNumber: publicValue("VITE_LEGAL_VAT_NUMBER"),
  contactEmail: publicValue("VITE_LEGAL_CONTACT_EMAIL", "support@glossed.app"),
  contactPhone: publicValue("VITE_LEGAL_CONTACT_PHONE"),
  country: "Belgium",
});

export const missingLegalOperatorFields = Object.freeze(
  [
    ["legalName", "legal entity name"],
    ["legalForm", "legal form"],
    ["registeredOffice", "registered office"],
    ["enterpriseNumber", "BCE/KBO enterprise number"],
    ["contactPhone", "business telephone number"],
  ]
    .filter(
      ([key]) => !legalOperator[key] || (key === "legalName" && legalOperator[key] === "Glossed")
    )
    .map(([, label]) => label)
);

export const isLegalOperatorConfigured = missingLegalOperatorFields.length === 0;
