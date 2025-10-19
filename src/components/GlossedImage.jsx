// src/components/GlossedImage.jsx
import { motion } from "framer-motion";

export default function GlossedImage({ src, alt, size = "md", glow = true, className = "" }) {
  const sizes = {
    sm: "max-w-xs",
    md: "max-w-sm",
    lg: "max-w-md",
  };

  return (
    <div className="relative group flex justify-center items-center">
      {/* Glow coloré optionnel */}
      {glow && (
        <div className="absolute -inset-3 sm:-inset-5 bg-gradient-to-r from-amber-300 to-rose-400 rounded-2xl blur-2xl sm:blur-3xl opacity-30 group-hover:opacity-50 transition-opacity"></div>
      )}

      {/* Image principale avec effet glossy */}
      <div className="relative rounded-2xl sm:rounded-3xl overflow-hidden">
        <motion.img
          src={src}
          alt={alt}
          className={`relative rounded-2xl sm:rounded-3xl shadow-2xl object-cover ${sizes[size]} transform transition-transform duration-700 ease-out group-hover:scale-105 ${className || ""}`}
        />

        <div className="absolute inset-1 sm:inset-2 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-white/25 via-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 ease-out pointer-events-none"></div>
      </div>
    </div>
  );
}
