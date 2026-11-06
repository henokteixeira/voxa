import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { ApiProvider } from "./api-context";
import { routes } from "./router";

function renderApp(path: string, health: ApiClient["health"], { withLocale = false } = {}) {
  const api = { health, listMistakes: vi.fn().mockResolvedValue([]) } as unknown as ApiClient;
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const app = (
    <ApiProvider value={api}>
      <RouterProvider router={router} />
    </ApiProvider>
  );
  render(withLocale ? <LocaleProvider>{app}</LocaleProvider> : app);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

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

  it("opens a session full screen, without the tab bar, after the confidence check-in", async () => {
    const router = renderApp("/", up());
    await userEvent.click(await screen.findByRole("link", { name: "Start" }));
    expect(router.state.location.pathname).toBe("/session/daily/check-in");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
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

  it("says mistakes are welcome, Portuguese is fine and Voxa can be wrong too", async () => {
    renderApp("/", up());
    const welcome = screen.getByRole("region", { name: "Mistakes are welcome here" });
    expect(welcome).toHaveTextContent("Say it in Portuguese");
    expect(welcome).toHaveTextContent("Voxa makes mistakes too");
  });

  it("starts in Portuguese and switches the interface to English", async () => {
    renderApp("/", up(), { withLocale: true });
    expect(await screen.findByRole("link", { name: "Começar" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Aqui, errar faz parte" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Main" })).toHaveTextContent("HojeErrosProgresso");

    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("link", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.lang).toBe("en");
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
  });

  it("says sessions need a connection when offline, not that the server is down", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderApp("/", down());
    expect(await screen.findByText("Sessions need a connection")).toBeInTheDocument();
    expect(screen.queryByText("Voxa's server isn't running")).toBeNull();
  });

  it("says the server has a problem when it answers with an error", async () => {
    renderApp("/", vi.fn().mockRejectedValue(new ApiError("server", "Request failed (500).", 500)));
    expect(await screen.findByRole("heading", { name: "Voxa's server has a problem" })).toBeInTheDocument();
  });

  it("checks again when the connection comes back", async () => {
    const health = down();
    renderApp("/", health);
    await screen.findByRole("heading", { name: "Voxa's server isn't running" });
    health.mockResolvedValue({ status: "ok" });
    window.dispatchEvent(new Event("online"));
    expect(await screen.findByRole("link", { name: "Start" })).toBeInTheDocument();
  });
});
