import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 7401,
    proxy: {
      "/api": {
        target: "http://localhost:7400",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:7400",
        ws: true,
      },
    },
  },
});
