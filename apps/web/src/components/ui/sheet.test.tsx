import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sheet, SHEET_EXIT_MS } from "./sheet";

afterEach(() => vi.useRealTimers());

describe("Sheet", () => {
  it("is a labelled modal dialog that takes focus", () => {
    render(
      <Sheet label="Other practice" closeLabel="Close" onClose={() => {}}>
        <p>Body</p>
      </Sheet>,
    );
    const dialog = screen.getByRole("dialog", { name: "Other practice" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveFocus();
  });

  it("animates out, then calls onClose, on Escape and on the backdrop", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(
      <Sheet label="S" closeLabel="Close" onClose={onClose}>
        <p>Body</p>
      </Sheet>,
    );
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(document.querySelector("[data-state]")).toHaveAttribute("data-state", "closed");
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(SHEET_EXIT_MS));
    expect(onClose).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
    const onClose2 = vi.fn();
    render(
      <Sheet label="T" closeLabel="Close T" onClose={onClose2}>
        <p>Body</p>
      </Sheet>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close T" }));
    await vi.waitFor(() => expect(onClose2).toHaveBeenCalled());
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
    await userEvent.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Close" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));
    await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });
});
