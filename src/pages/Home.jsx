// eslint-disable-next-line no-unused-vars
import { motion } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { useUser } from "../context/UserContext";

export default function Home({
  onOpenLogin,
  onOpenSignup,
  onOpenProSignup,
  onOpenDownload,
}) {
  const { isAuthenticated, isClient, isPro, switchRole } = useUser();
  const navigate = useNavigate();

  const handleBookNow = () => {
    if (!isAuthenticated) {
      onOpenLogin();
    } else if (isClient) {
      navigate("/dashboard/new");
    } else if (isPro) {
      // on peut soit prévenir, soit switcher direct
      switchRole();
      navigate("/dashboard/new");
    }
  };

  return (
    <>
      {/* Hero */}
      <section className="relative flex flex-col md:flex-row items-center justify-center px-4 sm:px-6 md:px-16 py-16 md:py-32 min-h-screen overflow-x-hidden bg-gradient-to-br from-amber-50 via-white to-rose-50">
        {/* Image de fond */}
        <div
          className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1487412912498-0447578fcca8?q=80&w=2070&auto=format&fit=crop')]
          bg-cover bg-center opacity-30"
        ></div>

        <div className="absolute inset-0 bg-gradient-to-r from-rose-100/70 via-white/60 to-transparent backdrop-blur-[1px]"></div>

        <div className="relative z-10 max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10 text-center md:text-left">
          {/* Texte */}
          <motion.div
            className="max-w-lg mx-auto md:mx-0"
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <div className="inline-block px-3 py-1.5 bg-rose-100 text-rose-700 rounded-full text-xs sm:text-sm font-medium mb-6 shadow-sm">
              Pro care at your doorstep
            </div>

            <h1 className="text-3xl sm:text-5xl md:text-7xl font-bold mb-6 leading-tight">
              Beauty,{" "}
              <span className="bg-gradient-to-r from-rose-600 to-red-600 bg-clip-text text-transparent">
                Delivered.
              </span>
            </h1>

            <p className="text-base sm:text-lg text-gray-600 mb-6 leading-relaxed max-w-md mx-auto md:mx-0">
              Need salon-style hair, makeup or nails for an event—or just
              because?{" "}
              <span className="font-medium text-rose-600">Glossed</span> brings
              certified beauty pros to you, anytime, anywhere.
            </p>

            <motion.div
              className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.7 }}
            >
              <button
                onClick={handleBookNow}
                className="bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-8 py-3 rounded-full hover:scale-105 transition-transform duration-300"
              >
                Book Now
              </button>

              <Link
                to="/about"
                className="text-gray-700 font-semibold hover:text-rose-600 transition-all duration-300 flex items-center justify-center gap-2 px-6 sm:px-8 py-3 sm:py-4 border border-gray-200 rounded-full hover:shadow-md hover:scale-105 hover:border-rose-300 w-auto mx-auto sm:mx-0"
              >
                Learn more →
              </Link>
            </motion.div>

            {/* petits indicateurs */}
            <motion.div
              className="flex flex-wrap justify-center md:justify-start gap-6 text-sm text-gray-500 mt-8"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1, duration: 0.8 }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>1000+ certified pros</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>50+ cities</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Image du Hero */}
          <motion.div
            className="relative mt-12 md:mt-0 group flex justify-center md:justify-end w-full md:w-auto px-4 sm:px-0"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 0.8, ease: "easeOut" }}
          >
            {/* Glow coloré autour */}
            <div className="absolute -inset-3 sm:-inset-6 bg-gradient-to-r from-amber-300 to-rose-400 rounded-2xl sm:rounded-3xl blur-2xl sm:blur-3xl opacity-30"></div>

            {/* Image principale avec effet glossy */}
            <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden">
              <motion.img
                src="https://images.unsplash.com/photo-1602910344008-22f323cc1817?q=80&w=1740&auto=format&fit=crop"
                alt="Beauty service example"
                className="relative rounded-2xl sm:rounded-3xl shadow-2xl max-w-[80%] sm:max-w-sm md:max-w-md transform transition-transform duration-700 ease-out group-hover:scale-105 mx-auto"
              />

              {/* Reflet glossy au survol */}
              <div className="absolute inset-1 sm:inset-2 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-white/25 via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out pointer-events-none scale-97"></div>
            </div>

            {/* Encadré note 4.9 */}
            <div className="absolute -bottom-6 -right-6 bg-white rounded-2xl p-4 shadow-xl border border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-rose-500 to-red-500 rounded-full flex items-center justify-center text-white font-bold">
                  4.9
                </div>
                <div>
                  <div className="font-semibold text-gray-900">Excellent</div>
                  <div className="text-sm text-gray-500">2,500+ reviews</div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="px-6 md:px-16 py-24 bg-gradient-to-b from-white to-amber-50">
        <div className="text-center mb-16">
          <div className="inline-block px-4 py-2 bg-rose-100 text-rose-700 rounded-full text-sm font-medium mb-4">
            Our promise
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            Why <span className="text-rose-600">Glossed?</span>
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            We bring professional care wherever you are — because confidence
            should always be within reach.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-12 max-w-6xl mx-auto">
          {/* Feature 1 */}
          <div className="flex flex-col items-center text-center group hover:scale-105 transition-all duration-300">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-400 to-red-400 rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
              <img
                src="https://images.unsplash.com/photo-1613966802194-d46a163af70d?q=80&w=1170&auto=format&fit=crop"
                alt="Makeup artist"
                className="w-24 h-24 object-cover rounded-full shadow-lg border-4 border-white relative z-10"
              />
            </div>
            <h3 className="font-bold text-2xl mb-3 text-gray-900">
              On-demand beauty
            </h3>
            <p className="text-gray-600 leading-relaxed text-lg max-w-xs">
              Book certified pros anytime, anywhere — from your sofa to your
              office.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="flex flex-col items-center text-center group hover:scale-105 transition-all duration-300">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-400 to-red-400 rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
              <img
                src="https://images.unsplash.com/photo-1638064432601-18b99cb31acb?q=80&w=685&auto=format&fit=crop"
                alt="Hair stylist"
                className="w-24 h-24 object-cover rounded-full shadow-lg border-4 border-white relative z-10"
              />
            </div>
            <h3 className="font-bold text-2xl mb-3 text-gray-900">
              Premium experience
            </h3>
            <p className="text-gray-600 leading-relaxed text-lg max-w-xs">
              Enjoy salon-quality results without leaving home.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="flex flex-col items-center text-center group hover:scale-105 transition-all duration-300">
            <div className="relative w-24 h-24 mb-6">
              <div className="absolute inset-0 bg-gradient-to-r from-rose-400 to-red-400 rounded-full blur-md opacity-40 group-hover:opacity-60 transition-opacity"></div>
              <img
                src="https://images.unsplash.com/photo-1690749138086-7422f71dc159?q=80&w=627&auto=format&fit=crop"
                alt="Manicure session"
                className="w-24 h-24 object-cover rounded-full shadow-lg border-4 border-white relative z-10"
              />
            </div>
            <h3 className="font-bold text-2xl mb-3 text-gray-900">
              For clients & pros
            </h3>
            <p className="text-gray-600 leading-relaxed text-lg max-w-xs">
              Join as a client or a beauty professional — Glossed empowers both
              sides.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative px-6 md:px-16 py-24 text-center text-white overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1667369039699-f30c4b863e51?q=80&w=1170&auto=format&fit=crop&w=1400&q=80"
          alt="Beauty service background"
          className="absolute inset-0 w-full h-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-r from-rose-700/90 to-red-600/70"></div>

        <div className="relative z-10 max-w-4xl mx-auto">
          <div className="inline-block px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-full text-sm font-medium mb-6">
            Join the Glossed experience
          </div>

          <h2 className="text-4xl md:text-6xl font-bold mb-6 leading-tight">
            Ready to <span className="text-amber-300">shine anywhere</span>?
          </h2>

          <p className="text-xl text-rose-100 mb-10 max-w-2xl mx-auto leading-relaxed">
            Book top beauty professionals wherever you are — for any look, any
            occasion. Discover the easiest way to feel your best, with Glossed.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
            <a
              role="button"
              onClick={onOpenSignup}
              className="bg-white text-rose-600 px-8 py-4 rounded-full font-bold hover:shadow-xl hover:scale-105 transition-all duration-300 text-lg"
            >
              Create your account
            </a>
            <a
              role="button"
              onClick={onOpenDownload}
              className="bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold hover:opacity-90 hover:shadow-lg hover:scale-105 transition-all duration-300 flex items-center gap-2 px-8 py-4 rounded-full"
            >
              Download app →
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
