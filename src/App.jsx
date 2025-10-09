import Home from "./pages/Home";
import { Facebook, Instagram } from "lucide-react";
import { useState } from "react";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import Logo from "./components/Logo";
import { Routes, Route } from "react-router-dom";
import About from "./pages/About";
import Services from "./pages/Services";
import Legal from "./pages/Legal";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import FAQ from "./pages/FAQ";

export default function App() {
  const [isOpen, setIsOpen] = useState(false);

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
            <a
              href="/faq"
              className="text-gray-500 hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              FAQ
            </a>
          </div>

          {/* Auth & CTA */}
          <div className="hidden md:flex items-center gap-5">
            <a
              href="#"
              className="text-sm font-medium text-gray-700 hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              Sign in
            </a>
            <a
              href="#"
              className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:shadow-md hover:scale-105 transition-all duration-300"
            >
              Book now
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
          {["Home", "About", "Services", "FAQ"].map((item) => (
            <a
              key={item}
              href={`/${item.toLowerCase()}`}
              onClick={() => setIsOpen(false)}
              className="text-sm font-medium hover:text-rose-600 transition-all duration-300"
            >
              {item}
            </a>
          ))}
          <a
            href="#"
            onClick={() => setIsOpen(false)}
            className="text-sm font-medium hover:text-rose-600 transition-all duration-300"
          >
            Sign in
          </a>
          <a
            href="#"
            onClick={() => setIsOpen(false)}
            className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-2 rounded-full text-sm font-medium hover:shadow-lg hover:scale-105 transition-all duration-300 text-center"
          >
            Book now
          </a>
        </div>
      </nav>

      {/* Routes (pages visibles selon l'URL) */}
      <main className="flex-grow">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/services" element={<Services />} />
          <Route path="/legal" element={<Legal />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/faq" element={<FAQ />} />
        </Routes>
      </main>

      {/* Footer */}
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

            <div>
              <h4 className="font-semibold mb-4 text-white">Company</h4>
              <div className="space-y-3 text-gray-400">
                {["About Us", "Careers", "Press", "Blog"].map((link) => (
                  <a
                    key={link}
                    href="#"
                    className="block hover:text-rose-400 transition-colors duration-300"
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-4 text-white">Support</h4>
              <div className="space-y-3 text-gray-400">
                {["Help Center", "Contact", "FAQ", "Safety"].map((link) => (
                  <a
                    key={link}
                    href="#"
                    className="block hover:text-rose-400 transition-colors duration-300"
                  >
                    {link}
                  </a>
                ))}
              </div>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-gray-500 text-sm">
              &copy; 2025 Glossed. All rights reserved.
            </p>
            <div className="flex gap-6 text-sm text-gray-500 mt-4 md:mt-0">
              {["Legal", "Privacy Policy", "Terms of Service", "Cookies"].map(
                (link) => (
                  <a
                    key={link}
                    href="#"
                    className="hover:text-rose-400 transition-colors duration-300"
                  >
                    {link}
                  </a>
                )
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
