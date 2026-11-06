import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VoiceBall } from "./voice-ball";

describe("VoiceBall", () => {
  it("names its state for screen readers", () => {
    render(<VoiceBall state="listening" />);
    expect(screen.getByRole("img", { name: "Listening · tap to send" })).toHaveAttribute("data-state", "listening");
  });

  it("is a button when it can be pressed", async () => {
    const onPress = vi.fn();
    render(<VoiceBall state="idle" onPress={onPress} />);
    await userEvent.click(screen.getByRole("button", { name: "Your turn · tap to speak" }));
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("can hide the face", () => {
    const { container } = render(<VoiceBall face={false} />);
    expect(container.querySelector("svg")).toBeNull();
  });
});
