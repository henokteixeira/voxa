import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { ApiError, type ApiClient, type BankMistake } from "@/lib/api";
import { MistakesPage } from "./mistakes-page";

const now = new Date("2026-11-06T12:00:00");
const mistake = (id: string, status: BankMistake["status"], original: string, correction: string): BankMistake => ({
  id,
  language: "en",
  original,
  correction,
  category: "grammar",
  occurrences: 3,
  lastSeenAt: "2026-11-04T09:00:00",
  status,
});
const bank = [
  mistake("m1", "open", "Yesterday I finish the screen", "Yesterday I finished the screen"),
  mistake("m2", "open", "I'm waiting the keys", "I'm waiting for the keys"),
  mistake("m3", "improving", "on the next sprint", "in the next sprint"),
];

function renderPage(api: Partial<ApiClient>) {
  render(
    <ApiProvider value={api as ApiClient}>
      <MistakesPage now={now} />
    </ApiProvider>,
  );
}

describe("Mistakes", () => {
  it("shows open mistakes first, with a count per status", async () => {
    renderPage({ listMistakes: vi.fn().mockResolvedValue(bank) });

    expect(await screen.findByText("Yesterday I finish the screen")).toBeInTheDocument();
    expect(screen.getByText("Yesterday I finished the screen")).toBeInTheDocument();
    expect(screen.getAllByText("3× · 2 days ago")).toHaveLength(2);
    expect(screen.queryByText("on the next sprint")).toBeNull();
    expect(screen.getByRole("button", { name: "Open · 2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Improving · 1" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Mastered · 0" })).toBeInTheDocument();
  });

  it("filters by status", async () => {
    renderPage({ listMistakes: vi.fn().mockResolvedValue(bank) });
    await userEvent.click(await screen.findByRole("button", { name: "Improving · 1" }));
    expect(screen.getByText("on the next sprint")).toBeInTheDocument();
    expect(screen.queryByText("Yesterday I finish the screen")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Mastered · 0" }));
    expect(screen.getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("says when the bank is empty", async () => {
    renderPage({ listMistakes: vi.fn().mockResolvedValue([]) });
    expect(await screen.findByText("No mistakes yet")).toBeInTheDocument();
  });

  it("says when the mistakes can't load, and tries again", async () => {
    const listMistakes = vi.fn().mockRejectedValue(new ApiError("offline", "Can't reach the Voxa API."));
    renderPage({ listMistakes });
    expect(await screen.findByText("Can't load your mistakes")).toBeInTheDocument();

    listMistakes.mockResolvedValue(bank);
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Yesterday I finish the screen")).toBeInTheDocument();
  });

  it("removes a mistake the learner says isn't one, with the reason", async () => {
    const dismissMistake = vi.fn().mockResolvedValue(undefined);
    renderPage({ listMistakes: vi.fn().mockResolvedValue(bank), dismissMistake });

    await userEvent.click(await screen.findByRole("button", { name: /I'm waiting the keys/ }));
    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Open")).toBeInTheDocument();
    await userEvent.click(within(sheet).getByRole("button", { name: "This isn't a mistake" }));

    expect(within(sheet).getByRole("heading", { name: "Why isn't it a mistake?" })).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Remove from bank" })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: "Both ways are correct" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "Remove from bank" }));

    expect(dismissMistake).toHaveBeenCalledWith("m2", "both_correct");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("I'm waiting the keys")).toBeNull();
    expect(screen.getByRole("button", { name: "Open · 1" })).toBeInTheDocument();
  });

  it("keeps the mistake when removing it fails", async () => {
    const dismissMistake = vi.fn().mockRejectedValue(new ApiError("server", "Request failed (500)."));
    renderPage({ listMistakes: vi.fn().mockResolvedValue(bank), dismissMistake });

    await userEvent.click(await screen.findByRole("button", { name: /I'm waiting the keys/ }));
    await userEvent.click(screen.getByRole("button", { name: "This isn't a mistake" }));
    await userEvent.click(screen.getByRole("button", { name: "I don't need this one" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from bank" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't remove it. Try again.");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closes the sheet without changing anything", async () => {
    const dismissMistake = vi.fn();
    renderPage({ listMistakes: vi.fn().mockResolvedValue(bank), dismissMistake });
    await userEvent.click(await screen.findByRole("button", { name: /I'm waiting the keys/ }));
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(dismissMistake).not.toHaveBeenCalled();
  });

  it("closes the sheet with Escape", async () => {
    renderPage({ listMistakes: vi.fn().mockResolvedValue(bank) });
    await userEvent.click(await screen.findByRole("button", { name: /I'm waiting the keys/ }));
    expect(screen.getByRole("dialog")).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
