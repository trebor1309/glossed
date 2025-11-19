// src/components/navigation/NavbarMain.jsx
import { useState } from "react";
import { Facebook, Instagram } from "lucide-react";
import Logo from "@/components/Logo";
import { useNotifications } from "@/context/NotificationContext"; // ← NEW

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

  const { newMessages } = useNotifications(); // ← NEW

  // Cache la navbar sur mobile quand on est sur un dashboard
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
              href={isPro ? "/prodashboard/messages" : "/dashboard/messages"}
              className="relative hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              Messages
              {/* BADGE */}
              {newMessages > 0 && (
                <span className="absolute -top-2 -right-3 bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                  {newMessages}
                </span>
              )}
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

        {/* Auth & CTA (desktop) */}
        <div className="hidden md:flex items-center gap-5">
          {!isAuthenticated ? (
            <>
              <button
                onClick={onOpenLogin}
                className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:shadow-md hover:scale-105 transition-all duration-300"
              >
                Sign in
              </button>

              <button
                onClick={onOpenProSignup}
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

        {/* Burger menu */}
        <button
          className="md:hidden flex flex-col justify-between w-7 h-6 focus:outline-none"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span
            className={`h-[2px] bg-rose-600 rounded transition-transform duration-300 ease-in-out ${
              isOpen ? "rotate-45 translate-y-[10px]" : ""
            }`}
          />
          <span
            className={`h-[2px] bg-rose-600 rounded transition-all duration-300 ease-in-out ${
              isOpen ? "opacity-0" : "opacity-100"
            }`}
          />
          <span
            className={`h-[2px] bg-rose-600 rounded transition-transform duration-300 ease-in-out ${
              isOpen ? "-rotate-45 -translate-y-[10px]" : ""
            }`}
          />
        </button>
      </div>

      {/* Mobile Menu */}
      <div
        className={`md:hidden flex flex-col gap-4 px-6 pb-6 bg-white/95 backdrop-blur-lg shadow-md transition-all duration-300 ease-in-out overflow-hidden ${
          isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <a
          href={isAuthenticated ? (isPro ? "/prodashboard" : "/dashboard") : "/"}
          onClick={() => setIsOpen(false)}
          className="text-sm font-medium hover:text-rose-600 transition-all duration-300"
        >
          {isAuthenticated ? "Dashboard" : "Home"}
        </a>

        {isAuthenticated && (
          <a
            href={isPro ? "/prodashboard/messages" : "/dashboard/messages"}
            onClick={() => setIsOpen(false)}
            className="relative text-sm font-medium hover:text-rose-600 transition-all duration-300"
          >
            Messages
            {/* BADGE MOBILE */}
            {newMessages > 0 && (
              <span className="absolute -top-1 -right-3 bg-rose-600 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {newMessages}
              </span>
            )}
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

        {!isAuthenticated ? (
          <>
            <button
              onClick={() => {
                setIsOpen(false);
                onOpenLogin();
              }}
              className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-6 py-3 rounded-full text-sm font-semibold hover:shadow-md hover:scale-105 transition-all duration-300 text-center mx-auto w-auto"
            >
              Sign in
            </button>

            <button
              onClick={() => {
                setIsOpen(false);
                onOpenProSignup();
              }}
              className="text-rose-600 border border-rose-300 px-5 py-2 rounded-full text-sm font-semibold hover:bg-rose-50 hover:border-rose-400 hover:text-rose-700 transition-all duration-300 text-center mx-auto w-fit"
            >
              Pro Space
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setIsOpen(false);
              logout();
            }}
            className="text-gray-700 border border-gray-200 px-5 py-2 rounded-full text-sm font-semibold hover:bg-gray-100 transition-all duration-300 text-center mx-auto w-fit"
          >
            Log out
          </button>
        )}
      </div>
    </nav>
  );
}
