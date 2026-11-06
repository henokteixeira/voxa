import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC is required for NestJS decorators/metadata in tests.
export default defineConfig({
  plugins: [swc.vite()],
  test: { include: ["src/**/*.spec.ts"] },
});
