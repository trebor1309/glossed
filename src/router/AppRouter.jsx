// src/router/AppRouter.jsx
import { Routes, Route, Navigate } from "react-router-dom";

// 🌍 Public pages
import Home from "@/pages/Home";
import AboutUs from "@/pages/AboutUs";
import Careers from "@/pages/Careers";
import Press from "@/pages/Press";
import Blog from "@/pages/Blog";
import HelpCenter from "@/pages/HelpCenter";
import Contact from "@/pages/Contact";
import Safety from "@/pages/Safety";
import About from "@/pages/About";
import Services from "@/pages/Services";
import Legal from "@/pages/Legal";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import FAQ from "@/pages/FAQ";

// 🔐 Auth pages
import CheckEmail from "@/pages/auth/CheckEmail";
import EmailVerified from "@/pages/auth/EmailVerified";
import Onboarding from "@/pages/auth/Onboarding";

// 💬 Chat (client)
import DashboardMessages from "@/pages/dashboard/pages/DashboardMessages";
import DashboardChat from "@/pages/dashboard/pages/DashboardChat";

// 💬 Chat (pro)
import ProDashboardMessages from "@/pages/prodashboard/pages/ProDashboardMessages";
import ProDashboardChat from "@/pages/prodashboard/pages/ProDashboardChat";
import ChatLayout from "@/components/chat/ChatLayout";

// 👤 Client dashboard
import DashboardLayout from "@/pages/dashboard/DashboardLayout";
import DashboardHome from "@/pages/dashboard/pages/DashboardHome";
import DashboardReservations from "@/pages/dashboard/pages/DashboardReservations";
import DashboardAccount from "@/pages/dashboard/pages/DashboardAccount";
import DashboardSettings from "@/pages/dashboard/pages/DashboardSettings";
import DashboardMore from "@/pages/dashboard/pages/DashboardMore";
import DashboardNew from "@/pages/dashboard/pages/DashboardNew";
import DashboardPayments from "@/pages/dashboard/pages/DashboardPayments";
import PaymentSuccess from "@/pages/dashboard/payment/Success";

// 💼 Pro dashboard
import ProDashboardLayout from "@/pages/prodashboard/ProDashboardLayout";
import ProDashboardHome from "@/pages/prodashboard/pages/ProDashboardHome";
import ProDashboardMissions from "@/pages/prodashboard/pages/ProDashboardMissions";
import ProDashboardPayments from "@/pages/prodashboard/pages/ProDashboardPayments";
import ProDashboardSettings from "@/pages/prodashboard/pages/ProDashboardSettings";
import ProDashboardMore from "@/pages/prodashboard/pages/ProDashboardMore";
import ProDashboardAccount from "@/pages/prodashboard/pages/ProDashboardAccount";
import StripeSuccess from "@/pages/prodashboard/stripe/Success";
import StripeRefresh from "@/pages/prodashboard/stripe/Refresh";

// 🔒 Guards
import ProtectedRoute from "./ProtectedRoute";
import OnboardingGuard from "./OnboardingGuard";

export default function AppRouter({
  isAuthenticated,
  isPro,
  user,
  onOpenLogin,
  onOpenSignup,
  onOpenDownload,
}) {
  return (
    <Routes>
      {/* 🌍 Public */}
      <Route
        path="/"
        element={
          <Home
            onOpenLogin={onOpenLogin}
            onOpenSignup={onOpenSignup}
            // onOpenProSignup utilise le même modal Signup
            onOpenProSignup={onOpenSignup}
            onOpenDownload={onOpenDownload}
          />
        }
      />

      <Route path="/about" element={<About />} />
      <Route path="/services" element={<Services />} />
      <Route path="/legal" element={<Legal />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route path="/faq" element={<FAQ />} />
      <Route path="/about-us" element={<AboutUs />} />
      <Route path="/careers" element={<Careers />} />
      <Route path="/press" element={<Press />} />
      <Route path="/blog" element={<Blog />} />
      <Route path="/help-center" element={<HelpCenter />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/safety" element={<Safety />} />

      {/* 🔐 Auth flow */}
      <Route path="/auth/check-email" element={<CheckEmail />} />
      <Route path="/auth/email-verified" element={<EmailVerified />} />
      <Route
        path="/auth/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />

      {/* 👤 Dashboard Client */}
      <Route
        path="/dashboard/*"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              {/* si pro connecté → redirige vers prodashboard */}
              {isPro ? <Navigate to="/prodashboard" replace /> : <DashboardLayout />}
            </OnboardingGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="new" element={<DashboardNew />} />
        <Route path="reservations" element={<DashboardReservations />} />
        <Route path="account" element={<DashboardAccount />} />
        <Route path="settings" element={<DashboardSettings />} />
        <Route path="more" element={<DashboardMore />} />
        <Route path="payments" element={<DashboardPayments />} />

        {/* Inbox + Chat client */}
        <Route path="messages" element={<ChatLayout leftPanel={<DashboardMessages />} />}>
          <Route path=":chat_id" element={<DashboardChat />} />
        </Route>
      </Route>

      {/* ✅ Stripe retour client */}
      <Route path="/payment/success" element={<PaymentSuccess />} />

      {/* 💼 Dashboard Pro */}
      <Route
        path="/prodashboard/*"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              {isPro || user?.role === "pro" || user?.activeRole === "pro" ? (
                <ProDashboardLayout />
              ) : (
                <Navigate to="/dashboard" replace />
              )}
            </OnboardingGuard>
          </ProtectedRoute>
        }
      >
        <Route index element={<ProDashboardHome />} />
        <Route path="missions" element={<ProDashboardMissions />} />
        <Route path="payments" element={<ProDashboardPayments />} />
        <Route path="settings" element={<ProDashboardSettings />} />
        <Route path="account" element={<ProDashboardAccount />} />
        <Route path="more" element={<ProDashboardMore />} />

        {/* Inbox + Chat pro */}
        <Route path="messages" element={<ChatLayout leftPanel={<ProDashboardMessages />} />}>
          <Route path=":chat_id" element={<ProDashboardChat />} />
        </Route>

        {/* Stripe pro */}
        <Route path="stripe/success" element={<StripeSuccess />} />
        <Route path="stripe/refresh" element={<StripeRefresh />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
