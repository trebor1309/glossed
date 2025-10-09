import Home from "./pages/Home";
import { Facebook, Instagram } from "lucide-react";
import { useState } from "react";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import Logo from "./components/Logo";
import { Routes, Route } from "react-router-dom";
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

export default function App() {
  const [isOpen, setIsOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showSignup, setShowSignup] = useState(false);
  const [showProSignup, setShowProSignup] = useState(false);
  const [showDownload, setShowDownload] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-white text-gray-900 font-sans">
      {/* Navbar */}
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
              href="/"
              className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              Home
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
            <a
              href="#"
              onClick={() => setShowLogin(true)}
              className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:shadow-md hover:scale-105 transition-all duration-300"
            >
              Sign in
            </a>
            <a
              href="#"
              onClick={() => setShowProSignup(true)}
              className="text-rose-600 border border-rose-300 px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-rose-50 hover:border-rose-400 hover:text-rose-700 hover:shadow-md hover:scale-105 transition-all duration-300"
            >
              Join as a Pro
            </a>
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

          {/* CTA principal */}
          <a
            href="#"
            onClick={() => {
              setIsOpen(false);
              setShowLogin(true);
            }}
            className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-6 py-3 rounded-full text-sm font-semibold hover:shadow-md hover:scale-105 transition-all duration-300 text-center mx-auto w-auto"
          >
            Sign in
          </a>

          {/* Lien secondaire */}
          <a
            href="#"
            onClick={() => {
              setIsOpen(false);
              setShowProSignup(true);
            }}
            className="text-rose-600 border border-rose-300 px-5 py-2 rounded-full text-sm font-semibold hover:bg-rose-50 hover:border-rose-400 hover:text-rose-700 transition-all duration-300 text-center mx-auto w-fit"
          >
            Join as a Pro
          </a>
        </div>
      </nav>
      <ScrollToTop />

      {/* Routes (pages visibles selon l'URL) */}
      <main className="flex-grow">
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
        </Routes>
      </main>

      {/* Footer */}
      <footer className="bg-gradient-to-b from-gray-900 to-black text-white">
        <div className="max-w-6xl mx-auto px-6 md:px-16 py-16">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            {/* Logo + description + socials */}
            <div className="col-span-2">
              <Logo size="text-3xl" variant="light" />
              <p className="text-gray-400 mb-6 max-w-md leading-relaxed mt-4">
                Experience beauty services like never before — professional,
                convenient, and always on-demand.
              </p>
              <div className="flex gap-4 mt-4">
                {[
                  { name: "Facebook", icon: "facebook", url: "#" },
                  { name: "Instagram", icon: "instagram", url: "#" },
                ].map((social) => (
                  <a
                    key={social.name}
                    href={social.url}
                    aria-label={social.name}
                    className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gradient-to-r hover:from-rose-500 hover:to-red-500 transition-all duration-300 transform hover:scale-110"
                  >
                    <i className={`bi bi-${social.icon} text-xl`}></i>
                  </a>
                ))}
              </div>
            </div>

            {/* Company links */}
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

            {/* Support links */}
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

          {/* Bottom section */}
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
              <a
                href="#"
                className="hover:text-rose-400 transition-colors duration-300"
              >
                Cookies
              </a>
            </div>
          </div>
        </div>
      </footer>
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
      {showDownload && <DownloadModal onClose={() => setShowDownload(false)} />}
    </div>
  );
}
