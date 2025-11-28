// 📄 src/App.jsx
import { useState } from "react";
import { useLocation } from "react-router-dom";
import AppRouter from "@/router/AppRouter";

import ScrollToTop from "@/components/ScrollToTop";
import Navbar from "@/components/navigation/NavbarMain";
import Footer from "@/components/Footer";

import LoginModal from "@/components/modals/LoginModal";
import SignupModal from "@/components/modals/SignupModal";
import ProSignupModal from "@/components/modals/ProSignupModal";
import DownloadModal from "@/components/modals/DownloadModal";
import UpgradeToProModal from "@/components/modals/UpgradeToProModal";

import { useUser } from "@/context/UserContext";

function useIsMobile(breakpoint = 768) {
  return typeof window !== "undefined" && window.innerWidth < breakpoint;
}

export default function App() {
  const { user, isAuthenticated, isPro, logout, showUpgradeModal, setShowUpgradeModal, loading } =
    useUser();

  const location = useLocation(); // <— on met les hooks AVANT tout return
  const isMobile = useIsMobile(768);

  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showProSignup, setShowProSignup] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  const isDashboardRoute =
    location.pathname.startsWith("/dashboard") || location.pathname.startsWith("/prodashboard");

  // ❗️Le return conditionnel ne vient qu'après TOUS les hooks
  if (loading) return null;

  return (
    <div className="min-h-screen flex flex-col text-gray-900">
      {!isDashboardRoute && (
        <Navbar
          isAuthenticated={isAuthenticated}
          isPro={isPro}
          user={user}
          logout={logout}
          onOpenLogin={() => setShowLogin(true)}
          onOpenSignup={() => setShowSignup(true)}
          onOpenProSignup={() => setShowProSignup(true)}
          onOpenDownload={() => setShowDownload(true)}
          isMobile={isMobile}
        />
      )}

      <ScrollToTop />

      <main className="flex-grow">
        <AppRouter />
      </main>

      {!isDashboardRoute && <Footer />}

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

      {showUpgradeModal && <UpgradeToProModal onClose={() => setShowUpgradeModal(false)} />}
    </div>
  );
}
