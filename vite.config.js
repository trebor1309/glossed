import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
  server: { historyApiFallback: true },
  css: { transformer: tailwindcss },
  build: { outDir: "dist", emptyOutDir: true },
});
