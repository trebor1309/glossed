// 📄 src/App.jsx
import { useState, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";

import Home from "./pages/Home";
import AboutUs from "./pages/AboutUs";
import Careers from "./pages/Careers";
import Press from "./pages/Press";
import Blog from "./pages/Blog";
import HelpCenter from "./pages/HelpCenter";
import Contact from "./pages/Contact";
import Safety from "./pages/Safety";
import About from "./pages/About";
import Services from "./pages/Services";
import Legal from "./pages/Legal";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import FAQ from "./pages/FAQ";
import ChatPage from "@/pages/dashboard/ChatPage";

import ScrollToTop from "./components/ScrollToTop";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Logo from "./components/Logo";
import SessionGate from "@/components/SessionGate";

import LoginModal from "./components/modals/LoginModal";
import SignupModal from "./components/modals/SignupModal";
import ProSignupModal from "./components/modals/ProSignupModal";
import DownloadModal from "./components/modals/DownloadModal";
import UpgradeToProModal from "./components/modals/UpgradeToProModal";

import { useUser } from "./context/UserContext";

// Client dashboard
import DashboardLayout from "./pages/dashboard/DashboardLayout";
import DashboardHome from "./pages/dashboard/pages/DashboardHome";
import DashboardReservations from "./pages/dashboard/pages/DashboardReservations";
import DashboardAccount from "./pages/dashboard/pages/DashboardAccount";
import DashboardSettings from "./pages/dashboard/pages/DashboardSettings";
import DashboardMore from "./pages/dashboard/pages/DashboardMore";
import DashboardNew from "@/pages/dashboard/pages/DashboardNew";
import PaymentSuccess from "@/pages/dashboard/payment/Success";

// Pro dashboard
import ProDashboardLayout from "./pages/prodashboard/ProDashboardLayout";
import ProDashboardHome from "./pages/prodashboard/pages/ProDashboardHome";
import ProDashboardMissions from "./pages/prodashboard/pages/ProDashboardMissions";
import ProDashboardPayments from "./pages/prodashboard/pages/ProDashboardPayments";
import ProDashboardSettings from "./pages/prodashboard/pages/ProDashboardSettings";
import ProDashboardMore from "./pages/prodashboard/pages/ProDashboardMore";
import StripeSuccess from "@/pages/prodashboard/stripe/Success";
import StripeRefresh from "@/pages/prodashboard/stripe/Refresh";

function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e) => setIsMobile(e.matches);
    handler(mq);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}

export default function App({ showUpgradeModal, closeUpgradeModal }) {
  const { user, isAuthenticated, isPro, logout, loading } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile(768);

  // 🔸 Modales globales
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showProSignup, setShowProSignup] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  // 🧭 Détection des routes dashboard
  const isDashboardRoute =
    location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/prodashboard");

  // 🔁 Redirection automatique selon le rôle (fix avec timeout)
  useEffect(() => {
    if (!loading && isAuthenticated) {
      const timer = setTimeout(() => {
        if (isPro && location.pathname === "/dashboard") {
          navigate("/prodashboard", { replace: true });
        } else if (!isPro && location.pathname === "/prodashboard") {
          navigate("/dashboard", { replace: true });
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, isPro, loading, location.pathname, navigate]);

  // 🔐 Garde supplémentaire : empêche un client d'accéder à /prodashboard
  useEffect(() => {
    if (!loading && isAuthenticated && !isPro && location.pathname.startsWith("/prodashboard")) {
      const timer = setTimeout(() => navigate("/dashboard", { replace: true }), 0);
      return () => clearTimeout(timer);
    }
  }, [loading, isAuthenticated, isPro, location.pathname, navigate]);

  // 💫 Écran de chargement global
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-rose-50 via-white to-amber-50 text-gray-700 overflow-hidden">
        <div className="animate-bounce-slow">
          <Logo size="text-5xl" />
        </div>
        <p className="mt-6 text-base font-medium text-gray-500 animate-pulse">
          Preparing your experience...
        </p>
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-rose-100/30 via-transparent to-transparent blur-3xl"></div>
      </div>
    );
  }

  // 🧭 Application principale
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-white text-gray-900 font-sans">
      {/* 🌸 Navbar visible sur toutes les pages hors dashboard */}
      {!isDashboardRoute && (
        <Navbar
          isAuthenticated={isAuthenticated}
          isPro={isPro}
          user={user}
          logout={logout}
          onOpenLogin={() => setShowLogin(true)}
          onOpenProSignup={() => setShowProSignup(true)}
          isMobile={isMobile}
        />
      )}

      <ScrollToTop />

      {/* ✅ SessionGate protège tout le rendu */}
      <SessionGate>
        <main className="flex-grow">
          <Routes>
            {/* 🌍 Pages publiques */}
            <Route
              path="/"
              element={
                <Home
                  onOpenLogin={() => setShowLogin(true)}
                  onOpenSignup={() => setShowSignup(true)}
                  onOpenProSignup={() => setShowProSignup(true)}
                  onOpenDownload={() => setShowDownload(true)}
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

            {/* 💬 Chat (dispo pour tout utilisateur connecté) */}
            <Route path="/chat/:mission_id" element={isAuthenticated ? <ChatPage /> : <Home />} />

            {/* 👤 Dashboard Client */}
            <Route path="/dashboard" element={isAuthenticated ? <DashboardLayout /> : <Home />}>
              <Route index element={<DashboardHome />} />
              <Route path="new" element={<DashboardNew />} />
              <Route path="reservations" element={<DashboardReservations />} />
              <Route path="account" element={<DashboardAccount />} />
              <Route path="settings" element={<DashboardSettings />} />
              <Route path="more" element={<DashboardMore />} />
            </Route>
            <Route path="/dashboard/payment/success" element={<PaymentSuccess />} />

            {/* 💼 Dashboard Pro */}
            <Route
              path="/prodashboard"
              element={
                isAuthenticated && (isPro || user?.roles?.includes("pro")) ? (
                  <ProDashboardLayout />
                ) : (
                  <Home />
                )
              }
            >
              <Route index element={<ProDashboardHome />} />
              <Route path="missions" element={<ProDashboardMissions />} />
              <Route path="payments" element={<ProDashboardPayments />} />
              <Route path="settings" element={<ProDashboardSettings />} />
              <Route path="more" element={<ProDashboardMore />} />
              <Route path="/prodashboard/stripe/success" element={<StripeSuccess />} />
              <Route path="/prodashboard/stripe/refresh" element={<StripeRefresh />} />
            </Route>
          </Routes>
        </main>
      </SessionGate>

      {/* 🌸 Footer visible hors dashboard */}
      {!isDashboardRoute && <Footer />}

      {/* 🪄 Modales */}
      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSignup={() => {
            setShowLogin(false);
            setShowSignup(true);
          }}
        />
      )}

      {showSignup && (
        <SignupModal
          onClose={() => setShowSignup(false)}
          onLogin={() => {
            setShowSignup(false);
            setShowLogin(true);
          }}
          onProSignup={() => {
            setShowSignup(false);
            setShowProSignup(true);
          }}
        />
      )}

      {showUpgradeModal && <UpgradeToProModal onClose={closeUpgradeModal} />}

      {showProSignup && (
        <ProSignupModal
          onClose={() => setShowProSignup(false)}
          onClientSignup={() => {
            setShowProSignup(false);
            setShowSignup(true);
          }}
        />
      )}

      {showDownload && <DownloadModal onClose={() => setShowDownload(false)} />}
    </div>
  );
}
