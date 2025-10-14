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

export default function App() {
  const { user, isAuthenticated, isPro, isClient, logout } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const isMobile = useIsMobile(768);

  const [isOpen, setIsOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showProSignup, setShowProSignup] = useState(false);
  const [showDownload, setShowDownload] = useState(false);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  const GOOGLE_LIBRARIES = ["places"];

  const isDashboard =
    location.pathname.startsWith("/dashboard") ||
    location.pathname.startsWith("/prodashboard");

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
                      onClick={() => setShowLogin(true)} // 👉 ouvre la modale au lieu de login direct
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

            {/* Mobile Menu */}
            <div
              className={`md:hidden flex flex-col gap-4 px-6 pb-6 bg-white/95 backdrop-blur-lg shadow-md transition-all duration-300 ease-in-out overflow-hidden ${
                isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
              }`}
            >
              <a
                href="/"
                onClick={() => setIsOpen(false)}
                className="text-sm font-medium hover:text-rose-600 transition-all duration-300"
              >
                Home
              </a>
              <a
                href="/about"
                onClick={() => setIsOpen(false)}
                className="text-sm font-medium hover:text-rose-600 transition-all duration-300"
              >
                About
              </a>
              <a
                href="/services"
                onClick={() => setIsOpen(false)}
                className="text-sm font-medium hover:text-rose-600 transition-all duration-300"
              >
                Services
              </a>

              {!isAuthenticated ? (
                <>
                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setShowLogin(true); // ✅ ouvre la modale client au lieu de login auto
                    }}
                    className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-6 py-3 rounded-full text-sm font-semibold hover:shadow-md hover:scale-105 transition-all duration-300 text-center mx-auto w-auto"
                  >
                    Sign in
                  </button>

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      setShowProSignup(true);
                    }}
                    className="text-rose-600 border border-rose-300 px-5 py-2 rounded-full text-sm font-semibold hover:bg-rose-50 hover:border-rose-400 hover:text-rose-700 transition-all duration-300 text-center mx-auto w-fit"
                  >
                    Pro Space
                  </button>
                </>
              ) : (
                <>
                  <a
                    href={isPro ? "/prodashboard" : "/dashboard"}
                    onClick={() => setIsOpen(false)}
                    className="text-rose-600 font-semibold hover:text-rose-700 transition-all duration-300 text-center"
                  >
                    Dashboard
                  </a>

                  <button
                    onClick={() => {
                      setIsOpen(false);
                      logout();
                    }}
                    className="text-gray-700 border border-gray-200 px-5 py-2 rounded-full text-sm font-semibold hover:bg-gray-100 transition-all duration-300 text-center mx-auto w-fit"
                  >
                    Log out
                  </button>
                </>
              )}
            </div>
          </nav>
        )}

        <ScrollToTop />

        {/* Routes */}
        <main className="flex-grow">
          {location.pathname.startsWith("/prodashboard") ? (
            // 💼 Pro dashboard (sans Google Maps)
            <Routes>
              <Route
                path="/prodashboard"
                element={
                  isAuthenticated && isPro && user.roles.includes("pro") ? (
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
            // 🧴 Pages publiques + client dashboard (avec Google Maps)
            <LoadScript
              googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
              libraries={GOOGLE_LIBRARIES}
            >
              <Routes>
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
            </LoadScript>
          )}
        </main>

        {/* Footer */}
        {!(isDashboard && isMobile) && (
          <footer className="bg-gradient-to-b from-gray-900 to-black text-white">
            <div className="max-w-6xl mx-auto px-6 md:px-16 py-16">
              <div className="grid md:grid-cols-4 gap-8 mb-12">
                <div className="col-span-2">
                  <Logo size="text-3xl" variant="light" />
                  <p className="text-gray-400 mb-6 max-w-md leading-relaxed mt-4">
                    Experience beauty services like never before — professional,
                    convenient, and always on-demand.
                  </p>
                  <div className="flex gap-4 mt-4">
                    <a
                      href="#"
                      className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gradient-to-r hover:from-rose-500 hover:to-red-500 transition-all duration-300 transform hover:scale-110"
                    >
                      <Facebook />
                    </a>
                    <a
                      href="#"
                      className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gradient-to-r hover:from-rose-500 hover:to-red-500 transition-all duration-300 transform hover:scale-110"
                    >
                      <Instagram />
                    </a>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-4 text-white">Company</h4>
                  <div className="space-y-3 text-gray-400">
                    <a
                      href="/about-us"
                      className="block hover:text-rose-400 transition-colors duration-300"
                    >
                      About Us
                    </a>
                    <a
                      href="/careers"
                      className="block hover:text-rose-400 transition-colors duration-300"
                    >
                      Careers
                    </a>
                    <a
                      href="/press"
                      className="block hover:text-rose-400 transition-colors duration-300"
                    >
                      Press
                    </a>
                    <a
                      href="/blog"
                      className="block hover:text-rose-400 transition-colors duration-300"
                    >
                      Blog
                    </a>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-4 text-white">Support</h4>
                  <div className="space-y-3 text-gray-400">
                    <a
                      href="/help-center"
                      className="block hover:text-rose-400 transition-colors duration-300"
                    >
                      Help Center
                    </a>
                    <a
                      href="/contact"
                      className="block hover:text-rose-400 transition-colors duration-300"
                    >
                      Contact
                    </a>
                    <a
                      href="/faq"
                      className="block hover:text-rose-400 transition-colors duration-300"
                    >
                      FAQ
                    </a>
                    <a
                      href="/safety"
                      className="block hover:text-rose-400 transition-colors duration-300"
                    >
                      Safety
                    </a>
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
                <p className="text-gray-500 text-sm">
                  &copy; 2025 Glossed. All rights reserved.
                </p>
                <div className="flex gap-6 text-sm text-gray-500 mt-4 md:mt-0">
                  <a
                    href="/legal"
                    className="hover:text-rose-400 transition-colors duration-300"
                  >
                    Legal
                  </a>
                  <a
                    href="/privacy"
                    className="hover:text-rose-400 transition-colors duration-300"
                  >
                    Privacy Policy
                  </a>
                  <a
                    href="/terms"
                    className="hover:text-rose-400 transition-colors duration-300"
                  >
                    Terms of Service
                  </a>
                </div>
              </div>
            </div>
          </footer>
        )}
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

        {/* 🔹 Upgrade Modal contrôlé par main.jsx */}
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
