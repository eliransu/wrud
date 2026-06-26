import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 11191, strictPort: true },
  preview: { port: 11192, strictPort: true },
});
