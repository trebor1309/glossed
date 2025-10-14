import { motion } from "framer-motion";
import { Smartphone, MapPin, CalendarCheck, Star } from "lucide-react";

export default function About() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="max-w-6xl mx-auto px-6 py-20"
    >
      {/* Header */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center bg-rose-100 text-rose-600 w-16 h-16 rounded-2xl mb-6">
          <Smartphone size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">How Glossed Works</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Beauty at your fingertips — discover how Glossed makes booking,
          enjoying, and managing beauty services effortless for everyone.
        </p>
      </div>

      {/* Section: Steps */}
      <section className="grid md:grid-cols-3 gap-10 mb-24">
        {/* Step 1 */}
        <div className="bg-white rounded-2xl p-8 shadow border border-rose-50 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-rose-100 text-rose-600 p-3 rounded-xl">
              <MapPin size={22} />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">
              1. Choose your location
            </h2>
          </div>
          <p className="text-gray-600 leading-relaxed">
            Simply enter your address and we’ll connect you with verified beauty
            professionals available in your area. Glossed automatically finds
            trusted experts near you.
          </p>
        </div>

        {/* Step 2 */}
        <div className="bg-white rounded-2xl p-8 shadow border border-rose-50 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-rose-100 text-rose-600 p-3 rounded-xl">
              <CalendarCheck size={22} />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">
              2. Pick your service & time
            </h2>
          </div>
          <p className="text-gray-600 leading-relaxed">
            From hair styling and makeup to nails and skincare, select your
            service and your preferred time slot. You’ll instantly see available
            professionals ready to take your booking.
          </p>
        </div>

        {/* Step 3 */}
        <div className="bg-white rounded-2xl p-8 shadow border border-rose-50 hover:shadow-lg transition">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-rose-100 text-rose-600 p-3 rounded-xl">
              <Star size={22} />
            </div>
            <h2 className="text-xl font-semibold text-gray-800">
              3. Relax and enjoy
            </h2>
          </div>
          <p className="text-gray-600 leading-relaxed">
            Your chosen professional comes directly to you — on time, with all
            the essentials. No salon wait, no stress. Just beauty, wherever you
            are.
          </p>
        </div>
      </section>

      {/* Section: Why choose Glossed */}
      <section className="text-center mb-24">
        <h2 className="text-3xl font-semibold mb-6 text-gray-800">
          Why Choose Glossed?
        </h2>
        <div className="grid md:grid-cols-2 gap-12 text-left">
          <div className="space-y-5">
            <p className="text-gray-600 leading-relaxed">
              Traditional beauty appointments can be complicated — long waits,
              traffic, limited opening hours. Glossed removes the friction by
              bringing top professionals directly to your door, 7 days a week.
            </p>
            <p className="text-gray-600 leading-relaxed">
              With built-in scheduling, secure payments, and verified reviews,
              Glossed gives clients peace of mind and helps professionals focus
              on what they do best : making people feel beautiful.
            </p>
          </div>
          <div>
            <img
              src="/images/about-howitworks.jpg"
              alt="Glossed booking steps illustration"
              className="rounded-2xl shadow-md w-full object-cover h-[350px]"
            />
          </div>
        </div>
      </section>

      {/* Section: Dual value (clients & pros) */}
      <section className="grid md:grid-cols-2 gap-10 mb-24">
        <div className="p-8 bg-gradient-to-br from-rose-50 to-white rounded-2xl shadow text-center border border-rose-100">
          <h3 className="text-2xl font-semibold text-rose-600 mb-3">
            For Clients
          </h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            Discover, book, and enjoy high-end beauty services at home. Perfect
            for weddings, events, or simply treating yourself — all managed from
            one elegant app.
          </p>
          <a
            href="/dashboard/new"
            className="inline-block bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-2 rounded-full font-semibold hover:scale-105 transition"
          >
            Try Glossed Now
          </a>
        </div>

        <div className="p-8 bg-gradient-to-br from-gray-50 to-white rounded-2xl shadow text-center border border-gray-100">
          <h3 className="text-2xl font-semibold text-gray-800 mb-3">
            For Professionals
          </h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            Join our growing network of independent stylists and artists.
            Manage your appointments, payments and clients easily — Glossed
            helps you grow your brand, not just your bookings.
          </p>
          <a
            href="/prodashboard"
            className="inline-block border border-rose-400 text-rose-600 px-5 py-2 rounded-full font-semibold hover:bg-rose-50 transition"
          >
            Join as a Pro
          </a>
        </div>
      </section>

      {/* CTA final */}
      <div className="text-center">
        <h3 className="text-2xl font-semibold mb-4 text-gray-800">
          Glossed makes beauty simple.
        </h3>
        <p className="text-gray-600 mb-6">
          Whether you’re booking your next appointment or building your beauty
          career, Glossed is here to make it seamless, flexible, and fabulous.
        </p>
        <a
          href="/dashboard/new"
          className="inline-block bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-3 rounded-full hover:scale-105 transition"
        >
          Get Started
        </a>
      </div>
    </motion.div>
  );
}
