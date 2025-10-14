import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

export default defineConfig({
  plugins: [react()],

  // ✅ Permet à Vite de servir index.html pour toutes les routes (utile en dev ou sur d'autres hébergeurs)
  server: {
    historyApiFallback: true,
  },

  // ✅ Optimisation pour Tailwind CSS
  css: {
    transformer: tailwindcss,
  },

  // ✅ (optionnel mais utile) : support propre des chemins relatifs lors du build
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
