import { motion } from "framer-motion";
import {
  LifeBuoy,
  Search,
  Users,
  HeartHandshake,
  CreditCard,
  ShieldCheck,
  Mail,
} from "lucide-react";

export default function HelpCenter() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="max-w-6xl mx-auto px-6 py-20"
    >
      {/* Header */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center bg-rose-100 text-rose-600 w-16 h-16 rounded-2xl mb-6">
          <LifeBuoy size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Help Center</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          We’re here to help you make the most of Glossed. Browse our resources or contact our team
          — we’ll get back to you quickly.
        </p>
      </div>

      {/* Search Bar (factice) */}
      <div className="max-w-lg mx-auto mb-20 relative">
        <input
          type="text"
          placeholder="Search help articles..."
          className="w-full border border-gray-300 rounded-full px-5 py-3 pl-12 focus:outline-none focus:border-rose-400"
        />
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
      </div>

      {/* Categories */}
      <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 mb-24">
        {/* For Clients */}
        <div className="bg-white p-8 rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-3">
            <Users className="text-rose-600" size={24} />
            <h2 className="text-xl font-semibold text-gray-800">For Clients</h2>
          </div>
          <p className="text-gray-600 text-sm mb-4 leading-relaxed">
            Learn how to book, manage your reservations, and get the best experience with Glossed
            services.
          </p>
          <ul className="text-sm text-rose-600 space-y-2 font-medium">
            <li>
              <a href="/faq">How to book a service →</a>
            </li>
            <li>
              <a href="/faq">Payment methods and security →</a>
            </li>
            <li>
              <a href="/contact">Cancel or reschedule an appointment →</a>
            </li>
          </ul>
        </div>

        {/* For Professionals */}
        <div className="bg-white p-8 rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-3">
            <HeartHandshake className="text-rose-600" size={24} />
            <h2 className="text-xl font-semibold text-gray-800">For Professionals</h2>
          </div>
          <p className="text-gray-600 text-sm mb-4 leading-relaxed">
            Resources and guides for beauty professionals who want to join or manage their Glossed
            accounts.
          </p>
          <ul className="text-sm text-rose-600 space-y-2 font-medium">
            <li>
              <a href="/faq">Becoming a Glossed Pro →</a>
            </li>
            <li>
              <a href="/faq">Payments & payouts →</a>
            </li>
            <li>
              <a href="/contact">Support for existing pros →</a>
            </li>
          </ul>
        </div>

        {/* Other Topics */}
        <div className="bg-white p-8 rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-3">
            <CreditCard className="text-rose-600" size={24} />
            <h2 className="text-xl font-semibold text-gray-800">Other Topics</h2>
          </div>
          <p className="text-gray-600 text-sm mb-4 leading-relaxed">
            Security, hygiene standards, and all the extra information you may need about Glossed’s
            commitments.
          </p>
          <ul className="text-sm text-rose-600 space-y-2 font-medium">
            <li>
              <a href="/safety">Safety & hygiene policies →</a>
            </li>
            <li>
              <a href="/privacy">Privacy & data protection →</a>
            </li>
            <li>
              <a href="/contact">General contact →</a>
            </li>
          </ul>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Still need help?</h2>
        <p className="text-gray-600 mb-6">
          Our support team is available 7 days a week to assist you with any issue or question.
        </p>
        <a
          href="/contact"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-red-600 text-white px-6 py-3 rounded-full font-semibold hover:scale-105 transition"
        >
          <Mail size={18} />
          Contact Support
        </a>
      </div>
    </motion.div>
  );
}
