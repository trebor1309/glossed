// src/App.jsx
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

import Navbar from "@/components/navigation/NavbarMain";
import Footer from "@/components/Footer";
import Logo from "@/components/Logo";
import ScrollToTop from "@/components/ScrollToTop";

import LoginModal from "@/components/modals/LoginModal";
import SignupModal from "@/components/modals/SignupModal";
import DownloadModal from "@/components/modals/DownloadModal";

import { useUser } from "@/context/UserContext";
import AppRouter from "@/router/AppRouter";

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
  const { user, isAuthenticated, isPro, logout, loading } = useUser();
  const location = useLocation();
  const isMobile = useIsMobile(768);

  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  const isDashboardRoute =
    location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/prodashboard");

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

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-white text-gray-900 font-sans">
      {!isDashboardRoute && (
        <Navbar
          isAuthenticated={isAuthenticated}
          isPro={isPro}
          user={user}
          logout={logout}
          onOpenLogin={() => setShowLogin(true)}
          onOpenProSignup={() => setShowSignup(true)} // même modal que signup
          isMobile={isMobile}
        />
      )}

      <ScrollToTop />

      <main className="flex-grow">
        <AppRouter
          isAuthenticated={isAuthenticated}
          isPro={isPro}
          user={user}
          onOpenLogin={() => setShowLogin(true)}
          onOpenSignup={() => setShowSignup(true)}
          onOpenDownload={() => setShowDownload(true)}
        />
      </main>

      {!isDashboardRoute && <Footer />}

      {/* Modales globales */}
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
        />
      )}

      {showDownload && <DownloadModal onClose={() => setShowDownload(false)} />}
    </div>
  );
}
