import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { ApiProvider } from "./api-context";
import { routes } from "./router";

function renderApp(path: string, health: ApiClient["health"]) {
  const api = { health, listMistakes: vi.fn().mockResolvedValue([]) } as unknown as ApiClient;
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ApiProvider value={api}>
      <RouterProvider router={router} />
    </ApiProvider>,
  );
  return router;
}

const up = () => vi.fn().mockResolvedValue({ status: "ok" });
const down = () => vi.fn().mockRejectedValue(new ApiError("offline", "Can't reach the Voxa API."));

describe("app shell", () => {
  it("shows three tabs with Today active", async () => {
    renderApp("/", up());
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveTextContent("TodayMistakesProgress");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  it("moves between tabs", async () => {
    renderApp("/", up());
    await userEvent.click(screen.getByRole("link", { name: "Mistakes" }));
    expect(screen.getByRole("heading", { name: "Mistakes" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mistakes" })).toHaveAttribute("aria-current", "page");
  });

  it("opens a session full screen, without the tab bar", async () => {
    const router = renderApp("/", up());
    await userEvent.click(await screen.findByRole("link", { name: "Start" }));
    expect(router.state.location.pathname).toBe("/session/daily");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});

describe("Today", () => {
  it("offers one session to start when the API is up", async () => {
    renderApp("/", up());
    expect(await screen.findByRole("link", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening)$/);
  });

  it("says the server isn't running and lets you check again", async () => {
    const health = down();
    renderApp("/", health);

    expect(await screen.findByRole("heading", { name: "Voxa's server isn't running" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start" })).toBeNull();

    health.mockResolvedValue({ status: "ok" });
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("link", { name: "Start" })).toBeInTheDocument();
    expect(health).toHaveBeenCalledTimes(2);
  });

  it("shows a banner when the browser is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderApp("/", up());
    expect(screen.getByRole("status")).toHaveTextContent("You're offline");
    vi.restoreAllMocks();
  });
});
