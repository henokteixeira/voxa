import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ConfigService } from "@nestjs/config";
import { describe, expect, it } from "vitest";
import { FileLearnerContext } from "./file-learner-context.js";

const config = (path: string) => ({ get: () => path }) as unknown as ConfigService;

describe("FileLearnerContext", () => {
  it("reads the context file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "voxa-"));
    const path = join(dir, "tutor-context.md");
    await writeFile(path, "I work on Oral Collector.");
    await expect(new FileLearnerContext(config(path)).load()).resolves.toBe("I work on Oral Collector.");
  });

  it("returns an empty context when the file does not exist", async () => {
    const dir = await mkdtemp(join(tmpdir(), "voxa-"));
    await expect(new FileLearnerContext(config(join(dir, "missing.md"))).load()).resolves.toBe("");
  });
});
