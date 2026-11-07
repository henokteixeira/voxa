import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

// The model eval calls the real tutor with several models: slow and paid, so it is kept out of `pnpm test`.
export default defineConfig({
  plugins: [swc.vite()],
  test: { include: ["src/model-eval/**/*.eval.ts"], testTimeout: 1_800_000, hookTimeout: 60_000 },
});
