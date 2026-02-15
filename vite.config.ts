import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // Build Supabase origin for Workbox caching regex
  // Fallback is current prod ref — temporary bootstrap, update if project changes
  let supabaseOrigin = "https://nrmmgcgwriyrlbcpoqvk.supabase.co";
  if (env.VITE_SUPABASE_URL) {
    try {
      supabaseOrigin = new URL(env.VITE_SUPABASE_URL).origin;
    } catch {
      console.warn("[vite.config] Invalid VITE_SUPABASE_URL, using fallback origin");
    }
  } else if (mode === "production") {
    console.warn("[vite.config] VITE_SUPABASE_URL not set in production — using hardcoded fallback");
  }
  const escapedOrigin = supabaseOrigin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const supabaseCachePattern = new RegExp(`^${escapedOrigin}\\/.*`, "i");

  return ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "icons/*.png"],
      manifest: {
        name: "AI Legal Armenia",
        short_name: "AI Legal",
        description: "AI-powered legal analysis platform for Armenia",
        theme_color: "#1e3a5f",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any maskable"
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: supabaseCachePattern,
            handler: "NetworkFirst",
            options: {
              cacheName: "supabase-api-cache",
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 // 1 hour
              }
            }
          }
        ]
      }
    })
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime"],
  },
});
});
