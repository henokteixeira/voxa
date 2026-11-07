import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// Golden sessions call the real tutor: slow and paid, so they are kept out of `pnpm test`.
export default defineConfig({
  plugins: [swc.vite()],
  test: { include: ["src/golden/**/*.golden.ts"], testTimeout: 360_000, maxConcurrency: 4 },
});
