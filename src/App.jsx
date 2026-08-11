// 📄 src/App.jsx
import { lazy, Suspense, useState } from "react";
import { useLocation } from "react-router-dom";
import AppRouter from "@/router/AppRouter";

import ScrollToTop from "@/components/ScrollToTop";
import Navbar from "@/components/navigation/NavbarMain";
import Footer from "@/components/Footer";

import { useUser } from "@/context/UserContext";

const LoginModal = lazy(() => import("@/components/modals/LoginModal"));
const SignupModal = lazy(() => import("@/components/modals/SignupModal"));
const ProSignupModal = lazy(() => import("@/components/modals/ProSignupModal"));
const DownloadModal = lazy(() => import("@/components/modals/DownloadModal"));
const UpgradeToProModal = lazy(() => import("@/components/modals/UpgradeToProModal"));

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
        <AppRouter
          onOpenLogin={() => setShowLogin(true)}
          onOpenSignup={() => setShowSignup(true)}
          onOpenDownload={() => setShowDownload(true)}
        />
      </main>

      {!isDashboardRoute && <Footer />}

      <Suspense
        fallback={
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 text-sm text-gray-700"
            role="status"
            aria-live="polite"
          >
            Loading...
          </div>
        }
      >
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
      </Suspense>
    </div>
  );
}
