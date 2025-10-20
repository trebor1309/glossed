import { motion } from "framer-motion";
import { Newspaper, FileDown, Mail, Globe } from "lucide-react";

export default function Press() {
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
          <Newspaper size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Press & Media</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Welcome to the official Glossed press page. Here you&apos;ll find all essential resources
          for journalists, media partners, and anyone interested in sharing our story.
        </p>
      </div>

      {/* Hero Image */}
      <div className="rounded-3xl overflow-hidden shadow-lg mb-16">
        <img
          src="/images/press-hero.jpg"
          alt="Glossed media visuals"
          className="w-full h-[400px] object-cover"
        />
      </div>

      {/* Section: Press Kit */}
      <section className="mb-24 text-center">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Press Kit & Resources</h2>
        <p className="text-gray-600 max-w-2xl mx-auto mb-8">
          Need logos, screenshots or company information? Download our official media kit to use
          verified Glossed assets for articles or publications.
        </p>

        <a
          href="/files/Glossed_PressKit.zip"
          className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-3 rounded-full hover:scale-105 transition"
        >
          <FileDown size={20} />
          Download Press Kit
        </a>
      </section>

      {/* Section: Media Mentions */}
      <section className="mb-24">
        <h2 className="text-2xl font-semibold mb-10 text-center text-gray-800">
          Glossed in the Media
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Placeholder article 1 */}
          <div className="bg-white rounded-2xl shadow border border-rose-50 hover:shadow-lg transition p-6">
            <h3 className="text-xl font-semibold text-rose-600 mb-2">
              “The Future of Beauty at Home”
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              A deep dive into how Glossed is transforming the way we access professional beauty
              services — fast, flexible, and modern.
            </p>
            <p className="text-sm text-gray-400">— Beauty Tech Review</p>
          </div>

          {/* Placeholder article 2 */}
          <div className="bg-white rounded-2xl shadow border border-rose-50 hover:shadow-lg transition p-6">
            <h3 className="text-xl font-semibold text-rose-600 mb-2">
              “A Startup Bringing Elegance to Convenience”
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              Glossed bridges the gap between luxury and accessibility for the new generation of
              on-demand beauty lovers.
            </p>
            <p className="text-sm text-gray-400">— Startup Europe Weekly</p>
          </div>

          {/* Placeholder article 3 */}
          <div className="bg-white rounded-2xl shadow border border-rose-50 hover:shadow-lg transition p-6">
            <h3 className="text-xl font-semibold text-rose-600 mb-2">
              “Empowering Independent Stylists”
            </h3>
            <p className="text-gray-600 text-sm mb-4">
              Glossed helps freelancers thrive by giving them digital tools, visibility, and clients
              who value quality.
            </p>
            <p className="text-sm text-gray-400">— Tech & Lifestyle Journal</p>
          </div>
        </div>
      </section>

      {/* Section: Press Contact */}
      <section className="text-center mb-12">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">Press Contact</h2>
        <p className="text-gray-600 mb-6">
          For interviews, media inquiries or partnership requests, please contact our communications
          team.
        </p>
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
          <a
            href="mailto:press@glossed.app"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-rose-600 to-red-600 text-white px-5 py-2.5 rounded-full font-medium hover:scale-105 transition"
          >
            <Mail size={18} />
            press@glossed.app
          </a>
          <a
            href="/about"
            className="inline-flex items-center gap-2 border border-rose-300 text-rose-600 px-5 py-2.5 rounded-full font-medium hover:bg-rose-50 transition"
          >
            <Globe size={18} />
            Learn more about Glossed
          </a>
        </div>
      </section>
    </motion.div>
  );
}
