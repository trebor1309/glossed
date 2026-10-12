const publicValue = (name, fallback = "") => {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
};

const currentOperatorDefaults = Object.freeze({
  legalName: "Robert Heinen",
  legalForm: "Entreprise individuelle (personne physique)",
  operatorTradeName: "EWCS",
  registeredOffice: "Route du Barrage 36, 4960 Malmedy, Belgique",
  enterpriseNumber: "1028.639.270",
  vatNumber: "BE 1028.639.270",
  contactEmail: "contact@ewcs.be",
  contactPhone: "+32 80 78 66 58",
});

const operatorVariables = [
  "VITE_LEGAL_ENTITY_NAME",
  "VITE_LEGAL_ENTITY_FORM",
  "VITE_LEGAL_OPERATOR_TRADE_NAME",
  "VITE_LEGAL_REGISTERED_OFFICE",
  "VITE_LEGAL_ENTERPRISE_NUMBER",
  "VITE_LEGAL_VAT_NUMBER",
  "VITE_LEGAL_CONTACT_EMAIL",
  "VITE_LEGAL_CONTACT_PHONE",
];

// Once production overrides any operator field, stop mixing those values with
// the current EWCS defaults. A partial future migration must visibly fail closed.
const hasOperatorOverride = operatorVariables.some((name) => {
  const value = import.meta.env[name];
  return typeof value === "string" && Boolean(value.trim());
});

const operatorValue = (name, fallbackKey) =>
  publicValue(name, hasOperatorOverride ? "" : currentOperatorDefaults[fallbackKey]);

export const legalOperator = Object.freeze({
  tradeName: "Glossed",
  legalName: operatorValue("VITE_LEGAL_ENTITY_NAME", "legalName"),
  legalForm: operatorValue("VITE_LEGAL_ENTITY_FORM", "legalForm"),
  operatorTradeName: operatorValue("VITE_LEGAL_OPERATOR_TRADE_NAME", "operatorTradeName"),
  registeredOffice: operatorValue("VITE_LEGAL_REGISTERED_OFFICE", "registeredOffice"),
  enterpriseNumber: operatorValue("VITE_LEGAL_ENTERPRISE_NUMBER", "enterpriseNumber"),
  vatNumber: operatorValue("VITE_LEGAL_VAT_NUMBER", "vatNumber"),
  contactEmail: operatorValue("VITE_LEGAL_CONTACT_EMAIL", "contactEmail"),
  contactPhone: operatorValue("VITE_LEGAL_CONTACT_PHONE", "contactPhone"),
  country: "Belgium",
});

export const missingLegalOperatorFields = Object.freeze(
  [
    ["legalName", "legal entity name"],
    ["legalForm", "legal form"],
    ["registeredOffice", "registered office"],
    ["enterpriseNumber", "BCE/KBO enterprise number"],
    ["contactEmail", "business email address"],
    ["contactPhone", "business telephone number"],
  ]
    .filter(([key]) => !legalOperator[key])
    .map(([, label]) => label)
);

export const isLegalOperatorConfigured = missingLegalOperatorFields.length === 0;
