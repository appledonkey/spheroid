import { defineConfig, minimal2023Preset as preset } from '@vite-pwa/assets-generator/config';

// Generates favicons, apple-touch-icon, and maskable/any PWA icons from the
// single source SVG at public/icon.svg. Run with `npm run icons`.
// The minimal-2023 preset covers: favicon.ico, apple-touch-icon-180x180.png,
// pwa-192x192.png, pwa-512x512.png, pwa-64x64.png, maskable-icon-512x512.png.
export default defineConfig({
  preset,
  images: ['public/icon.svg'],
});
