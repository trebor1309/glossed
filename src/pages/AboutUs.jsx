import { motion } from "framer-motion";
import { Users, Sparkles, Scissors } from "lucide-react";

export default function AboutUs() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="max-w-6xl mx-auto px-6 py-20"
    >
      {/* Header */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center bg-gradient-to-r from-rose-100 to-pink-100 text-rose-600 w-16 h-16 rounded-2xl mb-6">
          <Users size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">The Story Behind Glossed</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Created in 2025, <strong>Glossed</strong> was born from a simple idea:
          making professional beauty services as accessible and effortless as
          ordering your favorite coffee.
        </p>
      </div>

      {/* Hero image */}
      <div className="rounded-3xl overflow-hidden shadow-lg mb-16">
        <img
          src="/images/about-glossed-hero.jpg"
          alt="Glossed beauty services at home"
          className="w-full h-[400px] object-cover"
        />
      </div>

      {/* Section: Mission */}
      <section className="grid md:grid-cols-2 gap-12 items-center mb-20">
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
            <Sparkles className="text-rose-500" size={22} /> Our Mission
          </h2>
          <p className="text-gray-600 leading-relaxed">
            We believe that beauty shouldn’t depend on time, traffic or
            geography. <strong>Glossed</strong> connects clients with verified
            professionals who bring their skills directly to your home — for a
            makeup session before a wedding, a quick hairstyle before an event,
            or a moment of self-care after a long week.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Our goal is to make every appointment seamless, elegant and
            personalized. We want beauty to fit <em>your life</em>, not the
            other way around.
          </p>
        </div>

        <div>
          <img
            src="/images/about-team-hair.jpg"
            alt="Professional hair stylist on mission"
            className="rounded-2xl shadow-md w-full object-cover h-[350px]"
          />
        </div>
      </section>

      {/* Section: Origins */}
      <section className="grid md:grid-cols-2 gap-12 items-center mb-20">
        <div className="order-2 md:order-1">
          <img
            src="/images/about-team-makeup.jpg"
            alt="Glossed professional doing makeup"
            className="rounded-2xl shadow-md w-full object-cover h-[350px]"
          />
        </div>
        <div className="space-y-6 order-1 md:order-2">
          <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
            <Scissors className="text-rose-500" size={22} /> How It All Started
          </h2>
          <p className="text-gray-600 leading-relaxed">
            The project began when our founders — a designer, a developer and a
            makeup artist — noticed how hard it could be to find skilled beauty
            professionals who were both available and flexible.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Between busy schedules, last-minute events and a growing demand for
            convenience, it became clear: <em>beauty needed to come to you.</em>{" "}
            What started as a small idea quickly turned into a mission to bring
            together the best independent professionals under one elegant,
            digital roof.
          </p>
        </div>
      </section>

      {/* Section: Values */}
      <section className="text-center mb-24">
        <h2 className="text-3xl font-semibold mb-6 text-gray-800">
          What We Stand For
        </h2>
        <div className="grid md:grid-cols-3 gap-10 text-left">
          <div className="p-6 bg-white rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
            <h3 className="text-xl font-semibold text-rose-600 mb-3">
              Accessibility
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Everyone deserves to feel confident and cared for, no matter where
              they live or how busy they are.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
            <h3 className="text-xl font-semibold text-rose-600 mb-3">
              Empowerment
            </h3>
            <p className="text-gray-600 leading-relaxed">
              We help independent professionals grow their business, manage
              their clients and showcase their talent.
            </p>
          </div>

          <div className="p-6 bg-white rounded-2xl shadow border border-rose-50 hover:shadow-lg transition">
            <h3 className="text-xl font-semibold text-rose-600 mb-3">
              Trust & Quality
            </h3>
            <p className="text-gray-600 leading-relaxed">
              Every pro is handpicked and verified to ensure clients enjoy a
              high-end, safe and comfortable experience.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <div className="text-center">
        <h3 className="text-2xl font-semibold mb-4 text-gray-800">
          Beauty, whenever and wherever you are.
        </h3>
        <p className="text-gray-600 mb-6">
          Join the Glossed experience — where professionals meet simplicity,
          elegance and confidence.
        </p>
        <a
          href="/dashboard/new"
          className="inline-block bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-3 rounded-full hover:scale-105 transition"
        >
          Book Your First Appointment
        </a>
      </div>
    </motion.div>
  );
}
