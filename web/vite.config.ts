import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 7401,
    proxy: {
      "/api": {
        target: "http://localhost:7400",
        changeOrigin: true,
      },
    },
  },
});
