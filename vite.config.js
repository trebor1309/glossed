import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";

export default defineConfig({
  plugins: [react()],
  css: {
    transformer: tailwindcss, // 👈 indique à Vite d’utiliser le moteur Tailwind 4
  },
});
