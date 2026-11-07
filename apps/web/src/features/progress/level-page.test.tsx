import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import { routes } from "@/app/router";
import type { ApiClient, LevelView } from "@/lib/api";

const placed: LevelView = {
  current: {
    language: "en",
    level: "A2",
    source: "placement",
    evidence: ["Yesterday I fix one bug in the upload"],
    assessedAt: "2026-11-07T10:00:00Z",
    step: "build_light",
  },
  placementDue: false,
};

function renderLevel(api: Partial<ApiClient>) {
  const router = createMemoryRouter(routes, { initialEntries: ["/progress/level"] });
  const full = { signalsHistory: vi.fn().mockResolvedValue({ sessions: [] }), todayProgress: vi.fn().mockRejectedValue(new Error("n/a")), ...api };
  render(
    <ApiProvider value={full as unknown as ApiClient}>
      <RouterProvider router={router} />
    </ApiProvider>,
  );
  return router;
}

describe("Why A2?", () => {
  it("shows the learner's own lines, what they can do and the next step, as an estimate", async () => {
    renderLevel({ level: vi.fn().mockResolvedValue(placed) });
    expect(await screen.findByRole("heading", { name: "What the tutor noticed" })).toHaveFocus();
    expect(screen.getByText("“Yesterday I fix one bug in the upload”")).toBeInTheDocument();
    expect(screen.getByText(/routine and your work in short sentences/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Next step (B1)" })).toBeInTheDocument();
    expect(screen.getByText(/An estimate, not a test/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Redo the level chat" })).toHaveAttribute("href", "/session/placement");
  });

  it("changes the level by hand in a sheet", async () => {
    const setLevel = vi.fn().mockResolvedValue({ ...placed, current: { ...placed.current!, level: "B1", source: "manual" } });
    renderLevel({ level: vi.fn().mockResolvedValue(placed), setLevel });
    await userEvent.click(await screen.findByRole("button", { name: "Change my level" }));
    expect(screen.getByRole("radio", { name: "A2 · guided, light" })).toHaveAttribute("aria-checked", "true");
    await userEvent.click(screen.getByRole("radio", { name: "B1 · talk, a start when stuck" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setLevel).toHaveBeenCalledWith("B1");
    expect(await screen.findByRole("heading", { name: "Next step (B2)" })).toBeInTheDocument();
  });

  it("says when the level could not be saved, and keeps the sheet open", async () => {
    renderLevel({ level: vi.fn().mockResolvedValue(placed), setLevel: vi.fn().mockRejectedValue(new Error("down")) });
    await userEvent.click(await screen.findByRole("button", { name: "Change my level" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save");
    expect(screen.getByRole("dialog", { name: "Your speaking level" })).toBeInTheDocument();
  });

  it("goes back to Progress without a level to explain", async () => {
    const router = renderLevel({ level: vi.fn().mockResolvedValue({ current: null, placementDue: true }) });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/progress"));
  });
});
