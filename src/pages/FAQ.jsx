import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { HelpCircle, ChevronDown } from "lucide-react";

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState(null);

  const toggle = (index) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  const faqs = [
    // --- USING GLOSSED ---
    {
      category: "Using Glossed",
      q: "How does Glossed work?",
      a: "Glossed connects you with verified beauty professionals who come directly to your home. You simply enter your location, choose your service, select a time slot, and confirm your booking — the rest is handled by your pro.",
    },
    {
      category: "Using Glossed",
      q: "Do I need to create an account to book?",
      a: "Yes, you’ll need a free Glossed account to book or manage appointments. It allows you to track your reservations, receive updates, and contact your professional easily.",
    },
    {
      category: "Using Glossed",
      q: "Can I book for someone else?",
      a: "Absolutely! You can use your account to book an appointment for a friend or family member — just make sure the address and contact details match the location of the service.",
    },
    {
      category: "Using Glossed",
      q: "Which areas does Glossed cover?",
      a: "Glossed is currently expanding across major Belgian and German cities, and new regions are added every month. If your area isn’t yet covered, you can subscribe to our updates to be notified when it is.",
    },

    // --- PAYMENTS & SAFETY ---
    {
      category: "Payments & Safety",
      q: "How do I pay for my appointment?",
      a: "All payments are handled securely through the Glossed app using your preferred payment method (credit/debit card or direct payment services). No cash exchanges are required.",
    },
    {
      category: "Payments & Safety",
      q: "Are my payment details secure?",
      a: "Yes. Glossed uses encrypted payment gateways and never stores your card information directly. Transactions are processed through trusted partners compliant with European PSD2 standards.",
    },
    {
      category: "Payments & Safety",
      q: "What happens if my pro cancels?",
      a: "In the rare case of a cancellation, you’ll be notified immediately and refunded in full. You can also choose to rebook with another professional nearby.",
    },
    {
      category: "Payments & Safety",
      q: "Can I cancel or reschedule my booking?",
      a: "Yes. You can cancel or reschedule directly from your dashboard. Cancellations made early enough are fully refunded — the exact delay may vary depending on the service type.",
    },

    // --- FOR PROFESSIONALS ---
    {
      category: "For Professionals",
      q: "Can I become a Glossed professional?",
      a: "Yes! If you’re a certified makeup artist, hairstylist, nail technician, or skincare expert, you can apply directly via the 'Join as a Pro' section on our website or app.",
    },
    {
      category: "For Professionals",
      q: "What are the requirements to join Glossed as a pro?",
      a: "Professionals must be legally registered as self-employed and provide proof of qualification or experience. Glossed verifies each profile to ensure safety and quality for clients.",
    },
    {
      category: "For Professionals",
      q: "How do professionals get paid?",
      a: "Payments are processed automatically after each completed service. Glossed transfers earnings directly to the pro’s registered bank account, with a clear transaction history in the dashboard.",
    },
  ];

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
          <HelpCircle size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Frequently Asked Questions</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Find answers to the most common questions about using Glossed — from booking and payments
          to becoming a verified professional.
        </p>
      </div>

      {/* FAQ List */}
      <div className="space-y-6">
        {faqs.map((item, index) => (
          <div
            key={index}
            className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden"
          >
            <button
              onClick={() => toggle(index)}
              className="w-full flex justify-between items-center px-6 py-4 text-left focus:outline-none"
            >
              <div>
                <p className="text-sm uppercase tracking-wide text-rose-500 font-semibold">
                  {item.category}
                </p>
                <h3 className="text-lg font-medium text-gray-800">{item.q}</h3>
              </div>
              <ChevronDown
                size={20}
                className={`transition-transform duration-300 ${
                  openIndex === index ? "rotate-180 text-rose-500" : ""
                }`}
              />
            </button>

            <AnimatePresence initial={false}>
              {openIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="px-6 pb-5 text-gray-600 border-t border-gray-100"
                >
                  {item.a}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="text-center mt-16">
        <p className="text-gray-600 mb-3">Didn’t find what you were looking for?</p>
        <a
          href="/contact"
          className="inline-block bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-2.5 rounded-full hover:scale-105 transition"
        >
          Contact Support
        </a>
      </div>
    </motion.div>
  );
}
