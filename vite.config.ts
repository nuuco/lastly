import { existsSync, createReadStream, cpSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

const ortDist = path.resolve("node_modules/onnxruntime-web/dist");
const ortPublic = path.resolve("public/ort-runtime");
const ortFiles = [
  "ort-wasm-simd-threaded.jsep.mjs",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
];

function syncOrtRuntime(): Plugin {
  const sync = () => {
    mkdirSync(ortPublic, { recursive: true });
    for (const name of ortFiles) {
      const src = path.join(ortDist, name);
      if (existsSync(src)) cpSync(src, path.join(ortPublic, name));
    }
  };
  return {
    name: "sync-ort-runtime",
    buildStart: sync,
    configureServer() {
      sync();
    },
  };
}

/** 없는 Gemma 파일을 SPA index.html로 바꾸지 않음 */
function rejectMissingModels(): Plugin {
  return {
    name: "reject-missing-models",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith("/models/") || url.endsWith("/")) {
          next();
          return;
        }
        const file = path.resolve("public", decodeURIComponent(url.slice(1)));
        const rel = path.relative(path.resolve("public/models"), file);
        if (rel.startsWith("..") || path.isAbsolute(rel)) {
          res.statusCode = 403;
          res.end("forbidden");
          return;
        }
        if (!existsSync(file) || !statSync(file).isFile()) {
          res.statusCode = 404;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("model not found");
          return;
        }
        next();
      });
    },
  };
}

/** 개발 중 /ort-runtime 미들웨어 (public 복사본과 동일 파일) */
function serveOrtRuntime(): Plugin {
  return {
    name: "serve-ort-runtime",
    configureServer(server) {
      server.middlewares.use("/ort-runtime", (req, res, next) => {
        const name = (req.url ?? "").split("?")[0].replace(/^\/+/, "");
        const file = path.resolve(ortDist, name);
        const rel = path.relative(ortDist, file);
        if (
          !name ||
          rel.startsWith("..") ||
          path.isAbsolute(rel) ||
          !existsSync(file)
        ) {
          next();
          return;
        }
        res.setHeader(
          "Content-Type",
          name.endsWith(".wasm") ? "application/wasm" : "text/javascript",
        );
        createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    syncOrtRuntime(),
    serveOrtRuntime(),
    rejectMissingModels(),
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
        globIgnores: [
          "**/*.wasm",
          "**/*.task",
          "**/*ort-wasm*",
          "**/*worker*",
          "**/ort-runtime/**",
          "**/models/**",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/models\/.*\.task$/i,
            handler: "CacheFirst",
            options: {
              cacheName: "lastly-gemma-model",
              expiration: {
                maxEntries: 2,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
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
  resolve: {
    // 기본 ort.bundle.min.mjs(jsep glue). extern/alias로 다른 빌드와 섞지 않음.
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web", "@huggingface/transformers"],
  },
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
