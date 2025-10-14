import { motion } from "framer-motion";
import { PenSquare, CalendarDays, Heart } from "lucide-react";

export default function Blog() {
  const posts = [
    {
      id: 1,
      title: "The Future of At-Home Beauty Services",
      excerpt:
        "Why more people are choosing on-demand professionals and how Glossed is redefining the beauty experience.",
      image: "/images/blog-future-beauty.jpg",
      date: "October 10, 2025",
      category: "Trends",
    },
    {
      id: 2,
      title: "Behind the Scenes: Building Glossed",
      excerpt:
        "From a small idea to a full-fledged platform — how design, technology and passion came together to create Glossed.",
      image: "/images/blog-building-glossed.jpg",
      date: "September 27, 2025",
      category: "Inside Glossed",
    },
    {
      id: 3,
      title: "5 Beauty Rituals You Can Bring Home",
      excerpt:
        "Discover how to recreate salon-quality experiences with the help of certified Glossed professionals.",
      image: "/images/blog-home-rituals.jpg",
      date: "August 31, 2025",
      category: "Beauty Tips",
    },
  ];

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
          <PenSquare size={32} />
        </div>
        <h1 className="text-4xl font-bold mb-4">Glossed Journal</h1>
        <p className="text-gray-600 text-lg max-w-2xl mx-auto">
          Stories, trends and inspiration from the world of on-demand beauty —
          written by the Glossed team and our professional community.
        </p>
      </div>

      {/* Blog Grid */}
      <section className="grid md:grid-cols-3 gap-10 mb-24">
        {posts.map((post) => (
          <motion.article
            key={post.id}
            whileHover={{ scale: 1.02 }}
            className="bg-white rounded-2xl shadow border border-rose-50 overflow-hidden hover:shadow-xl transition"
          >
            <img
              src={post.image}
              alt={post.title}
              className="w-full h-56 object-cover"
            />
            <div className="p-6">
              <span className="inline-block text-xs uppercase tracking-wider text-rose-500 font-semibold mb-2">
                {post.category}
              </span>
              <h2 className="text-xl font-semibold mb-3 text-gray-800">
                {post.title}
              </h2>
              <p className="text-gray-600 text-sm leading-relaxed mb-4">
                {post.excerpt}
              </p>
              <p className="text-xs text-gray-400 flex items-center gap-2">
                <CalendarDays size={14} /> {post.date}
              </p>
            </div>
          </motion.article>
        ))}
      </section>

      {/* CTA / Newsletter */}
      <section className="text-center">
        <h2 className="text-2xl font-semibold mb-4 text-gray-800">
          Stay Inspired 💌
        </h2>
        <p className="text-gray-600 mb-6 max-w-xl mx-auto">
          Get stories, trends and special updates from the Glossed world — no
          spam, just beauty in your inbox.
        </p>

        <form className="flex flex-col sm:flex-row justify-center gap-3 max-w-md mx-auto">
          <input
            type="email"
            placeholder="Enter your email"
            className="w-full border border-gray-300 rounded-full px-4 py-2 focus:outline-none focus:border-rose-400"
          />
          <button
            type="submit"
            className="bg-gradient-to-r from-rose-600 to-red-600 text-white font-semibold px-6 py-2 rounded-full hover:scale-105 transition"
          >
            Subscribe
          </button>
        </form>

        <div className="flex justify-center gap-3 mt-8 text-gray-400">
          <Heart className="text-rose-500" size={18} />
          <p className="text-sm">
            Follow us on{" "}
            <a
              href="#"
              className="text-rose-600 hover:text-rose-700 font-medium"
            >
              Instagram
            </a>{" "}
            for daily beauty inspiration.
          </p>
        </div>
      </section>
    </motion.div>
  );
}
