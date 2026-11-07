import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ApiClient } from "@/lib/api";
import { ApiError } from "@/lib/api";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { readPauseMs } from "@/lib/voice/pause-setting";
import { ApiProvider } from "./api-context";
import { routes } from "./router";

const endSession = vi.fn().mockResolvedValue({});

const placedB1 = {
  current: { language: "en", level: "B1", source: "placement", evidence: [], assessedAt: "2026-11-07T10:00:00Z", step: "supported" },
  placementDue: false,
};

function renderApp(
  path: string,
  health: ApiClient["health"],
  { withLocale = false, level = vi.fn().mockResolvedValue(placedB1) }: { withLocale?: boolean; level?: ReturnType<typeof vi.fn> } = {},
) {
  const api = {
    health,
    endSession,
    level,
    listMistakes: vi.fn().mockResolvedValue([]),
    todayProgress: vi.fn().mockResolvedValue(today(30)),
    signalsHistory: vi.fn().mockResolvedValue({ sessions: [] }),
    setDailyMinutes: vi.fn().mockImplementation(async (minutes: number) => today(minutes)),
  } as unknown as ApiClient;
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

function today(minutesPerDay: number) {
  return { day: "2026-11-07", minutesPerDay, goalXp: 40, earnedXp: 0, goalMet: false, streakDays: 0, points: {} };
}

const up = () => vi.fn().mockResolvedValue({ status: "ok" });
const down = () => vi.fn().mockRejectedValue(new ApiError("offline", "Can't reach the Voxa API."));

describe("app shell", () => {
  it("shows three tabs with Today active", async () => {
    renderApp("/", up());
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav).toHaveTextContent("TodayPracticeProgress");
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
  });

  it("moves between tabs", async () => {
    renderApp("/", up());
    await userEvent.click(screen.getByRole("link", { name: "Practice" }));
    expect(screen.getByRole("heading", { name: "Practice" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Practice" })).toHaveAttribute("aria-current", "page");
  });

  it("slides the active-tab indicator to the tab you pick", async () => {
    renderApp("/", up());
    const indicator = screen.getByTestId("tab-indicator");
    expect(indicator.style.transform).toBe("translateX(0%)");
    await userEvent.click(screen.getByRole("link", { name: "Progress" }));
    expect(indicator.style.transform).toBe("translateX(200%)");
  });

  it("keeps the indicator on a path with a trailing slash", async () => {
    renderApp("/progress/", up());
    expect(screen.getByTestId("tab-indicator").style.transform).toBe("translateX(200%)");
  });

  it("uses a side column instead of the bottom tab bar on wide screens", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({ matches: true, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    try {
      renderApp("/mistakes", up());
      expect(screen.getByRole("banner")).toHaveTextContent("Voxa");
      expect(screen.getAllByRole("navigation")).toHaveLength(1);
      expect(screen.getByTestId("tab-indicator").style.transform).toBe("translateY(100%)");
    } finally {
      vi.unstubAllGlobals();
    }
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

  it("starts with the onboarding, which leads to the placement interview, before there is a level", async () => {
    const router = renderApp("/", up(), { level: vi.fn().mockResolvedValue({ current: null, placementDue: true }) });
    expect(await screen.findByRole("heading", { name: "Let's start by finding your level" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Start" }));
    expect(router.state.location.pathname).toBe("/onboarding");
  });

  it("waits for the level before offering a session", async () => {
    renderApp("/", up(), { level: vi.fn(() => new Promise(() => {})) });
    await screen.findByRole("button", { name: "Other practice" });
    expect(screen.queryByRole("link", { name: "Start" })).toBeNull();
  });

  it("offers the daily when the level can't be read", async () => {
    renderApp("/", up(), { level: vi.fn().mockRejectedValue(new ApiError("server", "boom")) });
    expect(await screen.findByRole("heading", { name: "Your first session is ready" })).toBeInTheDocument();
  });

  it("keeps other practice in a sheet, not in a list under the fold", async () => {
    const router = renderApp("/", up());
    await userEvent.click(await screen.findByRole("button", { name: "Other practice" }));
    const sheet = screen.getByRole("dialog", { name: "Other practice" });
    expect(sheet).toHaveTextContent("Present your project");
    expect(sheet).toHaveTextContent("Sprint review");
    // The placement interview is not a meeting to practice.
    expect(sheet).not.toHaveTextContent("Find your speaking level");
    await userEvent.click(screen.getByRole("link", { name: /Sprint review/ }));
    expect(router.state.location.pathname).toBe("/session/review");
  });

  it("says mistakes are welcome, Portuguese is fine and Voxa can be wrong too", async () => {
    renderApp("/", up());
    const welcome = screen.getByRole("region", { name: "Mistakes are welcome here" });
    expect(welcome).toHaveTextContent("Say it in Portuguese");
    expect(welcome).toHaveTextContent("Voxa's AI makes mistakes too");
  });

  it("keeps the welcome card when the server is down or the browser is offline", async () => {
    renderApp("/", down());
    expect(await screen.findByRole("heading", { name: "Voxa's server isn't running" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Mistakes are welcome here" })).toBeInTheDocument();
    cleanup();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderApp("/", up());
    expect(screen.getByRole("region", { name: "Mistakes are welcome here" })).toBeInTheDocument();
  });

  it("starts in Portuguese and switches the interface to English", async () => {
    renderApp("/", up(), { withLocale: true });
    expect(await screen.findByRole("link", { name: "Começar" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Aqui, errar faz parte" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toHaveTextContent("HojePraticarProgresso");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^(Bom dia|Boa tarde|Boa noite)$/);

    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("link", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.lang).toBe("en");
  });

  it("lets you choose how long a pause can be before your turn is sent", async () => {
    renderApp("/", up());
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const pause = within(screen.getByRole("dialog", { name: "Settings" })).getByRole("group", {
      name: "Pause before Voxa answers",
    });
    expect(within(pause).getByRole("button", { name: "2.5 s" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(pause).getByRole("button", { name: "4 s" }));
    expect(within(pause).getByRole("button", { name: "4 s" })).toHaveAttribute("aria-pressed", "true");
    expect(within(pause).getByRole("button", { name: "2.5 s" })).toHaveAttribute("aria-pressed", "false");
    expect(readPauseMs()).toBe(4000);
  });

  it("lets you choose the practice time a day, which sets the daily goal", async () => {
    renderApp("/", up());
    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    const daily = within(screen.getByRole("dialog", { name: "Settings" })).getByRole("group", { name: "Practice time a day" });
    expect(await within(daily).findByRole("button", { name: "30 min" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(within(daily).getByRole("button", { name: "45 min" }));
    expect(await within(daily).findByRole("button", { name: "45 min" })).toHaveAttribute("aria-pressed", "true");
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

describe("a paused session on Today", () => {
  const timing = { learnerSpeechMs: 4000, tutorSpeechMs: 6000, pausesMs: [800], longPausesMs: [], spokenWords: 10 };
  const save = (minutesAgo: number) =>
    localStorage.setItem(
      "voxa.liveSession",
      JSON.stringify({ sessionId: "s1", mode: "review", elapsedSeconds: 185, timing, savedAt: Date.now() - minutesAgo * 60_000 }),
    );

  it("offers to continue a session left less than 2 hours ago", async () => {
    save(119);
    renderApp("/", up());
    const link = await screen.findByRole("link", { name: "Continue session" });
    expect(link).toHaveAttribute("href", "/session/review");
    expect(screen.getByText(/3:05/)).toBeInTheDocument();
    expect(endSession).not.toHaveBeenCalled();
  });

  it("ends a session left more than 2 hours ago, keeping its summary, and offers a new one", async () => {
    endSession.mockClear();
    save(121);
    renderApp("/", up());
    expect(await screen.findByRole("link", { name: "Start" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue session" })).toBeNull();
    expect(endSession).toHaveBeenCalledWith("s1", timing);
    await vi.waitFor(() => expect(localStorage.getItem("voxa.liveSession")).toBeNull());
  });
});

