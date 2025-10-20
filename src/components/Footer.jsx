import { Facebook, Instagram } from "lucide-react";
import Logo from "@/components/Logo";

export default function Footer() {
  return (
    <footer className="bg-gradient-to-b from-gray-900 to-black text-white">
      <div className="max-w-6xl mx-auto px-6 md:px-16 py-16">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2">
            <Logo size="text-3xl" variant="light" />
            <p className="text-gray-400 mb-6 max-w-md leading-relaxed mt-4">
              Experience beauty services like never before — professional, convenient, and always
              on-demand.
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
              <a href="/press" className="block hover:text-rose-400 transition-colors duration-300">
                Press
              </a>
              <a href="/blog" className="block hover:text-rose-400 transition-colors duration-300">
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
              <a href="/faq" className="block hover:text-rose-400 transition-colors duration-300">
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
            &copy; {new Date().getFullYear()} Glossed. All rights reserved.
          </p>
          <div className="flex gap-6 text-sm text-gray-500 mt-4 md:mt-0">
            <a href="/legal" className="hover:text-rose-400 transition-colors duration-300">
              Legal
            </a>
            <a href="/privacy" className="hover:text-rose-400 transition-colors duration-300">
              Privacy Policy
            </a>
            <a href="/terms" className="hover:text-rose-400 transition-colors duration-300">
              Terms of Service
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
