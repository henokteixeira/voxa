import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// SWC é necessário para os decorators/metadata do NestJS nos testes.
export default defineConfig({
  plugins: [swc.vite()],
  test: { include: ["src/**/*.spec.ts"] },
});
