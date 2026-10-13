import { readFileSync } from "node:fs";

const mapsContext = readFileSync("src/context/GoogleMapsContext.jsx", "utf8");
const addressAutocomplete = readFileSync("src/components/forms/AddressAutocomplete.jsx", "utf8");
const onboarding = readFileSync("src/pages/auth/OnboardingPage.jsx", "utf8");
const workingArea = readFileSync("src/pages/prodashboard/pages/settings/WorkingArea.jsx", "utf8");
const indexHtml = readFileSync("index.html", "utf8");
const productionGuide = readFileSync("docs/production-web-configuration.md", "utf8");
const vercelConfig = JSON.parse(readFileSync("vercel.json", "utf8"));

for (const contract of [
  'const GOOGLE_MAPS_LIBRARIES = ["places"]',
  'version: "weekly"',
  'region: "BE"',
  'authReferrerPolicy: "origin"',
  "PlaceAutocompleteElement",
]) {
  if (!mapsContext.includes(contract)) {
    throw new Error("Missing Google Maps loader contract: " + contract);
  }
}

for (const contract of [
  "new PlaceAutocompleteElement",
  '"gmp-select"',
  '"gmp-error"',
  '"formattedAddress"',
  '"addressComponents"',
  'includedRegionCodes: ["be"]',
]) {
  if (!addressAutocomplete.includes(contract)) {
    throw new Error("Missing Places API (New) contract: " + contract);
  }
}

const appSources = mapsContext + addressAutocomplete + onboarding + workingArea;
if (
  appSources.includes("new window.google.maps.places.Autocomplete") ||
  workingArea.includes("Autocomplete } from")
) {
  throw new Error("Legacy Google Places Autocomplete must not be used");
}

if (!onboarding.includes("allowManualEntry")) {
  throw new Error("Onboarding must offer manual address entry when Google is unavailable");
}
if (
  onboarding.includes("Error loading Google Maps. Please refresh the page.") ||
  onboarding.includes("Loading location tools…")
) {
  throw new Error("Google Maps availability must not block the entire onboarding page");
}

if (
  !indexHtml.includes('<link rel="canonical" href="https://www.glossed.app/" />') ||
  !indexHtml.includes('<meta property="og:url" content="https://www.glossed.app/" />')
) {
  throw new Error("The public app must declare www.glossed.app as its canonical URL");
}
if (indexHtml.includes("glossed.be")) {
  throw new Error("Legacy glossed.be metadata must not be published");
}

const canonicalRedirect = vercelConfig.redirects?.find(
  (redirect) =>
    redirect.source === "/:path*" &&
    redirect.destination === "https://www.glossed.app/:path*" &&
    redirect.permanent === true &&
    redirect.has?.some(
      (condition) => condition.type === "host" && condition.value === "glossed.app"
    )
);
if (!canonicalRedirect) {
  throw new Error("Missing permanent glossed.app to www.glossed.app redirect");
}

for (const instruction of [
  "Maps JavaScript API",
  "Places API (New)",
  "VITE_GOOGLE_MAPS_API_KEY",
  "https://www.glossed.app",
  "https://glossed.app",
]) {
  if (!productionGuide.includes(instruction)) {
    throw new Error("Missing production configuration instruction: " + instruction);
  }
}
if (productionGuide.includes("glossed.app/*")) {
  throw new Error("Origin-only Google referrer restrictions must not contain a path wildcard");
}

process.stdout.write("Production web configuration checks passed.\n");
