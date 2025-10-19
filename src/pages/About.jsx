import { motion } from "framer-motion";
import { Smartphone, MapPin, CalendarCheck, Star } from "lucide-react";
import GlossedImage from "@/components/GlossedImage";

export default function About() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="max-w-6xl mx-auto px-6 py-20 text-gray-800 relative"
    >
      {/* Background subtle gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-rose-50 via-white to-amber-50 -z-10"></div>

      {/* Header */}
      <div className="text-center mb-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="inline-flex items-center justify-center bg-gradient-to-r from-rose-100 to-amber-100 text-rose-600 w-16 h-16 rounded-2xl mb-6 shadow-inner"
        >
          <Smartphone size={30} />
        </motion.div>
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-rose-600 to-red-600 bg-clip-text text-transparent">
          How Glossed Works
        </h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Beauty at your fingertips — discover how Glossed makes booking, enjoying, and managing
          beauty services effortless for everyone.
        </p>
      </div>

      {/* Steps */}
      <section className="grid md:grid-cols-3 gap-10 mb-24">
        {[
          {
            icon: <MapPin size={22} />,
            title: "1. Choose your location",
            text: "Simply enter your address and we’ll connect you with verified beauty professionals available in your area.",
            color: "rose",
          },
          {
            icon: <CalendarCheck size={22} />,
            title: "2. Pick your service & time",
            text: "From hair styling and makeup to nails and skincare, select your service and your preferred time slot.",
            color: "amber",
          },
          {
            icon: <Star size={22} />,
            title: "3. Relax and enjoy",
            text: "Your chosen professional comes directly to you — on time, with all the essentials. No salon wait, no stress.",
            color: "pink",
          },
        ].map((step, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.15 }}
            className="bg-white rounded-2xl p-8 shadow-md border border-rose-50 hover:shadow-lg hover:scale-[1.02] transition-all relative overflow-hidden group"
          >
            {/* glossy light overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-rose-50/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>

            <div className="flex items-center gap-3 mb-4">
              <div className={`bg-${step.color}-100 text-${step.color}-600 p-3 rounded-xl`}>
                {step.icon}
              </div>
              <h2 className="text-xl font-semibold text-gray-800">{step.title}</h2>
            </div>
            <p className="text-gray-600 leading-relaxed">{step.text}</p>
          </motion.div>
        ))}
      </section>

      {/* Why choose Glossed */}
      <section className="text-center mb-24">
        <h2 className="text-3xl font-bold mb-10 text-gray-900">
          Why Choose <span className="text-rose-600">Glossed?</span>
        </h2>
        <div className="grid md:grid-cols-2 gap-12 items-center text-left">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-5"
          >
            <p className="text-gray-600 leading-relaxed">
              Traditional beauty appointments can be complicated — long waits, traffic, limited
              opening hours. Glossed removes the friction by bringing top professionals directly to
              your door, 7 days a week.
            </p>
            <p className="text-gray-600 leading-relaxed">
              With built-in scheduling, secure payments, and verified reviews, Glossed gives clients
              peace of mind and helps professionals focus on what they do best : making people feel
              beautiful.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="flex justify-center"
          >
            <GlossedImage
              src="https://images.unsplash.com/photo-1612883695890-f2ab22e65215?ixlib=rb-4.1.0&auto=format&fit=crop"
              alt="Glossed booking steps illustration"
              size="lg"
            />
          </motion.div>
        </div>
      </section>

      {/* Dual value (Clients / Pros) */}
      <section className="grid md:grid-cols-2 gap-10 mb-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="p-8 bg-gradient-to-br from-rose-50 to-white rounded-2xl shadow text-center border border-rose-100 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
          <h3 className="text-2xl font-semibold text-rose-600 mb-3">For Clients</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            Discover, book, and enjoy high-end beauty services at home. Perfect for weddings,
            events, or simply treating yourself — all managed from one elegant app.
          </p>
          <a
            href="/dashboard/new"
            className="inline-block bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-2 rounded-full font-semibold hover:scale-105 transition"
          >
            Try Glossed Now
          </a>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="p-8 bg-gradient-to-br from-gray-50 to-white rounded-2xl shadow text-center border border-gray-100 relative overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-white/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700"></div>
          <h3 className="text-2xl font-semibold text-gray-800 mb-3">For Professionals</h3>
          <p className="text-gray-600 leading-relaxed mb-4">
            Join our growing network of independent stylists and artists. Manage your appointments,
            payments and clients easily — Glossed helps you grow your brand, not just your bookings.
          </p>
          <a
            href="/prodashboard"
            className="inline-block border border-rose-400 text-rose-600 px-5 py-2 rounded-full font-semibold hover:bg-rose-50 transition"
          >
            Join as a Pro
          </a>
        </motion.div>
      </section>

      {/* CTA final */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="text-center mt-12"
      >
        <h3 className="text-2xl font-semibold mb-4 text-gray-800">Glossed makes beauty simple.</h3>
        <p className="text-gray-600 mb-6 max-w-xl mx-auto">
          Whether you’re booking your next appointment or building your beauty career, Glossed is
          here to make it seamless, flexible, and fabulous.
        </p>
        <a
          href="/dashboard/new"
          className="inline-block bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-3 rounded-full hover:scale-105 transition"
        >
          Get Started
        </a>
      </motion.div>
    </motion.div>
  );
}
