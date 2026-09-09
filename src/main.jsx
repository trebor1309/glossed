// 📄 src/main.jsx
import "bootstrap-icons/font/bootstrap-icons.css";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

// ✅ Contexts
import { UserProvider } from "./context/UserContext.jsx";
import { NotificationProvider } from "./context/NotificationContext.jsx"; // ← NEW
import { GoogleMapsProvider } from "./context/GoogleMapsContext.jsx";

function Root() {
  return (
    <GoogleMapsProvider>
      <UserProvider>
        {/* 🔔 Notifications globales accessibles partout (landing + dashboards) */}
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </UserProvider>
    </GoogleMapsProvider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Root />
    </BrowserRouter>
  </React.StrictMode>
);
