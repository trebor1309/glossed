import { motion } from "framer-motion";
import { Mail, MessageSquare, Phone, MapPin, HeartHandshake } from "lucide-react";

export default function Contact() {
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
          <MessageSquare size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Contact Us</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Whether you’re a client, a professional, or a partner, we’d love to
          hear from you. Our team will get back to you as soon as possible.
        </p>
      </div>

      {/* Contact Info */}
      <section className="grid md:grid-cols-3 gap-8 mb-20 text-center">
        <div className="p-8 bg-white rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
          <Mail size={28} className="text-rose-600 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-800 mb-2">General Inquiries</h3>
          <p className="text-gray-600 text-sm mb-3">
            For questions about bookings, services or your account.
          </p>
          <a
            href="mailto:hello@glossed.app"
            className="text-rose-600 font-medium hover:text-rose-700"
          >
            hello@glossed.app
          </a>
        </div>

        <div className="p-8 bg-white rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
          <HeartHandshake size={28} className="text-rose-600 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-800 mb-2">Join as a Pro</h3>
          <p className="text-gray-600 text-sm mb-3">
            Interested in becoming a Glossed professional? Let’s connect.
          </p>
          <a
            href="mailto:pro@glossed.app"
            className="text-rose-600 font-medium hover:text-rose-700"
          >
            pro@glossed.app
          </a>
        </div>

        <div className="p-8 bg-white rounded-2xl shadow border border-gray-100 hover:shadow-lg transition">
          <Phone size={28} className="text-rose-600 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-800 mb-2">Press & Partnerships</h3>
          <p className="text-gray-600 text-sm mb-3">
            For media or business collaboration requests.
          </p>
          <a
            href="mailto:press@glossed.app"
            className="text-rose-600 font-medium hover:text-rose-700"
          >
            press@glossed.app
          </a>
        </div>
      </section>

      {/* Contact Form */}
      <section className="max-w-3xl mx-auto bg-white p-10 rounded-3xl shadow border border-gray-100">
        <h2 className="text-2xl font-semibold mb-8 text-center text-gray-800">
          Send us a Message
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            alert("Message sent! (mockup only)");
          }}
          className="space-y-5"
        >
          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                required
                placeholder="Jane Doe"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <input
              type="text"
              placeholder="Booking issue, account help..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Message
            </label>
            <textarea
              rows="5"
              required
              placeholder="Write your message here..."
              className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:border-rose-400"
            ></textarea>
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-3 rounded-full hover:scale-105 transition"
          >
            Send Message
          </button>
        </form>
      </section>

      {/* Location / Footer */}
      <div className="text-center mt-20">
        <MapPin size={22} className="text-rose-500 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">
          Glossed HQ — Brussels, Belgium 🇧🇪 <br />
          Operating across Belgium, Germany & Luxembourg
        </p>
      </div>
    </motion.div>
  );
}
