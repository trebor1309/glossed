// src/router/router.jsx
import { Routes, Route } from "react-router-dom";

import Home from "@/pages/Home";
import About from "@/pages/About";
import Services from "@/pages/Services";
// ... (tes autres pages publiques)

import ProtectedRoute from "./ProtectedRoute";
import OnboardingGuard from "./OnboardingGuard";

// Auth pages
import CheckEmail from "@/pages/auth/CheckEmail";
import EmailVerified from "@/pages/auth/EmailVerified";

// Onboarding
import Onboarding from "@/pages/onboarding/Onboarding";

// Dashboards
import DashboardLayout from "@/pages/dashboard/DashboardLayout";
import DashboardHome from "@/pages/dashboard/pages/DashboardHome";

import ProDashboardLayout from "@/pages/prodashboard/ProDashboardLayout";
import ProDashboardHome from "@/pages/prodashboard/pages/ProDashboardHome";

export default function AppRouter() {
  return (
    <Routes>
      {/* 🌍 Public */}
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
      <Route path="/services" element={<Services />} />
      {/* …les autres pages publiques */}

      {/* 📩 Auth */}
      <Route path="/auth/check-email" element={<CheckEmail />} />
      <Route path="/auth/email-verified" element={<EmailVerified />} />

      {/* 🧭 Onboarding (protégé + email vérifié obligatoire) */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <Onboarding />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />

      {/* 👤 Client Dashboard */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <DashboardLayout />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
      </Route>

      {/* 💼 Pro Dashboard */}
      <Route
        path="/prodashboard"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <ProDashboardLayout />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<ProDashboardHome />} />
      </Route>
    </Routes>
  );
}
