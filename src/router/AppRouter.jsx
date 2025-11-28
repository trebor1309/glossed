// 📄 src/router/AppRouter.jsx
import { Routes, Route, Navigate } from "react-router-dom";

// 🌍 Public pages
import Home from "@/pages/Home";
import About from "@/pages/About";
import Services from "@/pages/Services";
import Legal from "@/pages/Legal";
import Privacy from "@/pages/Privacy";
import Terms from "@/pages/Terms";
import FAQ from "@/pages/FAQ";
import AboutUs from "@/pages/AboutUs";
import Careers from "@/pages/Careers";
import Press from "@/pages/Press";
import Blog from "@/pages/Blog";
import HelpCenter from "@/pages/HelpCenter";
import Contact from "@/pages/Contact";
import Safety from "@/pages/Safety";

// 👤 Auth pages
import CheckEmail from "@/pages/auth/CheckEmail";
import EmailVerified from "@/pages/auth/EmailVerified";
import OnboardingPage from "@/pages/auth/OnboardingPage";

// Dashboard — Client
import DashboardLayout from "@/pages/dashboard/DashboardLayout";
import DashboardHome from "@/pages/dashboard/pages/DashboardHome";
import DashboardNew from "@/pages/dashboard/pages/DashboardNew";
import DashboardReservations from "@/pages/dashboard/pages/DashboardReservations";
import DashboardAccount from "@/pages/dashboard/pages/DashboardAccount";
import DashboardSettings from "@/pages/dashboard/pages/DashboardSettings";
import DashboardMore from "@/pages/dashboard/pages/DashboardMore";
import DashboardPayments from "@/pages/dashboard/pages/DashboardPayments";
import PaymentSuccess from "@/pages/dashboard/payment/Success";

// Dashboard — Pro
import ProDashboardLayout from "@/pages/prodashboard/ProDashboardLayout";
import ProDashboardHome from "@/pages/prodashboard/pages/ProDashboardHome";
import ProDashboardMissions from "@/pages/prodashboard/pages/ProDashboardMissions";
import ProDashboardPayments from "@/pages/prodashboard/pages/ProDashboardPayments";
import ProDashboardSettings from "@/pages/prodashboard/pages/ProDashboardSettings";
import ProDashboardMore from "@/pages/prodashboard/pages/ProDashboardMore";
import ProDashboardAccount from "@/pages/prodashboard/pages/ProDashboardAccount";
import StripeSuccess from "@/pages/prodashboard/stripe/Success";
import StripeRefresh from "@/pages/prodashboard/stripe/Refresh";

// Chat system
import ChatLayout from "@/components/chat/ChatLayout";
import DashboardMessages from "@/pages/dashboard/pages/DashboardMessages";
import DashboardChat from "@/pages/dashboard/pages/DashboardChat";
import ProDashboardMessages from "@/pages/prodashboard/pages/ProDashboardMessages";
import ProDashboardChat from "@/pages/prodashboard/pages/ProDashboardChat";

// Route guards
import ProtectedRoute from "./ProtectedRoute";
import ProRoute from "./ProRoute";
import PublicOnlyRoute from "./PublicOnlyRoute";
import OnboardingGuard from "./OnboardingGuard";

// Profiles
import UserPublicProfile from "@/pages/public-profile/UserPublicProfile";

export default function AppRouter() {
  return (
    <Routes>
      {/* 🌍 Public */}
      <Route path="/" element={<Home />} />
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

      {/* 🌍 Public profile pages */}
      <Route path="/profile/:user_id" element={<UserPublicProfile />} />

      {/* 📧 Email verification flow */}
      <Route
        path="/auth/check-email"
        element={
          <PublicOnlyRoute>
            <CheckEmail />
          </PublicOnlyRoute>
        }
      />

      <Route path="/auth/email-verified" element={<EmailVerified />} />

      {/* 🧭 Onboarding */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <OnboardingPage />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />

      {/* 👤 Public user profile (only logged-in users can view it) */}
      <Route
        path="/profile/:user_id"
        element={
          <ProtectedRoute>
            <OnboardingGuard>
              <UserPublicProfile />
            </OnboardingGuard>
          </ProtectedRoute>
        }
      />

      {/* 👤 Dashboard Client */}
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
        <Route path="new" element={<DashboardNew />} />
        <Route path="reservations" element={<DashboardReservations />} />
        <Route path="account" element={<DashboardAccount />} />
        <Route path="settings" element={<DashboardSettings />} />
        <Route path="more" element={<DashboardMore />} />
        <Route path="payments" element={<DashboardPayments />} />

        {/* 💬 Client Chat */}
        <Route path="messages" element={<ChatLayout leftPanel={<DashboardMessages />} />}>
          <Route path=":chat_id" element={<DashboardChat />} />
        </Route>
      </Route>

      <Route path="/payment/success" element={<PaymentSuccess />} />

      {/* 💼 Dashboard Pro */}
      <Route
        path="/prodashboard"
        element={
          <ProtectedRoute>
            <ProRoute>
              <OnboardingGuard>
                <ProDashboardLayout />
              </OnboardingGuard>
            </ProRoute>
          </ProtectedRoute>
        }
      >
        <Route index element={<ProDashboardHome />} />
        <Route path="missions" element={<ProDashboardMissions />} />
        <Route path="payments" element={<ProDashboardPayments />} />
        <Route path="settings" element={<ProDashboardSettings />} />
        <Route path="account" element={<ProDashboardAccount />} />
        <Route path="more" element={<ProDashboardMore />} />

        {/* 💬 Pro Chat */}
        <Route path="messages" element={<ChatLayout leftPanel={<ProDashboardMessages />} />}>
          <Route path=":chat_id" element={<ProDashboardChat />} />
        </Route>

        <Route path="stripe/success" element={<StripeSuccess />} />
        <Route path="stripe/refresh" element={<StripeRefresh />} />
      </Route>

      {/* ❓ Unknown route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
