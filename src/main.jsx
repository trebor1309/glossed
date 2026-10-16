// 📄 src/main.jsx
import "bootstrap-icons/font/bootstrap-icons.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";
import AppErrorBoundary from "./components/AppErrorBoundary.jsx";
import { installGlobalOperationalMonitoring } from "./lib/operationalTelemetry.js";

// ✅ Contexts
import { UserProvider } from "./context/UserContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx"; // ← NEW
import { GoogleMapsProvider } from "./context/GoogleMapsContext.jsx";
import { PlatformCapabilitiesProvider } from "./context/PlatformCapabilitiesContext.jsx";

installGlobalOperationalMonitoring();

function Root() {
  return (
    <PlatformCapabilitiesProvider>
      <GoogleMapsProvider>
        <UserProvider>
          {/* 🔔 Notifications globales accessibles partout (landing + dashboards) */}
          <NotificationProvider>
            <App />
          </NotificationProvider>
        </UserProvider>
      </GoogleMapsProvider>
    </PlatformCapabilitiesProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);
