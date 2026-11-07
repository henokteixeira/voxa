import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet, SHEET_EXIT_MS } from "./sheet";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** jsdom has no matchMedia, so by default the sheet closes at once. These make it a browser that animates or not. */
const motion = (reduce: boolean) =>
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ matches: reduce && query.includes("reduce"), media: query })));

const escape = () => act(() => void document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
const sheetRoot = () => document.querySelector("[data-state]")!;
const backdrop = () => sheetRoot().firstElementChild as HTMLElement;

function Opener() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Sheet label="Other practice" closeLabel="Close" onClose={() => setOpen(false)}>
          <a href="#x">Inside</a>
        </Sheet>
      )}
    </>
  );
}

describe("Sheet", () => {
  it("is a labelled modal dialog that takes focus and gives it back on close", async () => {
    render(<Opener />);
    await userEvent.click(screen.getByRole("button", { name: "Open" }));
    const dialog = screen.getByRole("dialog", { name: "Other practice" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "Open" })).toHaveFocus();
  });

  it("makes the app behind it inert while open", () => {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    const { unmount } = render(
      <Sheet label="S" onClose={() => {}}>
        <p>Body</p>
      </Sheet>,
    );
    expect(root.inert).toBe(true);
    unmount();
    expect(root.inert).toBe(false);
    root.remove();
  });

  it("animates out, then calls onClose once, however many times it is closed", () => {
    motion(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Sheet label="S" closeLabel="Close" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    escape();
    escape();
    expect(sheetRoot()).toHaveAttribute("data-state", "closed");
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SHEET_EXIT_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on the backdrop", () => {
    motion(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Sheet label="S" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    act(() => backdrop().click());
    act(() => vi.advanceTimersByTime(SHEET_EXIT_MS));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drops a pending close when it unmounts first (for example, a link inside navigated)", () => {
    motion(false);
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = render(
      <Sheet label="S" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    escape();
    unmount();
    act(() => vi.advanceTimersByTime(SHEET_EXIT_MS));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes at once with reduced motion", () => {
    motion(true);
    const onClose = vi.fn();
    render(
      <Sheet label="S" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    escape();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape and the backdrop when not dismissible", async () => {
    const onClose = vi.fn();
    render(
      <Sheet label="S" closeLabel="Close" onClose={onClose} dismissible={false}>
        {(close) => (
          <button type="button" onClick={close}>
            Done
          </button>
        )}
      </Sheet>,
    );
    escape();
    act(() => backdrop().click());
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Close" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
