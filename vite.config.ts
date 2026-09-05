import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      minify: false,
      includeAssets: ["icon.svg"],
      manifest: {
        name: "LASTLY",
        short_name: "LASTLY",
        description: "마지막으로 언제 했는지 기록",
        theme_color: "#1f4a3e",
        background_color: "#f4f1ea",
        display: "standalone",
        lang: "ko",
        start_url: "/",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        mode: "development",
        globPatterns: ["**/*.{css,html,svg,webmanifest}"],
        globIgnores: ["**/*.wasm", "**/*ort-wasm*", "**/*worker*"],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/huggingface\.co\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "hf-models",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: /^https:\/\/cdn-lfs.*\.huggingface\.co\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "hf-lfs",
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5173,
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
