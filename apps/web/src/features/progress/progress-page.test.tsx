import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiProvider } from "@/app/api-context";
import type { ApiClient, LevelView, SignalsHistoryEntry } from "@/lib/api";
import { LocaleProvider } from "@/lib/i18n/locale-provider";
import { ProgressPage } from "./progress-page";

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

function renderProgress(api: Partial<ApiClient>, wrap: (node: ReactNode) => ReactNode = (n) => n) {
  render(
    wrap(
      <ApiProvider value={{ signalsHistory: vi.fn().mockResolvedValue({ sessions: [] }), ...api } as ApiClient}>
        <MemoryRouter>
          <ProgressPage />
        </MemoryRouter>
      </ApiProvider>,
    ),
  );
}

describe("Progress", () => {
  it("says progress comes from practice, not from getting it right", async () => {
    renderProgress({ level: vi.fn().mockRejectedValue(new Error("down")) });
    expect(screen.getByRole("heading", { name: "Progress" })).toBeInTheDocument();
    expect(await screen.findByText(/every session counts, mistakes included/)).toBeInTheDocument();
  });

  it("speaks Portuguese", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(placed) }, (n) => <LocaleProvider>{n}</LocaleProvider>);
    expect(screen.getByRole("heading", { name: "Progresso" })).toBeInTheDocument();
    expect(await screen.findByText(/toda sessão conta, com erros e tudo/)).toBeInTheDocument();
    expect(await screen.findByText("Nível A2")).toBeInTheDocument();
    expect(screen.getByText(/não uma nota/)).toBeInTheDocument();
  });

  it("shows the level with the learner's own lines, as an estimate", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(placed) });
    const card = await screen.findByRole("region", { name: "Your speaking level" });
    expect(card).toHaveTextContent("Level A2");
    expect(card).toHaveTextContent("From the placement interview");
    expect(card).toHaveTextContent("“Yesterday I fix one bug in the upload”");
    expect(card).toHaveTextContent("An estimate, not a grade");
    expect(screen.getByRole("link", { name: "Do the placement again" })).toHaveAttribute("href", "/session/placement");
  });

  it("invites a placement when there is no level yet", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue({ current: null, placementDue: true }) });
    expect(await screen.findByRole("link", { name: "Start the conversation" })).toHaveAttribute("href", "/session/placement");
  });

  it("lets the learner set a level by hand when there is none", async () => {
    const setLevel = vi.fn().mockResolvedValue({ ...placed, current: { ...placed.current!, source: "manual" } });
    renderProgress({ level: vi.fn().mockResolvedValue({ current: null, placementDue: true }), setLevel });
    await userEvent.click(await screen.findByRole("button", { name: "Or set it by hand" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Level" }), "A2");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setLevel).toHaveBeenCalledWith("A2");
    expect(await screen.findByText("Level A2")).toBeInTheDocument();
  });

  it("says when the level can't be loaded and tries again", async () => {
    const level = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue(placed);
    renderProgress({ level });
    expect(await screen.findByText("Couldn't load your level")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Level A2")).toBeInTheDocument();
  });

  it("says when a new placement is due", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue({ ...placed, placementDue: true }) });
    expect(await screen.findByText(/It's been 4 weeks/)).toBeInTheDocument();
  });

  it("lets the learner adjust the level by hand", async () => {
    const setLevel = vi.fn().mockResolvedValue({
      ...placed,
      current: { ...placed.current!, level: "B1", source: "manual", evidence: [] },
    });
    renderProgress({ level: vi.fn().mockResolvedValue(placed), setLevel });
    await userEvent.click(await screen.findByRole("button", { name: "Adjust the level" }));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Level" }), "B1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(setLevel).toHaveBeenCalledWith("B1");
    expect(await screen.findByText("Level B1")).toBeInTheDocument();
    expect(screen.getByText(/Set by you/)).toBeInTheDocument();
  });

  it("says when the level could not be saved", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(placed), setLevel: vi.fn().mockRejectedValue(new Error("down")) });
    await userEvent.click(await screen.findByRole("button", { name: "Adjust the level" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save");
  });

  afterEach(() => localStorage.clear());

  const goingUp: LevelView = { ...placed, proposal: { direction: "up", to: "B1", basedOn: "s7" } };

  it("proposes a step change the learner confirms", async () => {
    const confirmStepChange = vi.fn().mockResolvedValue({
      ...placed,
      current: { ...placed.current!, level: "B1", source: "step_change", evidence: [] },
      proposal: null,
    });
    renderProgress({ level: vi.fn().mockResolvedValue(goingUp), confirmStepChange });
    const proposal = await screen.findByRole("region", { name: "Ready for B1?" });
    expect(proposal).toHaveTextContent("at least 8 in 10 of your answers needed no help");
    await userEvent.click(screen.getByRole("button", { name: "Move to B1" }));
    expect(confirmStepChange).toHaveBeenCalledWith("B1");
    expect(await screen.findByText("Level B1")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ready for B1?" })).toBeNull();
  });

  it("hides a proposal after Not now, until the proposal changes", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(goingUp) });
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(screen.queryByRole("region", { name: "Ready for B1?" })).toBeNull();
    expect(localStorage.getItem("voxa.stepChangeDismissed")).toBe("s7:up:B1");
  });

  const entry = (day: number, unaidedShare: number | null, wordsPerMinute: number | null): SignalsHistoryEntry => ({
    sessionId: `s${day}`,
    mode: "daily",
    recordedAt: `2026-11-0${day}T10:00:00Z`,
    signals: {
      unaidedShare,
      wordsPerMinute,
      longPausesPerMinute: null,
      averagePauseMs: null,
      mistakesPer100Words: null,
      selfCorrectionRate: null,
    },
  });

  it("shows each signal over the last sessions, with the newest value", async () => {
    const signalsHistory = vi.fn().mockResolvedValue({ sessions: [entry(5, 0.5, 60), entry(6, 0.75, null), entry(7, 0.8, 72)] });
    renderProgress({ level: vi.fn().mockResolvedValue(placed), signalsHistory });
    const history = await screen.findByRole("region", { name: "Your last 3 sessions" });
    expect(screen.getByRole("img", { name: "Answers without help, oldest to newest: 50%, 75%, 80%" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Pace (words a minute), oldest to newest: 60, 72" })).toBeInTheDocument();
    expect(history).toHaveTextContent("Long pauses a minute");
    expect(history).toHaveTextContent("not measured");

    expect(screen.queryByText("Nothing to show yet")).toBeNull();
  });

  it("says a signal measured in one session has no line yet, and still shows its value", async () => {
    const newest = entry(7, 0.8, 72);
    newest.signals.averagePauseMs = 1500;
    renderProgress({ level: vi.fn().mockResolvedValue(placed), signalsHistory: vi.fn().mockResolvedValue({ sessions: [entry(6, 0.5, 60), newest] }) });
    const row = (await screen.findByText("Pause before answering")).closest("li");
    expect(row).toHaveTextContent("1 session so far");
    expect(row).toHaveTextContent("1.5 s");
  });

  it("keeps the empty state with a single session", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(placed), signalsHistory: vi.fn().mockResolvedValue({ sessions: [entry(5, 0.5, 60)] }) });
    expect(await screen.findByText("Nothing to show yet")).toBeInTheDocument();
  });

  it("says when the signals can't be read", async () => {
    renderProgress({ level: vi.fn().mockResolvedValue(placed), signalsHistory: vi.fn().mockRejectedValue(new Error("down")) });
    expect(await screen.findByText("Couldn't load your signals")).toBeInTheDocument();
  });
});
