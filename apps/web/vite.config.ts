import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

const linen = "#F6F1EA";

/**
 * VOXA_HTTPS=true: the dev server answers over HTTPS with its own certificate, so a phone on the local network
 * (https://<computer's IP>:5173) may use the microphone. The browser warns about the certificate.
 */
const https = process.env.VOXA_HTTPS === "true";

/**
 * Dev server only: answers the browser's service-worker update check with a worker that removes itself
 * and reloads its pages, so a production build used before on the same port stops serving its cache.
 */
function retireServiceWorker(): Plugin {
  const worker = `self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.registration.unregister()
      .then(() => self.clients.matchAll({ type: "window" }))
      .then((clients) => clients.forEach((client) => client.navigate(client.url))),
  );
});`;
  return {
    name: "voxa:retire-service-worker",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/sw.js", (_req, res) => {
        res.setHeader("content-type", "text/javascript");
        res.setHeader("cache-control", "no-store");
        res.end(worker);
      });
    },
  };
}

export default defineConfig({
  envDir: "../..",
  server: {
    // The app calls /api on its own address; the dev server forwards it (and the voice WebSocket) to the API.
    proxy: { "/api": { target: process.env.API_PROXY_TARGET ?? "http://localhost:3000", ws: true } },
    // Opened through a Tailscale HTTPS address (e.g. on a phone, where the microphone needs HTTPS).
    allowedHosts: [".ts.net"],
  },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [
    retireServiceWorker(),
    ...(https ? [basicSsl({ name: "voxa-dev" })] : []),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Voxa",
        short_name: "Voxa",
        description: "Speaking practice for work meetings.",
        theme_color: linen,
        background_color: linen,
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Never serve API answers from the cache: sessions need the live server.
        navigateFallbackDenylist: [/^\/api\//],
        // Keep the fonts for offline use.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts",
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
