import { defineConfig, minimal2023Preset } from "@vite-pwa/assets-generator/config";

// Run `pnpm generate-icons` after changing public/icon.svg.
export default defineConfig({
  preset: { ...minimal2023Preset, maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: "#F6F1EA" } }, apple: { ...minimal2023Preset.apple, resizeOptions: { background: "#F6F1EA" } } },
  images: ["public/icon.svg"],
});
