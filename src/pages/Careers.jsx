import { motion } from "framer-motion";
import { Briefcase, Sparkles, HeartHandshake } from "lucide-react";

export default function Careers() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="max-w-5xl mx-auto px-6 py-20"
    >
      {/* Header */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center bg-rose-100 text-rose-600 w-16 h-16 rounded-2xl mb-6">
          <Briefcase size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Careers at Glossed</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Help us shape the future of beauty-on-demand. Whether you're a
          creative, a developer, or a beauty professional, your talent can make
          Glossed shine brighter.
        </p>
      </div>

      {/* Image / hero */}
      <div className="rounded-3xl overflow-hidden shadow-lg mb-16">
        <img
          src="/images/careers-hero.jpg"
          alt="Glossed team working"
          className="w-full h-[400px] object-cover"
        />
      </div>

      {/* Section: Open Positions */}
      <section className="mb-20 text-center">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">
          Current Openings
        </h2>
        <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
          At the moment, there are no open positions. But we're always looking
          for passionate people who love innovation, creativity and good
          energy.
        </p>

        <div className="inline-block bg-white border border-rose-100 rounded-2xl shadow-md px-6 py-8 text-left max-w-md mx-auto">
          <p className="text-gray-700 leading-relaxed mb-4">
            Send us a spontaneous application at{" "}
            <a
              href="mailto:jobs@glossed.app"
              className="text-rose-600 font-medium underline hover:text-rose-700"
            >
              jobs@glossed.app
            </a>{" "}
            — we carefully review each message and keep profiles that fit our
            upcoming needs.
          </p>
          <p className="text-sm text-gray-500">
            We value authentic people, initiative and the desire to grow
            together.
          </p>
        </div>
      </section>

      {/* Section: Join as a Pro */}
      <section className="text-center mb-24">
        <div className="inline-flex items-center justify-center bg-rose-100 text-rose-600 w-16 h-16 rounded-2xl mb-4">
          <HeartHandshake size={28} />
        </div>
        <h2 className="text-2xl font-semibold mb-3 text-gray-800">
          You’re a beauty professional?
        </h2>
        <p className="text-gray-600 max-w-2xl mx-auto mb-6">
          Whether you’re a makeup artist, hair stylist, nail expert or esthetician —
          Glossed helps you work on your own terms. Join our growing network of
          verified professionals and bring your talent directly to clients.
        </p>

        <a
          href="/prodashboard"
          className="inline-block bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-3 rounded-full hover:scale-105 transition"
        >
          Join as a Pro
        </a>
      </section>

      {/* Section: Why work with us */}
      <section className="text-center">
        <h2 className="text-3xl font-semibold mb-10 text-gray-800">
          Why Work at Glossed?
        </h2>

        <div className="grid md:grid-cols-3 gap-8 text-left">
          <div className="bg-white p-6 rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
            <h3 className="text-xl font-semibold text-rose-600 mb-3">
              Impact
            </h3>
            <p className="text-gray-600 leading-relaxed">
              We’re creating a product that changes how people experience beauty
              every day — both for clients and professionals.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
            <h3 className="text-xl font-semibold text-rose-600 mb-3">
              Flexibility
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Remote-friendly, human-first. Work when and how you’re at your
              best — creativity doesn’t have office hours.
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
            <h3 className="text-xl font-semibold text-rose-600 mb-3">
              Passion & Team
            </h3>
            <p className="text-gray-600 leading-relaxed">
              We’re a small but growing team driven by passion, kindness and a
              shared vision of accessible beauty for all.
            </p>
          </div>
        </div>
      </section>
    </motion.div>
  );
}
