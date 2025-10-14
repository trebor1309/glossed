import { motion } from "framer-motion";
import {
  ShieldCheck,
  HeartHandshake,
  CreditCard,
  Sparkles,
  Users,
} from "lucide-react";

export default function Safety() {
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
          <ShieldCheck size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Safety & Trust</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          At Glossed, your safety and peace of mind are our top priorities.  
          Every professional and every booking is handled with care, transparency,  
          and respect — for both clients and pros.
        </p>
      </div>

      {/* Section 1: Verified Professionals */}
      <section className="grid md:grid-cols-2 gap-12 items-center mb-20">
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
            <Users className="text-rose-500" size={22} /> Verified & Trained Professionals
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Every professional on Glossed is carefully verified through identity
            checks, qualification reviews and profile validation.  
            Our onboarding includes guidance on customer service and hygiene best practices.
          </p>
          <p className="text-gray-600 leading-relaxed">
            We only collaborate with certified or experienced experts — makeup artists,
            hair stylists, nail technicians and skincare specialists — who meet our standards
            of professionalism and safety.
          </p>
        </div>
        <div>
          <img
            src="/images/safety-pros.jpg"
            alt="Certified beauty professional"
            className="rounded-2xl shadow-md w-full object-cover h-[350px]"
          />
        </div>
      </section>

      {/* Section 2: Hygiene & Clean Practices */}
      <section className="grid md:grid-cols-2 gap-12 items-center mb-20">
        <div className="order-2 md:order-1">
          <img
            src="/images/safety-hygiene.jpg"
            alt="Hygiene and beauty care tools"
            className="rounded-2xl shadow-md w-full object-cover h-[350px]"
          />
        </div>
        <div className="space-y-6 order-1 md:order-2">
          <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
            <Sparkles className="text-rose-500" size={22} /> Hygiene First
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Our professionals strictly follow hygiene and sanitization protocols for every
            appointment — including tool disinfection, single-use materials, and regular
            equipment checks.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Clients can also request extra precautions for sensitive skin or medical
            conditions. Your comfort and health always come first.
          </p>
        </div>
      </section>

      {/* Section 3: Secure Payments */}
      <section className="grid md:grid-cols-2 gap-12 items-center mb-20">
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold text-gray-800 flex items-center gap-2">
            <CreditCard className="text-rose-500" size={22} /> Secure & Transparent Payments
          </h2>
          <p className="text-gray-600 leading-relaxed">
            All payments on Glossed are processed through encrypted, PSD2-compliant gateways.
            Your financial information is never stored or shared with third parties.
          </p>
          <p className="text-gray-600 leading-relaxed">
            Professionals are paid automatically after each completed service, ensuring
            transparency and fairness for both sides. No cash exchange, no uncertainty.
          </p>
        </div>
        <div>
          <img
            src="/images/safety-payments.jpg"
            alt="Secure payment concept"
            className="rounded-2xl shadow-md w-full object-cover h-[350px]"
          />
        </div>
      </section>

      {/* Section 4: Mutual Respect & Support */}
      <section className="text-center mb-24">
        <div className="inline-flex items-center justify-center bg-rose-100 text-rose-600 w-16 h-16 rounded-2xl mb-4">
          <HeartHandshake size={28} />
        </div>
        <h2 className="text-2xl font-semibold mb-3 text-gray-800">
          Mutual Respect, Always
        </h2>
        <p className="text-gray-600 max-w-3xl mx-auto mb-4">
          Glossed was built on empathy and respect. Clients and professionals alike are
          expected to maintain a kind, respectful attitude — because true beauty
          thrives in trust and cooperation.
        </p>
        <p className="text-gray-600 max-w-3xl mx-auto mb-6">
          Our support team is always available to help resolve any concern or misunderstanding
          fairly, so everyone can enjoy a positive experience.
        </p>
        <a
          href="/contact"
          className="inline-block bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-3 rounded-full hover:scale-105 transition"
        >
          Contact Support
        </a>
      </section>

      {/* Outro */}
      <div className="text-center max-w-2xl mx-auto">
        <p className="text-gray-500 text-sm">
          Your safety is not an option — it’s a promise.  
          Together, we make beauty professional, accessible, and trustworthy.
        </p>
      </div>
    </motion.div>
  );
}
