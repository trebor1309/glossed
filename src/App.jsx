import { Facebook, Instagram } from "lucide-react";
import { useState } from "react";
// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import Logo from "./components/Logo";

export default function App() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-amber-50 to-white text-gray-900 font-sans">
      {/* Navbar */}
      <nav className="backdrop-blur-sm bg-white/90 sticky top-0 z-50 border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 md:px-16 py-6">
          {/* Logo */}
          <a
            href="#home"
            className="group transform transition-all duration-300 hover:scale-110 active:scale-95"
          >
            <Logo size="text-3xl" />
          </a>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-10 text-sm font-medium">
            <a
              href="#home"
              className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              Home
            </a>
            <a
              href="#why"
              className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              About
            </a>
            <a
              href="#services"
              className="hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              Services
            </a>
            <a
              href="#for-pros"
              className="text-gray-500 hover:text-rose-600 transition-all duration-300 hover:scale-105"
            >
              For Professionals
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
          {["Home", "About", "Services", "For Professionals"].map((item) => (
            <a
              key={item}
              href="#"
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

      {/* Hero */}
      <section className="relative flex flex-col md:flex-row items-center justify-center px-4 sm:px-6 md:px-16 py-16 md:py-32 min-h-screen overflow-x-hidden bg-gradient-to-br from-amber-50 via-white to-rose-50">
        {/* Image de fond */}
        <div
          className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1487412912498-0447578fcca8?q=80&w=2070&auto=format&fit=crop')]
    bg-cover bg-center opacity-30"
        ></div>

        <div className="absolute inset-0 bg-gradient-to-r from-rose-100/70 via-white/60 to-transparent backdrop-blur-[1px]"></div>

        <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10 text-center md:text-left">
          {/* Texte */}
          <motion.div
            className="max-w-lg mx-auto md:mx-0"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-block px-3 py-1.5 bg-rose-100 text-rose-700 rounded-full text-xs sm:text-sm font-medium mb-6 shadow-sm">
              Pro care at your doorstep
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Beauty,{" "}
              <span className="bg-gradient-to-r from-rose-600 to-red-600 bg-clip-text text-transparent">
                Delivered.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-gray-600 mb-6 leading-relaxed max-w-md mx-auto md:mx-0">
              Need salon-style hair, makeup or nails for an event—or just
              because?{" "}
              <span className="font-medium text-rose-600">Glossed</span> brings
              certified beauty pros to you, anytime, anywhere.
            </p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.7 }}
            >
              <a
                href="#"
                className="bg-gradient-to-r from-rose-600 to-red-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-full font-semibold hover:shadow-lg hover:scale-105 transition-all duration-300 w-full sm:w-auto"
              >
                Book now
              </a>
              <a
                href="#"
                className="text-gray-700 font-semibold hover:text-rose-600 transition-all duration-300 flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 border border-gray-200 rounded-full hover:border-rose-300 w-full sm:w-auto"
              >
                Learn more →
              </a>
            </motion.div>

            <motion.div
              className="flex flex-wrap justify-center md:justify-start gap-6 text-sm text-gray-500 mt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.8 }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>1000+ certified pros</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>50+ cities</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Image du Hero */}
          <motion.div
            className="relative mt-12 md:mt-0 group flex justify-center md:justify-end w-full md:w-auto"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.8, ease: "easeOut" }}
          >
            <div className="absolute -inset-6 bg-gradient-to-r from-amber-300 to-rose-400 rounded-3xl blur-3xl opacity-30"></div>
            <motion.img
              src="https://images.unsplash.com/photo-1602910344008-22f323cc1817?q=80&w=1740&auto=format&fit=crop"
              alt="Beauty service example"
              className="relative rounded-3xl shadow-2xl max-w-xs sm:max-w-sm md:max-w-md transform transition-transform duration-700 ease-out group-hover:scale-105"
            />
            <div className="absolute -bottom-6 -right-6 bg-white rounded-2xl p-4 shadow-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-rose-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold">
                  4.9
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Excellent</div>
                  <div className="text-sm text-gray-500">2,500+ reviews</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-16 py-24 bg-gradient-to-b from-white to-amber-50">
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-2 bg-rose-100 text-rose-700 rounded-full text-sm font-medium mb-4">
            Our promise
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Why <span className="text-rose-600">Glossed?</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            We bring professional care wherever you are — because confidence
            should always be within reach.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
          {/* Feature 1 */}
          <div className="flex flex-col items-center text-center group hover:scale-105 transition-all duration-300">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-400 to-red-400 rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
              <img
                src="https://images.unsplash.com/photo-1613966802194-d46a163af70d?q=80&w=1170&auto=format&fit=crop"
                alt="Makeup artist"
                className="w-24 h-24 object-cover rounded-full shadow-lg border-4 border-white relative z-10"
              />
            </div>
            <h3 className="font-bold text-2xl mb-3 text-gray-900">
              On-demand beauty
            </h3>
            <p className="text-gray-600 leading-relaxed text-lg max-w-xs">
              Book certified pros anytime, anywhere — from your sofa to your
              office.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col items-center text-center group hover:scale-105 transition-all duration-300">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-400 to-red-400 rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
              <img
                src="https://images.unsplash.com/photo-1638064432601-18b99cb31acb?q=80&w=685&auto=format&fit=crop"
                alt="Hair stylist"
                className="w-24 h-24 object-cover rounded-full shadow-lg border-4 border-white relative z-10"
              />
            </div>
            <h3 className="font-bold text-2xl mb-3 text-gray-900">
              Premium experience
            </h3>
            <p className="text-gray-600 leading-relaxed text-lg max-w-xs">
              Enjoy salon-quality results without leaving home.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col items-center text-center group hover:scale-105 transition-all duration-300">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-400 to-red-400 rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
              <img
                src="https://images.unsplash.com/photo-1690749138086-7422f71dc159?q=80&w=627&auto=format&fit=crop"
                alt="Manicure session"
                className="w-24 h-24 object-cover rounded-full shadow-lg border-4 border-white relative z-10"
              />
            </div>
            <h3 className="font-bold text-2xl mb-3 text-gray-900">
              For clients & pros
            </h3>
            <p className="text-gray-600 leading-relaxed text-lg max-w-xs">
              Join as a client or a beauty professional — Glossed empowers both
              sides.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-6 md:px-16 py-24 text-center text-white overflow-hidden">
        {/* Background image */}
        <img
          src="https://images.unsplash.com/photo-1667369039699-f30c4b863e51?q=80&w=1170&auto=format&fit=crop&w=1400&q=80"
          alt="Beauty service background"
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Overlay dégradé rosé */}
        <div className="absolute inset-0 bg-gradient-to-r from-rose-700/90 to-red-600/70"></div>

        {/* Contenu principal */}
        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-block px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-medium mb-6">
            Join the Glossed experience
          </div>

          <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Ready to <span className="text-amber-300">shine anywhere</span>?
          </h2>

          <p className="text-xl text-rose-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Book top beauty professionals wherever you are — for any look, any
            occasion. Discover the easiest way to feel your best, with Glossed.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <a
              href="#"
              className="bg-white text-rose-600 px-8 py-4 rounded-full font-bold hover:shadow-xl hover:scale-105 transition-all duration-300 text-lg"
            >
              Create your account
            </a>
            <a
              href="#"
              className="bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold hover:opacity-90 hover:shadow-lg hover:scale-105 transition-all duration-300 flex items-center gap-2 px-8 py-4 rounded-full"
            >
              Download app →
            </a>
          </div>
        </div>
      </section>

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

              {/* Social icons */}
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

            {/* Support links */}
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

          {/* Bottom section */}
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
