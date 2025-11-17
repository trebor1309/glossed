// src/components/navigation/NavbarMain.jsx
import { useState } from "react";
import { Facebook, Instagram } from "lucide-react";
import Logo from "@/components/Logo";

export default function Navbar({
  isAuthenticated,
  isPro,
  user,
  logout,
  onOpenLogin,
  onOpenProSignup,
  isDashboard = false,
  isMobile = false,
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (isDashboard && isMobile) return null;

  return (
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
            href={isAuthenticated ? (isPro ? "/prodashboard" : "/dashboard") : "/"}
            className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
          >
            {isAuthenticated ? "Dashboard" : "Home"}
          </a>

          {isAuthenticated && (
            <a
              href="/chat"
              className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              Messages
            </a>
          )}

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
        {/* ... (inchangé en dehors de ça) ... */}

        {/* Burger (mobile) */}
        {/* ... */}
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

        {isAuthenticated && (
          <a
            href="/chat"
            onClick={() => setIsOpen(false)}
            className="text-sm font-medium hover:text-rose-600 transition-all duration-300"
          >
            Messages
          </a>
        )}

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

        {/* le reste (sign in / pro space / dashboard / logout) reste identique */}
      </div>
    </nav>
  );
}
