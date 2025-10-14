import { motion } from "framer-motion";
import {
  Scissors,
  Sparkles,
  Smile,
  Heart,
  Wand2,
  CalendarHeart,
} from "lucide-react";

export default function Services() {
  const services = [
    {
      icon: <Sparkles className="text-rose-600" size={28} />,
      title: "Makeup & Beauty",
      desc: "From natural looks to full glam, our makeup artists bring out your unique radiance for every occasion.",
      examples: ["Weddings", "Evening parties", "Photo shoots", "Job interviews"],
      image: "/images/service-makeup.jpg",
    },
    {
      icon: <Scissors className="text-rose-600" size={28} />,
      title: "Hair Styling",
      desc: "Cuts, blowouts, curls or braids — enjoy professional hairstyling without leaving home.",
      examples: ["Weddings & bridesmaids", "Corporate events", "Family photos"],
      image: "/images/service-hair.jpg",
    },
    {
      icon: <Heart className="text-rose-600" size={28} />,
      title: "Nails & Hand Care",
      desc: "Perfect manicures, creative nail art or quick touch-ups — Glossed brings the nail bar to you.",
      examples: ["Vacations", "Special dinners", "Weekend refresh"],
      image: "/images/service-nails.jpg",
    },
    {
      icon: <Wand2 className="text-rose-600" size={28} />,
      title: "Skincare & Facials",
      desc: "Relax with a custom skincare session designed to refresh and nourish your skin wherever you are.",
      examples: ["At-home spa sessions", "Pre-event glow", "Skin prep for makeup"],
      image: "/images/service-skincare.jpg",
    },
    {
      icon: <Smile className="text-rose-600" size={28} />,
      title: "Kids Makeup & Face Painting",
      desc: "Make birthdays and events extra magical with our creative makeup and safe, fun face painting services.",
      examples: ["Birthdays", "Halloween parties", "School events", "Carnivals"],
      image: "/images/service-kids.jpg",
    },
  ];

  const occasions = [
    {
      title: "Wedding & Bridal Prep",
      desc: "Hair, makeup and nail services tailored for brides, bridesmaids and guests. Elegant, timeless, stress-free.",
    },
    {
      title: "Professional Meetings",
      desc: "Look confident for job interviews, conferences or corporate photo shoots — beauty that means business.",
    },
    {
      title: "Private Events & Parties",
      desc: "From birthdays to gala nights, our pros make sure you shine for every special moment.",
    },
    {
      title: "Children’s Events",
      desc: "Fun, safe and colorful makeup for birthdays, Halloween or school fairs — memories that sparkle.",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="max-w-6xl mx-auto px-6 py-20"
    >
      {/* Intro */}
      <div className="text-center mb-16">
        <div className="inline-flex items-center justify-center bg-rose-100 text-rose-600 w-16 h-16 rounded-2xl mb-6">
          <Sparkles size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Our Services</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          From everyday beauty to special occasions, Glossed offers a range of
          professional services designed to fit your lifestyle and your most
          important moments.
        </p>
      </div>

      {/* Service Cards */}
      <section className="grid md:grid-cols-2 lg:grid-cols-3 gap-10 mb-24">
        {services.map((service, index) => (
          <motion.div
            key={index}
            whileHover={{ scale: 1.03 }}
            className="bg-white rounded-2xl overflow-hidden shadow border border-rose-50 hover:shadow-lg transition"
          >
            <img
              src={service.image}
              alt={service.title}
              className="w-full h-48 object-cover"
            />
            <div className="p-6 text-center">
              <div className="flex justify-center mb-3">{service.icon}</div>
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                {service.title}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                {service.desc}
              </p>
              <p className="text-sm text-gray-500 italic">
                Examples: {service.examples.join(", ")}
              </p>
            </div>
          </motion.div>
        ))}
      </section>

      {/* Popular Occasions */}
      <section className="text-center mb-24">
        <div className="inline-flex items-center justify-center bg-rose-100 text-rose-600 w-16 h-16 rounded-2xl mb-6">
          <CalendarHeart size={28} />
        </div>
        <h2 className="text-3xl font-semibold mb-4 text-gray-800">
          Popular Occasions
        </h2>
        <p className="text-gray-600 max-w-2xl mx-auto mb-12">
          Glossed is designed for every event that matters — whether you’re
          walking down the aisle, preparing for an interview, or celebrating
          with your loved ones.
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 text-left">
          {occasions.map((item, i) => (
            <div
              key={i}
              className="bg-white p-6 rounded-2xl shadow border border-rose-50 hover:shadow-lg transition"
            >
              <h3 className="text-xl font-semibold text-rose-600 mb-2">
                {item.title}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="text-center">
        <h2 className="text-2xl font-semibold mb-6 text-gray-800">
          Ready to get started?
        </h2>
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <a
            href="/dashboard/new"
            className="bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-8 py-3 rounded-full hover:scale-105 transition"
          >
            Book a Service
          </a>
          <a
            href="/prodashboard"
            className="border border-rose-300 text-rose-600 font-semibold px-8 py-3 rounded-full hover:bg-rose-50 transition"
          >
            Join as a Pro
          </a>
        </div>
      </section>
    </motion.div>
  );
}
