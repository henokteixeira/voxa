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
  {
    withLocale = false,
    level = vi.fn().mockResolvedValue(placedB1),
    reviewOverview = vi.fn().mockResolvedValue({ due: [], nextDueAt: null }),
  }: { withLocale?: boolean; level?: ReturnType<typeof vi.fn>; reviewOverview?: ReturnType<typeof vi.fn> } = {},
) {
  const api = {
    health,
    endSession,
    level,
    practice: vi.fn().mockResolvedValue({ patterns: [], newWords: [], earlier: [] }),
    reviewOverview,
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
    await userEvent.click(await screen.findByRole("link", { name: /Daily stand-up/ }));
    expect(router.state.location.pathname).toBe("/session/daily");
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
  });
});

describe("Today", () => {
  it("asks what to practice, with nothing picked for the learner", async () => {
    renderApp("/", up());
    expect(await screen.findByRole("heading", { name: "What do you want to practice now?" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Good (morning|afternoon|evening)$/);
  });

  it("opens the onboarding on the first run, before there is a level", async () => {
    const router = renderApp("/", up(), { level: vi.fn().mockResolvedValue({ current: null, placementDue: true }) });
    await vi.waitFor(() => expect(router.state.location.pathname).toBe("/onboarding"));
  });

  it("after Do it later, stays on Today and offers the onboarding from Start", async () => {
    localStorage.setItem("voxa.onboardingSeen", "1");
    const router = renderApp("/", up(), { level: vi.fn().mockResolvedValue({ current: null, placementDue: true }) });
    expect(await screen.findByRole("heading", { name: "Let's start by finding your level" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Start" }));
    expect(router.state.location.pathname).toBe("/onboarding");
  });

  it("waits for the level before offering a session", async () => {
    renderApp("/", up(), { level: vi.fn(() => new Promise(() => {})) });
    await screen.findByRole("navigation", { name: "Practice categories" });
    expect(screen.queryByRole("heading", { name: "What do you want to practice now?" })).toBeNull();
  });

  it("offers the categories when the level can't be read", async () => {
    renderApp("/", up(), { level: vi.fn().mockRejectedValue(new ApiError("server", "boom")) });
    expect(await screen.findByRole("heading", { name: "What do you want to practice now?" })).toBeInTheDocument();
  });

  it("shows the voice review on Today only when something is due", async () => {
    const due = { due: [{ subject: { kind: "pattern", id: "p1" } }, { subject: { kind: "pattern", id: "p2" } }], nextDueAt: null };
    const router = renderApp("/", up(), { reviewOverview: vi.fn().mockResolvedValue(due) });
    await userEvent.click(await screen.findByRole("link", { name: /Review · 2 items/ }));
    expect(router.state.location.pathname).toBe("/review");
  });

  it("lists the everyday and work categories at the bottom, and each one starts its session", async () => {
    const router = renderApp("/", up());
    const categories = await screen.findByRole("navigation", { name: "Practice categories" });
    const everyday = within(categories).getByRole("region", { name: "Everyday" });
    expect(everyday).toHaveTextContent(/Free conversation.*Talk about your day.*Tell a story.*Give your opinion/);
    const work = within(categories).getByRole("region", { name: "Work" });
    expect(work).toHaveTextContent(/Daily stand-up.*Present your project.*Sprint review/);
    // The placement interview is not a category to practice.
    expect(categories).not.toHaveTextContent("Find your speaking level");
    await userEvent.click(within(everyday).getByRole("link", { name: /Tell a story/ }));
    expect(router.state.location.pathname).toBe("/session/story");
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
    expect(await screen.findByRole("heading", { name: "O que você quer treinar agora?" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Categorias de treino" })).toHaveTextContent("Contar uma história");
    expect(screen.getByRole("region", { name: "Aqui, errar faz parte" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Principal" })).toHaveTextContent("HojePraticarProgresso");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^(Bom dia|Boa tarde|Boa noite)$/);

    await userEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.getByRole("heading", { name: "What do you want to practice now?" })).toBeInTheDocument();
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
    expect(screen.queryByRole("navigation", { name: "Practice categories" })).toBeNull();

    health.mockResolvedValue({ status: "ok" });
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("navigation", { name: "Practice categories" })).toBeInTheDocument();
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
    expect(await screen.findByRole("navigation", { name: "Practice categories" })).toBeInTheDocument();
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
    expect(await screen.findByRole("heading", { name: "What do you want to practice now?" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue session" })).toBeNull();
    expect(endSession).toHaveBeenCalledWith("s1", timing);
    await vi.waitFor(() => expect(localStorage.getItem("voxa.liveSession")).toBeNull());
  });
});

