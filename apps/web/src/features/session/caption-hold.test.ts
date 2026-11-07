import { describe, expect, it } from "vitest";
import { captionHoldMs } from "./caption-hold";

describe("captionHoldMs", () => {
  it("keeps short lines briefly and long ones longer, within bounds", () => {
    expect(captionHoldMs("Yes")).toBe(3000);
    expect(captionHoldMs("Yeah, my name is Enoch and I am a software engineer.")).toBe(5120);
    expect(captionHoldMs("x".repeat(500))).toBe(8000);
  });
});
