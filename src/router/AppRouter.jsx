// 📄 src/router/AppRouter.jsx
import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

// 🌍 Public pages

// 👤 Auth pages

// Dashboard — Client

// Dashboard — Pro

// Chat system

// Route guards
import ProtectedRoute from "./ProtectedRoute";
import ProRoute from "./ProRoute";
import PublicOnlyRoute from "./PublicOnlyRoute";
import OnboardingGuard from "./OnboardingGuard";

const Home = lazy(() => import("@/pages/Home"));
const About = lazy(() => import("@/pages/About"));
const Services = lazy(() => import("@/pages/Services"));
const Legal = lazy(() => import("@/pages/Legal"));
const Privacy = lazy(() => import("@/pages/Privacy"));
const Terms = lazy(() => import("@/pages/Terms"));
const FAQ = lazy(() => import("@/pages/FAQ"));
const AboutUs = lazy(() => import("@/pages/AboutUs"));
const Careers = lazy(() => import("@/pages/Careers"));
const Press = lazy(() => import("@/pages/Press"));
const Blog = lazy(() => import("@/pages/Blog"));
const HelpCenter = lazy(() => import("@/pages/HelpCenter"));
const Contact = lazy(() => import("@/pages/Contact"));
const Safety = lazy(() => import("@/pages/Safety"));
const UserPublicProfile = lazy(() => import("@/pages/public-profile/UserPublicProfile"));

const CheckEmail = lazy(() => import("@/pages/auth/CheckEmail"));
const EmailVerified = lazy(() => import("@/pages/auth/EmailVerified"));
const OnboardingPage = lazy(() => import("@/pages/auth/OnboardingPage"));

const DashboardLayout = lazy(() => import("@/pages/dashboard/DashboardLayout"));
const DashboardHome = lazy(() => import("@/pages/dashboard/pages/DashboardHome"));
const DashboardDiscover = lazy(() => import("@/pages/dashboard/pages/DashboardDiscover"));
const DashboardNew = lazy(() => import("@/pages/dashboard/pages/DashboardNew"));
const DashboardReservations = lazy(() => import("@/pages/dashboard/pages/DashboardReservations"));
const DashboardAccount = lazy(() => import("@/pages/dashboard/pages/DashboardAccount"));
const DashboardSettings = lazy(() => import("@/pages/dashboard/pages/DashboardSettings"));
const DashboardMore = lazy(() => import("@/pages/dashboard/pages/DashboardMore"));
const DashboardPayments = lazy(() => import("@/pages/dashboard/pages/DashboardPayments"));
const DashboardNotifications = lazy(() => import("@/pages/shared/DashboardNotifications"));
const PaymentSuccess = lazy(() => import("@/pages/dashboard/payment/Success"));

const ProDashboardLayout = lazy(() => import("@/pages/prodashboard/ProDashboardLayout"));
const ProDashboardHome = lazy(() => import("@/pages/prodashboard/pages/ProDashboardHome"));
const ProDashboardMissions = lazy(() => import("@/pages/prodashboard/pages/ProDashboardMissions"));
const ProDashboardPayments = lazy(() => import("@/pages/prodashboard/pages/ProDashboardPayments"));
const ProDashboardSettings = lazy(() => import("@/pages/prodashboard/pages/ProDashboardSettings"));
const ProDashboardMore = lazy(() => import("@/pages/prodashboard/pages/ProDashboardMore"));
const ProDashboardAccount = lazy(() => import("@/pages/prodashboard/pages/ProDashboardAccount"));
const StripeSuccess = lazy(() => import("@/pages/prodashboard/stripe/Success"));
const StripeRefresh = lazy(() => import("@/pages/prodashboard/stripe/Refresh"));

const ChatLayout = lazy(() => import("@/components/chat/ChatLayout"));
const DashboardMessages = lazy(() => import("@/pages/dashboard/pages/DashboardMessages"));
const DashboardChat = lazy(() => import("@/pages/dashboard/pages/DashboardChat"));
const ProDashboardMessages = lazy(() => import("@/pages/prodashboard/pages/ProDashboardMessages"));
const ProDashboardChat = lazy(() => import("@/pages/prodashboard/pages/ProDashboardChat"));

function RouteFallback() {
  return (
    <div
      className="flex min-h-[40vh] items-center justify-center px-4 text-sm text-gray-500"
      role="status"
      aria-live="polite"
    >
      Loading page...
    </div>
  );
}

export default function AppRouter({ onOpenLogin, onOpenSignup, onOpenDownload }) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        {/* 🌍 Public */}
        <Route
          path="/"
          element={
            <Home
              onOpenLogin={onOpenLogin}
              onOpenSignup={onOpenSignup}
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
          <Route path="discover" element={<DashboardDiscover />} />
          <Route path="new" element={<DashboardNew />} />
          <Route path="reservations" element={<DashboardReservations />} />
          <Route path="account" element={<DashboardAccount />} />
          <Route path="settings" element={<DashboardSettings />} />
          <Route path="more" element={<DashboardMore />} />
          <Route path="payments" element={<DashboardPayments />} />
          <Route path="notifications" element={<DashboardNotifications />} />

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
          <Route path="notifications" element={<DashboardNotifications />} />

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
    </Suspense>
  );
}
