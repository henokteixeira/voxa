import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/** The ports-and-adapters rules (see CLAUDE.md), checked on every import in src (tests run from apps/api). */
const SRC = join(process.cwd(), "src");
/** Vendor SDKs and database drivers: only adapters in infra may use them. (The HTTP and WebSocket servers are the app's own transport.) */
const VENDORS = ["@anthropic-ai/", "pg", "drizzle-orm", "@electric-sql/pglite"];
/** The model evaluation calls the Claude API itself (a tool run by hand, not part of the app). */
const VENDOR_EXCEPTIONS = ["model-eval/"];

interface Import {
  file: string;
  from: string;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((path) => path.endsWith(".ts"))
    .map((path) => join(dir, path));
}

function importsOf(file: string): Import[] {
  const code = readFileSync(file, "utf8");
  const path = relative(SRC, file);
  return [...code.matchAll(/(?:from|import)\s*\(?\s*"([^"]+)"/g)].map((match) => ({ file: path, from: match[1]! }));
}

const all = sourceFiles(SRC).flatMap(importsOf);
const isTest = ({ file }: Import) => file.endsWith(".spec.ts");
const isVendor = (from: string) => VENDORS.some((vendor) => from === vendor || from.startsWith(vendor.endsWith("/") ? vendor : `${vendor}/`));
const reaches = (from: string, layer: string) => new RegExp(`^(\\.\\./)+${layer}/|^\\./${layer}/`).test(from);
const show = (imports: Import[]) => imports.map(({ file, from }) => `${file} → ${from}`);

describe("architecture", () => {
  it("reads the imports of every source file", () => {
    expect(all.filter(({ file }) => file.startsWith("domain/")).length).toBeGreaterThan(100);
  });

  it("keeps the domain free of the other layers and of any framework", () => {
    const domain = all.filter(({ file }) => file.startsWith("domain/") && !isTest({ file, from: "" }));
    const outside = domain.filter(({ from }) => !from.startsWith(".") && from !== "@voxa/contracts");
    const layers = domain.filter(({ from }) => ["application", "infra", "config"].some((layer) => reaches(from, layer)));
    expect(show([...outside, ...layers])).toEqual([]);
  });

  it("lets use cases depend on ports, never on adapters", () => {
    const application = all.filter((i) => i.file.startsWith("application/") && !isTest(i));
    expect(show(application.filter(({ from }) => reaches(from, "infra")))).toEqual([]);
  });

  it("keeps vendor SDKs inside infra", () => {
    const leaks = all.filter(
      ({ file, from }) => isVendor(from) && !file.startsWith("infra/") && !VENDOR_EXCEPTIONS.some((path) => file.startsWith(path)),
    );
    expect(show(leaks)).toEqual([]);
  });
});
