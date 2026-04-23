import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate = silently swap in the new SW on next load. No user prompt,
      // which is what we want for a small game — the cost of a stale version
      // lingering is higher than the friction of an update toast.
      registerType: 'autoUpdate',
      // Expose the generated icons + favicon from public/ so the manifest can
      // reference them relative to the base URL.
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        name: 'Spheroids',
        short_name: 'Spheroids',
        description: '3D sphere-stacking puzzle game. Classic, Escalation, Daily, and head-to-head multiplayer.',
        theme_color: '#064e3b',
        background_color: '#064e3b',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: 'pwa-64x64.png',             sizes: '64x64',   type: 'image/png' },
          { src: 'pwa-192x192.png',           sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png',           sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Cache the shell + JS/CSS. The game itself is a single-page app with
        // only localStorage persistence and two remote URLs (PartyKit + the
        // share copy) — nothing bulky to cache server-side.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        // PartyKit WebSocket traffic is not HTTP — Workbox won't intercept it,
        // so no special handling needed. Just make sure any HTTPS API calls
        // fall through to network.
        navigateFallback: '/index.html',
      },
      devOptions: {
        // Let us see the SW in local dev via `npm run dev` — useful for
        // debugging caching + manifest changes without having to run a
        // production build each time.
        enabled: true,
        type: 'module',
      },
    }),
  ],
});
