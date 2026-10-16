import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import AdminApp from "./AdminApp";
import AppErrorBoundary from "../components/AppErrorBoundary";
import { installGlobalOperationalMonitoring } from "../lib/operationalTelemetry";
import "../index.css";

installGlobalOperationalMonitoring();

ReactDOM.createRoot(document.getElementById("admin-root")).render(
  <React.StrictMode>
    <AppErrorBoundary admin>
      <BrowserRouter>
        <AdminApp />
      </BrowserRouter>
    </AppErrorBoundary>
  </React.StrictMode>
);
