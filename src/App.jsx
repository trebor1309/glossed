// 📄 src/App.jsx
import Home from "./pages/Home";
import { Facebook, Instagram } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import Logo from "./components/Logo";
import { Routes, Route, useNavigate, useLocation } from "react-router-dom";
import LoginModal from "./components/modals/LoginModal";
import SignupModal from "./components/modals/SignupModal";
import ProSignupModal from "./components/modals/ProSignupModal";
import DownloadModal from "./components/modals/DownloadModal";
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
import ScrollToTop from "./components/ScrollToTop";
import { useUser } from "./context/UserContext";
import DashboardLayout from "./pages/dashboard/DashboardLayout";
import DashboardHome from "./pages/dashboard/pages/DashboardHome";
import DashboardReservations from "./pages/dashboard/pages/DashboardReservations";
import DashboardAccount from "./pages/dashboard/pages/DashboardAccount";
import DashboardSettings from "./pages/dashboard/pages/DashboardSettings";
import DashboardMore from "./pages/dashboard/pages/DashboardMore";
import DashboardNew from "./pages/dashboard/pages/DashboardNew";
// 📄 Layout + Pages Pro Dashboard
import ProDashboardLayout from "./pages/prodashboard/ProDashboardLayout";
import ProDashboardHome from "./pages/prodashboard/pages/ProDashboardHome";
import ProDashboardMissions from "./pages/prodashboard/pages/ProDashboardMissions";
import ProDashboardPayments from "./pages/prodashboard/pages/ProDashboardPayments";
import ProDashboardSettings from "./pages/prodashboard/pages/ProDashboardSettings";
import UpgradeToProModal from "./components/modals/UpgradeToProModal";
import ProDashboardMore from "./pages/prodashboard/pages/ProDashboardMore";
import { LoadScript } from "@react-google-maps/api";

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
  const { user, isAuthenticated, isPro, isClient, logout, loading } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile(768);

  const [isOpen, setIsOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showProSignup, setShowProSignup] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  const GOOGLE_LIBRARIES = ["places"];

  const isDashboard =
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/prodashboard");

  // ⏳ 1️⃣ Blocage du rendu tant que le contexte charge
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
  if (
    isAuthenticated &&
    !isPro &&
    location.pathname.startsWith("/prodashboard")
  ) {
    navigate("/dashboard", { replace: true });
    return null;
  }

  return (
    <>
      <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-white text-gray-900 font-sans">
        {/* Navbar */}
        {!(isDashboard && isMobile) && (
          <nav className="backdrop-blur-sm bg-white/90 sticky top-0 z-50 border-b border-gray-100 shadow-sm">
            <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-16 py-6">
              {/* Logo */}
              <a
                href="/"
                className="group transform transition-all duration-300 hover:scale-110 active:scale-95"
              >
                <Logo size="text-3xl" />
              </a>

              {/* Desktop Links */}
              <div className="hidden md:flex items-center gap-10 text-sm font-medium">
                <a
                  href={
                    isAuthenticated && location.pathname === "/"
                      ? isPro
                        ? "/prodashboard"
                        : "/dashboard"
                      : "/"
                  }
                  className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
                >
                  {isAuthenticated && location.pathname === "/"
                    ? "Dashboard"
                    : "Home"}
                </a>

                <a
                  href="/about"
                  className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
                >
                  About
                </a>
                <a
                  href="/services"
                  className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
                >
                  Services
                </a>
              </div>

              {/* Auth & CTA */}
              <div className="hidden md:flex items-center gap-5">
                {!isAuthenticated ? (
                  <>
                    <button
                      onClick={() => setShowLogin(true)}
                      className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:shadow-md hover:scale-105 transition-all duration-300"
                    >
                      Sign in
                    </button>

                    <button
                      onClick={() => setShowProSignup(true)}
                      className="text-rose-600 border border-rose-300 px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-rose-50 hover:border-rose-400 hover:text-rose-700 hover:shadow-md hover:scale-105 transition-all duration-300"
                    >
                      Pro Space
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-gray-700 font-medium">
                      Welcome, {user?.email?.split("@")[0] || "Guest"} 👋
                    </span>
                    <button
                      onClick={logout}
                      className="text-rose-600 border border-rose-300 px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-rose-50 hover:border-rose-400 hover:text-rose-700 hover:shadow-md hover:scale-105 transition-all duration-300"
                    >
                      Log out
                    </button>
                  </>
                )}
              </div>

              {/* Burger (mobile) */}
              <button
                className="md:hidden flex flex-col justify-between w-7 h-6 focus:outline-none"
                onClick={() => setIsOpen(!isOpen)}
              >
                <span
                  className={`h-[2px] bg-rose-600 rounded transition-transform duration-300 ease-in-out ${
                    isOpen ? "rotate-45 translate-y-[10px]" : ""
                  }`}
                ></span>
                <span
                  className={`h-[2px] bg-rose-600 rounded transition-all duration-300 ease-in-out ${
                    isOpen ? "opacity-0" : "opacity-100"
                  }`}
                ></span>
                <span
                  className={`h-[2px] bg-rose-600 rounded transition-transform duration-300 ease-in-out ${
                    isOpen ? "-rotate-45 -translate-y-[10px]" : ""
                  }`}
                ></span>
              </button>
            </div>
          </nav>
        )}

        <ScrollToTop />

        {/* Routes */}
        <main className="flex-grow">
          {location.pathname.startsWith("/prodashboard") ? (
            <Routes>
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
              </Route>
            </Routes>
          ) : (
            <Routes>
              {/* Routes publiques et dashboard client */}
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

              <Route
                path="/dashboard"
                element={isAuthenticated ? <DashboardLayout /> : <Home />}
              >
                <Route index element={<DashboardHome />} />
                <Route
                  path="reservations"
                  element={<DashboardReservations />}
                />
                <Route path="new" element={<DashboardNew />} />
                <Route path="account" element={<DashboardAccount />} />
                <Route path="settings" element={<DashboardSettings />} />
                <Route path="more" element={<DashboardMore />} />
              </Route>
            </Routes>
          )}
        </main>

        {/* 🔹 LOGIN MODAL */}
        {showLogin && (
          <LoginModal
            onClose={() => setShowLogin(false)}
            onSignup={() => {
              setShowLogin(false);
              setShowSignup(true);
            }}
          />
        )}

        {/* 🔹 SIGNUP MODAL */}
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

        {/* 🔹 UPGRADE MODAL */}
        {showUpgradeModal && <UpgradeToProModal onClose={closeUpgradeModal} />}

        {/* 🔹 PRO SIGNUP MODAL */}
        {showProSignup && (
          <ProSignupModal
            onClose={() => setShowProSignup(false)}
            onClientSignup={() => {
              setShowProSignup(false);
              setShowSignup(true);
            }}
          />
        )}

        {/* 🔹 DOWNLOAD MODAL */}
        {showDownload && (
          <DownloadModal onClose={() => setShowDownload(false)} />
        )}
      </div>
    </>
  );
}
